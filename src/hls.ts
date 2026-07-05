import { writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { DownloadOptions } from './types.js'

interface M3u8Segment {
  uri: string
  duration: number
}

/** Parse a basic m3u8 playlist (handles #EXTINF lines + URIs) */
function parseM3u8(content: string, baseUrl: string): M3u8Segment[] {
  const lines = content.split('\n').map(l => l.trim())
  const segments: M3u8Segment[] = []

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('#EXTINF:')) {
      const duration = parseFloat(lines[i].split(':')[1]) || 0
      const uri = lines[i + 1]
      if (uri && !uri.startsWith('#')) {
        // Resolve relative URLs
        const fullUrl = uri.startsWith('http') ? uri : new URL(uri, baseUrl).href
        segments.push({ uri: fullUrl, duration })
      }
    }
  }

  return segments
}

/** Fetch m3u8 content (may need multiple fetches for live playlists) */
async function fetchM3u8(url: string, timeout: number): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    if (!res.ok) throw new Error(`Failed to fetch m3u8: ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

/** Download a single segment */
async function downloadSegment(
  url: string,
  timeout: number,
): Promise<Buffer> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    if (!res.ok) throw new Error(`Segment download failed: ${res.status}`)
    const arrayBuffer = await res.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } finally {
    clearTimeout(timer)
  }
}

/** Download all segments with concurrency limit */
async function downloadSegments(
  segments: M3u8Segment[],
  concurrency: number,
  timeout: number,
  onProgress?: (bytes: number) => void,
): Promise<Buffer[]> {
  const results: Buffer[] = new Array(segments.length)
  let index = 0

  async function worker() {
    while (index < segments.length) {
      const i = index++
      const buf = await downloadSegment(segments[i].uri, timeout)
      results[i] = buf
      onProgress?.(buf.length)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, segments.length) }, () => worker()))
  return results
}

/** Download an HLS stream and save to file */
export async function downloadHls(
  m3u8Url: string,
  options: DownloadOptions = {},
): Promise<string> {
  const {
    output,
    concurrency = 4,
    timeout = 30_000,
  } = options

  // Fetch playlist
  const content = await fetchM3u8(m3u8Url, timeout)
  const segments = parseM3u8(content, m3u8Url)

  if (segments.length === 0) {
    throw new Error('No segments found in m3u8 playlist')
  }

  // Calculate total duration
  const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0)

  // Download all segments
  const buffers = await downloadSegments(segments, concurrency, timeout)

  // Merge into single buffer
  const merged = Buffer.concat(buffers)

  // Determine output path
  const outPath = output || `stream_${Date.now()}.ts`
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, merged)

  return outPath
}

/** Download a live HLS stream (continuously fetches new segments) */
export async function downloadLiveHls(
  m3u8Url: string,
  outputPath: string,
  options: {
    concurrency?: number
    timeout?: number
    onSegment?: (count: number) => void
    signal?: AbortSignal
  } = {},
): Promise<void> {
  const {
    concurrency = 4,
    timeout = 30_000,
    onSegment,
    signal,
  } = options

  await mkdir(dirname(outputPath), { recursive: true })
  const { createWriteStream } = await import('node:fs')
  const stream = createWriteStream(outputPath)

  let segmentCount = 0
  const seen = new Set<string>()

  try {
    while (!signal?.aborted) {
      const content = await fetchM3u8(m3u8Url, timeout)
      const segments = parseM3u8(content, m3u8Url)

      // Only download new segments
      const newSegments = segments.filter(s => !seen.has(s.uri))
      if (newSegments.length === 0) {
        // Wait before retrying playlist fetch
        await sleep(1000)
        continue
      }

      const buffers = await downloadSegments(newSegments, concurrency, timeout)
      for (const buf of buffers) {
        stream.write(buf)
        segmentCount++
        onSegment?.(segmentCount)
      }

      newSegments.forEach(s => seen.add(s.uri))

      // Brief pause before next playlist fetch
      await sleep(500)
    }
  } finally {
    stream.end()
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
