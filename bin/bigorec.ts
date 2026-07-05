#!/usr/bin/env node
import { defineCommand, runMain } from 'citty'
import { parseSiteId, getStreamInfo, downloadHls, Recorder } from '../src/index.js'
import { statSync } from 'node:fs'

// tokrec-style colored tags
const tag = {
  info: '\x1b[1;34m[INFO]\x1b[0m ',
  live: '\x1b[1;32m[LIVE]\x1b[0m ',
  off: '\x1b[1;34m[OFF]\x1b[0m ',
  ok: '\x1b[1;32m[OK]\x1b[0m ',
  done: '\x1b[1;32m[DONE]\x1b[0m ',
  warn: '\x1b[1;33m[WARN]\x1b[0m ',
  err: '\x1b[1;31m[ERR]\x1b[0m ',
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

function humanDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

const info = defineCommand({
  meta: { name: 'info', description: 'Get stream info for a Bigo room' },
  args: {
    url: { type: 'positional', description: 'Bigo room URL or siteId', required: true },
  },
  async run({ args }) {
    const siteId = parseSiteId(args.url)
    const stream = await getStreamInfo(siteId)

    if (stream.alive && stream.hlsSrc) {
      console.log(`${tag.live} @${stream.nickName} (${stream.siteId})`)
      if (stream.roomTopic) console.log(`  ${stream.roomTopic}`)
      console.log(`  ${stream.hlsSrc}`)
    } else {
      console.log(`${tag.off} @${stream.nickName} (${stream.siteId}) is offline`)
    }
  },
})

const download = defineCommand({
  meta: { name: 'download', description: 'Download current live stream' },
  args: {
    url: { type: 'positional', description: 'Bigo room URL or siteId', required: true },
    output: { type: 'string', description: 'Output file path', alias: 'o' },
    concurrency: { type: 'string', description: 'Download concurrency', alias: 'c', default: '4' },
  },
  async run({ args }) {
    const siteId = parseSiteId(args.url)
    const stream = await getStreamInfo(siteId)

    if (!stream.alive || !stream.hlsSrc) {
      console.log(`${tag.err} Stream is not live`)
      process.exit(1)
    }

    console.log(`${tag.live} @${stream.nickName} (${stream.siteId})`)
    const start = Date.now()
    const outputPath = await downloadHls(stream.hlsSrc, {
      output: args.output,
      concurrency: parseInt(args.concurrency),
    })
    const elapsed = (Date.now() - start) / 1000
    const size = statSync(outputPath).size
    console.log(`${tag.done} ${outputPath} — ${humanSize(size)} in ${humanDuration(elapsed)}`)
  },
})

const record = defineCommand({
  meta: { name: 'record', description: 'Auto-record when stream goes live' },
  args: {
    url: { type: 'positional', description: 'Bigo room URL or siteId', required: true },
    output: { type: 'string', description: 'Output file path', alias: 'o' },
    outputDir: { type: 'string', description: 'Output directory', alias: 'd', default: './recordings' },
    pollInterval: { type: 'string', description: 'Poll interval when live (seconds, offline=3min)', alias: 'p', default: '30' },
    maxDuration: { type: 'string', description: 'Max duration (seconds, 0=unlimited)', alias: 'm', default: '0' },
  },
  async run({ args }) {
    const siteId = parseSiteId(args.url)
    console.log(`${tag.info} Polling every ${args.pollInterval}s`)

    const recorder = new Recorder(args.url, {
      output: args.output,
      outputDir: args.outputDir,
      pollInterval: parseInt(args.pollInterval),
      maxDuration: parseInt(args.maxDuration),
    })

    recorder.on('live', (info) => {
      console.log(`${tag.live} @${info.nickName} (${info.siteId})`)
    })
    recorder.on('offline', () => {
      console.log(`\n${tag.off} Stream ended`)
    })
    recorder.on('recording', (path) => {
      console.log(`${tag.info} Recording to ${path}`)
    })
    recorder.on('progress', (segments) => {
      process.stdout.write(`\r${tag.info} Segments: ${segments}`)
    })
    recorder.on('error', (err) => {
      console.log(`\n${tag.err} ${err.message}`)
    })

    process.on('SIGINT', () => {
      console.log(`\n${tag.info} Shutting down...`)
      recorder.stop()
    })

    try {
      await recorder.start()
    } catch (err) {
      console.log(`${tag.err} ${err instanceof Error ? err.message : err}`)
      process.exit(1)
    }
  },
})

const main = defineCommand({
  meta: { name: 'bigorec', description: 'Download and record Bigo Live streams' },
  subCommands: { info, download, record },
})

runMain(main)
