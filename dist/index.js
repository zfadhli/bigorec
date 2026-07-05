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
async function isLive(siteId) {
  const info = await getStreamInfo(siteId);
  return info.alive && info.hlsSrc !== null;
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
        const info = await getStreamInfo(this.siteId);
        if (info.alive && info.hlsSrc) {
          this.emit("live", info);
          await this.record(info);
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
  async record(info) {
    const filename = this.options.output || defaultFilename(info.siteId);
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
      const hlsSrc = info.hlsSrc;
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
async function recordOnce(input, options = {}) {
  const siteId = parseSiteId(input);
  const info = await getStreamInfo(siteId);
  if (!info.alive || !info.hlsSrc) {
    throw new Error(`Stream is not live (siteId: ${siteId})`);
  }
  const filename = options.output || defaultFilename(siteId);
  const outputPath = join(options.outputDir ?? "./recordings", filename);
  await downloadLiveHls(info.hlsSrc, outputPath, {
    concurrency: options.concurrency ?? 4,
    timeout: options.timeout ?? 3e4
  });
  return outputPath;
}
function defaultFilename(siteId) {
  const d = /* @__PURE__ */ new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${siteId}=${date}_${time}.ts`;
}
export {
  Recorder,
  downloadHls,
  downloadLiveHls,
  getStreamInfo,
  isLive,
  parseSiteId,
  recordOnce
};
