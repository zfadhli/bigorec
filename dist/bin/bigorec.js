#!/usr/bin/env node

// bin/bigorec.ts
import { defineCommand, runMain } from "citty";

// src/api.ts
var API_URL = "https://ta.bigo.tv/official_website/studio/getInternalStudioInfo";
function parseSiteId(input) {
  const match = input.match(/bigo\.tv(?:\/[a-z]{2,})?\/([^/?#]+)/i);
  return match ? match[1] : input.trim();
}
async function getStreamInfo(siteId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1e4);
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Accept": "application/json" },
      body: new URLSearchParams({ siteId, verify: "" }),
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const json = await res.json();
    if (json.code !== 0) throw new Error(`API error: ${json.msg}`);
    if (!json.data || !json.data.siteId) throw new Error(`Unknown user: ${siteId}`);
    return {
      siteId: json.data.siteId,
      uid: json.data.uid,
      sid: json.data.sid,
      nickName: json.data.nick_name,
      roomTopic: json.data.roomTopic,
      alive: json.data.alive === 1,
      hlsSrc: json.data.hls_src,
      snapshot: json.data.snapshot,
      roomId: json.data.roomId
    };
  } finally {
    clearTimeout(timer);
  }
}

// src/hls.ts
import { writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
function parseM3u8(content, baseUrl) {
  const lines = content.split("\n").map((l) => l.trim());
  const segments = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("#EXTINF:")) {
      const duration = parseFloat(lines[i].split(":")[1]) || 0;
      const uri = lines[i + 1];
      if (uri && !uri.startsWith("#")) {
        const fullUrl = uri.startsWith("http") ? uri : new URL(uri, baseUrl).href;
        segments.push({ uri: fullUrl, duration });
      }
    }
  }
  return segments;
}
async function fetchM3u8(url, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    if (!res.ok) throw new Error(`Failed to fetch m3u8: ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}
async function downloadSegment(url, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    if (!res.ok) throw new Error(`Segment download failed: ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(timer);
  }
}
async function downloadSegments(segments, concurrency, timeout, onProgress) {
  const results = new Array(segments.length);
  let index = 0;
  async function worker() {
    while (index < segments.length) {
      const i = index++;
      const buf = await downloadSegment(segments[i].uri, timeout);
      results[i] = buf;
      onProgress?.(buf.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, segments.length) }, () => worker()));
  return results;
}
async function downloadHls(m3u8Url, options = {}) {
  const {
    output,
    concurrency = 4,
    timeout = 3e4
  } = options;
  const content = await fetchM3u8(m3u8Url, timeout);
  const segments = parseM3u8(content, m3u8Url);
  if (segments.length === 0) {
    throw new Error("No segments found in m3u8 playlist");
  }
  const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0);
  const buffers = await downloadSegments(segments, concurrency, timeout);
  const merged = Buffer.concat(buffers);
  const outPath = output || `stream_${Date.now()}.ts`;
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, merged);
  return outPath;
}
async function downloadLiveHls(m3u8Url, outputPath, options = {}) {
  const {
    concurrency = 4,
    timeout = 3e4,
    onSegment,
    signal
  } = options;
  await mkdir(dirname(outputPath), { recursive: true });
  const { createWriteStream } = await import("fs");
  const stream = createWriteStream(outputPath);
  let segmentCount = 0;
  const seen = /* @__PURE__ */ new Set();
  try {
    while (!signal?.aborted) {
      const content = await fetchM3u8(m3u8Url, timeout);
      const segments = parseM3u8(content, m3u8Url);
      const newSegments = segments.filter((s) => !seen.has(s.uri));
      if (newSegments.length === 0) {
        await sleep(1e3);
        continue;
      }
      const buffers = await downloadSegments(newSegments, concurrency, timeout);
      for (const buf of buffers) {
        stream.write(buf);
        segmentCount++;
        onSegment?.(segmentCount);
      }
      newSegments.forEach((s) => seen.add(s.uri));
      await sleep(500);
    }
  } finally {
    stream.end();
  }
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// src/recorder.ts
import { EventEmitter } from "events";
import { join } from "path";
var Recorder = class extends EventEmitter {
  siteId;
  options;
  abortController = null;
  stopController = null;
  polling = false;
  constructor(input, options = {}) {
    super();
    this.siteId = parseSiteId(input);
    this.options = {
      pollInterval: options.pollInterval ?? 30,
      maxDuration: options.maxDuration ?? 0,
      outputDir: options.outputDir ?? "./recordings",
      splitEvery: options.splitEvery ?? 0,
      output: options.output ?? "",
      concurrency: options.concurrency ?? 4,
      timeout: options.timeout ?? 3e4
    };
  }
  /** Start watching and auto-record when live */
  async start() {
    await getStreamInfo(this.siteId);
    this.polling = true;
    this.stopController = new AbortController();
    const offlineInterval = 3 * 60;
    while (this.polling) {
      try {
        const info2 = await getStreamInfo(this.siteId);
        if (info2.alive && info2.hlsSrc) {
          this.emit("live", info2);
          await this.record(info2);
          this.emit("offline");
        }
      } catch (err) {
        if (!this.polling) break;
        this.emit("error", err instanceof Error ? err : new Error(String(err)));
      }
      if (this.polling) {
        await interruptibleSleep(offlineInterval * 1e3, this.stopController.signal);
      }
    }
  }
  /** Stop watching */
  stop() {
    this.polling = false;
    this.stopController?.abort();
    this.abortController?.abort();
    this.abortController = null;
  }
  async record(info2) {
    const filename = this.options.output || defaultFilename(info2.siteId);
    const outputPath = join(this.options.outputDir, filename);
    this.emit("recording", outputPath);
    this.abortController = new AbortController();
    let durationTimer;
    if (this.options.maxDuration > 0) {
      durationTimer = setTimeout(
        () => this.abortController?.abort(),
        this.options.maxDuration * 1e3
      );
    }
    try {
      const hlsSrc = info2.hlsSrc;
      await downloadLiveHls(hlsSrc, outputPath, {
        concurrency: this.options.concurrency,
        timeout: this.options.timeout,
        signal: this.abortController.signal,
        onSegment: (count) => this.emit("progress", count)
      });
    } catch (err) {
      if (this.abortController.signal.aborted) return;
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (durationTimer) clearTimeout(durationTimer);
      this.abortController = null;
    }
  }
};
function interruptibleSleep(ms, signal) {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}
function defaultFilename(siteId) {
  const d = /* @__PURE__ */ new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${siteId}=${date}_${time}.ts`;
}

// bin/bigorec.ts
import { statSync } from "fs";
var tag = {
  info: "\x1B[1;34m[INFO]\x1B[0m ",
  live: "\x1B[1;32m[LIVE]\x1B[0m ",
  off: "\x1B[1;34m[OFF]\x1B[0m ",
  ok: "\x1B[1;32m[OK]\x1B[0m ",
  done: "\x1B[1;32m[DONE]\x1B[0m ",
  warn: "\x1B[1;33m[WARN]\x1B[0m ",
  err: "\x1B[1;31m[ERR]\x1B[0m "
};
function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
function humanDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
var info = defineCommand({
  meta: { name: "info", description: "Get stream info for a Bigo room" },
  args: {
    url: { type: "positional", description: "Bigo room URL or siteId", required: true }
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
  }
});
var download = defineCommand({
  meta: { name: "download", description: "Download current live stream" },
  args: {
    url: { type: "positional", description: "Bigo room URL or siteId", required: true },
    output: { type: "string", description: "Output file path", alias: "o" },
    concurrency: { type: "string", description: "Download concurrency", alias: "c", default: "4" }
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
      concurrency: parseInt(args.concurrency)
    });
    const elapsed = (Date.now() - start) / 1e3;
    const size = statSync(outputPath).size;
    console.log(`${tag.done} ${outputPath} \u2014 ${humanSize(size)} in ${humanDuration(elapsed)}`);
  }
});
var record = defineCommand({
  meta: { name: "record", description: "Auto-record when stream goes live" },
  args: {
    url: { type: "positional", description: "Bigo room URL or siteId", required: true },
    output: { type: "string", description: "Output file path", alias: "o" },
    outputDir: { type: "string", description: "Output directory", alias: "d", default: "./recordings" },
    pollInterval: { type: "string", description: "Poll interval when live (seconds, offline=3min)", alias: "p", default: "30" },
    maxDuration: { type: "string", description: "Max duration (seconds, 0=unlimited)", alias: "m", default: "0" }
  },
  async run({ args }) {
    const siteId = parseSiteId(args.url);
    console.log(`${tag.info} Polling every ${args.pollInterval}s`);
    const recorder = new Recorder(args.url, {
      output: args.output,
      outputDir: args.outputDir,
      pollInterval: parseInt(args.pollInterval),
      maxDuration: parseInt(args.maxDuration)
    });
    recorder.on("live", (info2) => {
      console.log(`${tag.live} @${info2.nickName} (${info2.siteId})`);
    });
    recorder.on("offline", () => {
      console.log(`
${tag.off} Stream ended`);
    });
    recorder.on("recording", (path) => {
      console.log(`${tag.info} Recording to ${path}`);
    });
    recorder.on("progress", (segments) => {
      process.stdout.write(`\r${tag.info} Segments: ${segments}`);
    });
    recorder.on("error", (err) => {
      console.log(`
${tag.err} ${err.message}`);
    });
    process.on("SIGINT", () => {
      console.log(`
${tag.info} Shutting down...`);
      recorder.stop();
    });
    try {
      await recorder.start();
    } catch (err) {
      console.log(`${tag.err} ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  }
});
var main = defineCommand({
  meta: { name: "bigorec", description: "Download and record Bigo Live streams" },
  subCommands: { info, download, record }
});
runMain(main);
