import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { getStreamInfo, parseSiteId } from './api.js';
import { StreamNotFoundError } from './errors.js';
import { remuxToMp4 } from './ffmpeg.js';
import { downloadLiveHls } from './hls.js';
import type { RecordOptions, StreamInfo } from './types.js';

export class Recorder extends EventEmitter {
  private siteId: string;
  private options: Required<Omit<RecordOptions, 'remux'>> & { remux: boolean };
  private abortController: AbortController | null = null;
  private stopController: AbortController | null = null;
  private polling = false;

  constructor(input: string, options: RecordOptions = {}) {
    super();
    this.siteId = parseSiteId(input);
    this.options = {
      pollInterval: options.pollInterval ?? 30,
      maxDuration: options.maxDuration ?? 0,
      outputDir: options.outputDir ?? './recordings',
      splitEvery: options.splitEvery ?? 0,
      output: options.output ?? '',
      remux: options.remux ?? true,
    };
  }

  /** Start watching and auto-record when live */
  async start(): Promise<void> {
    // Validate room exists before entering poll loop
    await getStreamInfo(this.siteId);

    this.polling = true;
    this.stopController = new AbortController();
    const offlineInterval = 3 * 60; // 3 min when offline

    while (this.polling) {
      try {
        const info = await getStreamInfo(this.siteId);

        if (info.alive && info.hlsSrc) {
          this.emit('live', info);
          await this.record(info);
          this.emit('offline');
        } else {
          this.emit('offline');
        }
      } catch (error) {
        if (!this.polling) break;
        this.emit('error', error instanceof Error ? error : new Error(String(error)));
      }

      if (this.polling) {
        await interruptibleSleep(offlineInterval * 1000, this.stopController.signal);
      }
    }
  }

  /** Stop watching */
  stop(): void {
    this.polling = false;
    this.stopController?.abort();
    this.abortController?.abort();
    this.abortController = null;
  }

  private async record(info: StreamInfo): Promise<void> {
    const filename = this.options.output || defaultFilename(info.siteId);
    const outputPath = join(this.options.outputDir, filename);

    this.emit('recording', outputPath);
    this.abortController = new AbortController();

    let durationTimer: ReturnType<typeof setTimeout> | undefined;
    if (this.options.maxDuration > 0) {
      durationTimer = setTimeout(
        () => this.abortController?.abort(),
        this.options.maxDuration * 1000,
      );
    }

    try {
      const hlsSrc = info.hlsSrc!;
      await downloadLiveHls(hlsSrc, outputPath, {
        signal: this.abortController.signal,
      });
    } catch (error) {
      if (this.abortController.signal.aborted) return;
      // 404 = stream ended (m3u8 gone from CDN), not a real error
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('404')) return;
      this.emit('error', error instanceof Error ? error : new Error(msg));
    } finally {
      if (durationTimer) clearTimeout(durationTimer);
      this.abortController = null;

      // Remux to mp4 after recording stops
      if (this.options.remux && outputPath.endsWith('.ts')) {
        try {
          const mp4Path = await remuxToMp4(outputPath);
          this.emit('remuxed', mp4Path);
        } catch (error) {
          this.emit('error', error instanceof Error ? error : new Error(String(error)));
        }
      }
    }
  }
}

/** Sleep that can be interrupted via AbortSignal */
function interruptibleSleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/** Convenience: one-shot record of current live stream */
export async function recordOnce(input: string, options: RecordOptions = {}): Promise<string> {
  const siteId = parseSiteId(input);
  const info = await getStreamInfo(siteId);

  if (!info.alive || !info.hlsSrc) {
    throw new StreamNotFoundError(siteId);
  }

  const filename = options.output || defaultFilename(siteId);
  const outputPath = join(options.outputDir ?? './recordings', filename);

  await downloadLiveHls(info.hlsSrc, outputPath);

  // Remux to mp4 after recording
  if (options.remux !== false && outputPath.endsWith('.ts')) {
    await remuxToMp4(outputPath);
  }

  return outputPath;
}

function defaultFilename(siteId: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${siteId}=${date}_${time}.ts`;
}
