#!/usr/bin/env node
import { statSync } from 'node:fs';
import { defineCommand, runMain } from 'citty';
import { downloadHls, getStreamInfo, parseSiteId, Recorder } from '../src/index.js';
import { tmuxStart, tmuxStop, tmuxStatus } from '../src/tmux.js';

// Tokrec-style colored tags
const tag = {
  info: '\x1b[1;34m[INFO]\x1b[0m ',
  live: '\x1b[1;32m[LIVE]\x1b[0m ',
  off: '\x1b[1;34m[OFF]\x1b[0m ',
  ok: '\x1b[1;32m[OK]\x1b[0m ',
  done: '\x1b[1;32m[DONE]\x1b[0m ',
  warn: '\x1b[1;33m[WARN]\x1b[0m ',
  err: '\x1b[1;31m[ERR]\x1b[0m ',
};

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function humanDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const infoCmd = defineCommand({
  meta: { name: 'info', description: 'Get stream info for a Bigo room' },
  args: {
    url: { type: 'positional', description: 'Bigo room URL or siteId', required: true },
  },
  async run({ args }) {
    const siteId = parseSiteId(args.url);
    const stream = await getStreamInfo(siteId);

    if (stream.alive && stream.hlsSrc) {
      console.log(`${tag.live} @${stream.nickName} (${stream.siteId})`);
      if (stream.roomTopic) console.log(`  ${stream.roomTopic}`);
      console.log(`  ${stream.hlsSrc}`);
    } else {
      console.log(`${tag.off} @${stream.nickName} (${stream.siteId}) is offline`);
    }
  },
});

const downloadCmd = defineCommand({
  meta: { name: 'download', description: 'Download current live stream' },
  args: {
    url: { type: 'positional', description: 'Bigo room URL or siteId', required: true },
    output: { type: 'string', description: 'Output file path', alias: 'o' },
    concurrency: { type: 'string', description: 'Download concurrency', alias: 'c', default: '4' },
  },
  async run({ args }) {
    const siteId = parseSiteId(args.url);
    const stream = await getStreamInfo(siteId);

    if (!stream.alive || !stream.hlsSrc) {
      console.log(`${tag.err} Stream is not live`);
      process.exit(1);
    }

    console.log(`${tag.live} @${stream.nickName} (${stream.siteId})`);
    const start = Date.now();
    const outputPath = await downloadHls(stream.hlsSrc, {
      output: args.output,
      concurrency: parseInt(args.concurrency, 10),
    });
    const elapsed = (Date.now() - start) / 1000;
    const { size } = statSync(outputPath);
    console.log(`${tag.done} ${outputPath} — ${humanSize(size)} in ${humanDuration(elapsed)}`);
  },
});

