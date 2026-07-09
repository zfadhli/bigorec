import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { downloadHlsWithFfmpeg } from './ffmpeg.js';

export interface DownloadOptions {
  /** Output file path (default: stream_{timestamp}.ts) */
  output?: string;
}

/** Download an HLS stream to file using ffmpeg */
export async function downloadHls(m3u8Url: string, options: DownloadOptions = {}): Promise<string> {
  const outPath = options.output || `stream_${Date.now()}.ts`;
  await mkdir(dirname(outPath), { recursive: true });
  return downloadHlsWithFfmpeg(m3u8Url, outPath);
}

/** Download a live HLS stream using ffmpeg (aborts via signal) */
export async function downloadLiveHls(
  m3u8Url: string,
  outputPath: string,
  options: {
    signal?: AbortSignal;
    timeout?: number;
    onSegment?: (count: number) => void;
  } = {},
): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await downloadHlsWithFfmpeg(m3u8Url, outputPath, {
    signal: options.signal,
    timeout: options.timeout,
  });
}