const recordCmd = defineCommand({
  meta: { name: 'record', description: 'Auto-record when stream goes live' },
  args: {
    url: { type: 'positional', description: 'Bigo room URL or siteId', required: true },
    output: { type: 'string', description: 'Output file path', alias: 'o' },
    outputDir: {
      type: 'string',
      description: 'Output directory',
      alias: 'd',
      default: './recordings',
    },
    pollInterval: {
      type: 'string',
      description: 'Poll interval when live (seconds, offline=3min)',
      alias: 'p',
      default: '30',
    },
    maxDuration: {
      type: 'string',
      description: 'Max duration (seconds, 0=unlimited)',
      alias: 'm',
      default: '0',
    },
  },
  async run({ args }) {
    const pollInterval = parseInt(args.pollInterval, 10);
    const offlineInterval = 3 * 60; // matches recorder's offline interval
    console.log(`${tag.info} Polling every ${offlineInterval / 60}min (offline) / ${pollInterval}s (live)`);

    const recorder = new Recorder(args.url, {
      output: args.output,
      outputDir: args.outputDir,
      pollInterval,
      maxDuration: parseInt(args.maxDuration, 10),
    });

    let countdownTimer: ReturnType<typeof setInterval> | undefined;

    function startCountdown(seconds: number) {
      let remaining = seconds;
      const tick = () => {
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        const time = m > 0 ? `${m}m ${s}s` : `${s}s`;
        process.stdout.write(`\r${tag.off} Offline — checking in ${time}  `);
        remaining--;
        if (remaining < 0) {
          clearInterval(countdownTimer);
          process.stdout.write('\r' + ' '.repeat(60) + '\r');
          process.stdout.write(`${tag.info} Checking...\r`);
        }
      };
      tick();
      countdownTimer = setInterval(tick, 1000);
    }

    function stopCountdown() {
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = undefined;
      }
      process.stdout.write('\r' + ' '.repeat(60) + '\r');
    }

    recorder.on('live', (info) => {
      stopCountdown();
      console.log(`${tag.live} @${info.nickName} (${info.siteId})`);
    });
    recorder.on('offline', () => {
      stopCountdown();
      startCountdown(offlineInterval);
    });
    recorder.on('recording', (path) => {
      stopCountdown();
      console.log(`${tag.info} Recording to ${path}`);
    });
    recorder.on('progress', (segments) => {
      process.stdout.write(`\r${tag.info} Segments: ${segments}`);
    });
    recorder.on('error', (err) => {
      stopCountdown();
      console.log(`\n${tag.err} ${err.message}`);
    });

    process.on('SIGINT', () => {
      stopCountdown();
      console.log(`\n${tag.info} Shutting down...`);
      recorder.stop();
    });

    try {
      await recorder.start();
    } catch (error) {
      stopCountdown();
      console.log(`${tag.err} ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  },
});

const startCmd = defineCommand({
  meta: { name: 'start', description: 'Start recording in a tmux session (survives terminal close)' },
  args: {
    url: { type: 'positional', description: 'Bigo room URL or siteId', required: true },
    output: { type: 'string', description: 'Output file path', alias: 'o' },
    outputDir: { type: 'string', description: 'Output directory', alias: 'd', default: './recordings' },
    pollInterval: { type: 'string', description: 'Poll interval when live (seconds)', alias: 'p', default: '30' },
    maxDuration: { type: 'string', description: 'Max duration (seconds, 0=unlimited)', alias: 'm', default: '0' },
  },
  run({ args }) {
    const siteId = parseSiteId(args.url);
    const cmd = `bigorec record ${args.url} -d ${args.outputDir} -p ${args.pollInterval} -m ${args.maxDuration}`;
    try {
      tmuxStart(siteId, cmd);
      console.log(`${tag.ok} Session "bigorec-${siteId}" started in background`);
      console.log(`  tmux attach -t bigorec-${siteId}   — view live output`);
      console.log(`  bigorec stop ${siteId}             — stop recording`);
    } catch (err) {
      console.log(`${tag.err} ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  },
});

const stopCmd = defineCommand({
  meta: { name: 'stop', description: 'Stop background tmux session(s)' },
  args: {
    siteId: { type: 'string', description: 'Site ID (omit to stop all)', alias: 'u' },
  },
  run({ args }) {
    const siteId = args.siteId || undefined;
    try {
      tmuxStop(siteId);
      if (siteId) {
        console.log(`${tag.ok} Session "bigorec-${siteId}" stopped`);
      } else {
        console.log(`${tag.ok} All bigorec sessions stopped`);
      }
    } catch (err) {
      console.log(`${tag.err} ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  },
});

const statusCmd = defineCommand({
  meta: { name: 'status', description: 'Check tmux session(s)' },
  args: {
    siteId: { type: 'string', description: 'Site ID (omit to show all)', alias: 'u' },
  },
  run({ args }) {
    const siteId = args.siteId || undefined;
    const sessions = tmuxStatus(siteId);
    if (sessions.length === 0) {
      console.log(`${tag.info} No active sessions`);
      return;
    }
    for (const s of sessions) {
      console.log(`${tag.live} bigorec-${s.siteId}`);
      console.log(`  tmux attach -t ${s.session}   — view live output`);
    }
  },
});

const main = defineCommand({
  meta: { name: 'bigorec', description: 'Download and record Bigo Live streams' },
  subCommands: { info: infoCmd, download: downloadCmd, record: recordCmd, start: startCmd, stop: stopCmd, status: statusCmd },
});

runMain(main);
