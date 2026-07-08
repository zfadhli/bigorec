import { unlink } from 'node:fs/promises';
import spawn from 'nano-spawn';
import { BigorecError } from './errors.js';

export class FfmpegNotAvailableError extends BigorecError {
  constructor() {
    super('ffmpeg not found. Install it: https://ffmpeg.org/download.html');
    this.name = 'FfmpegNotAvailableError';
  }
}

/** Check if ffmpeg is available on the system */
export async function checkFfmpeg(): Promise<boolean> {
  try {
    await spawn('ffmpeg', ['-version']);
    return true;
  } catch {
    return false;
  }
}

/** Ensure ffmpeg is available, throw if not */
async function ensureFfmpeg(): Promise<void> {
  if (!(await checkFfmpeg())) {
    throw new FfmpegNotAvailableError();
  }
}

export interface FfmpegOptions {
  signal?: AbortSignal;
  timeout?: number;
}

/** Download an HLS stream to .ts file using ffmpeg */
export async function downloadHlsWithFfmpeg(
  m3u8Url: string,
  outputPath: string,
  options: FfmpegOptions = {},
): Promise<string> {
  await ensureFfmpeg();

  const args = ['-i', m3u8Url, '-c', 'copy', '-y', outputPath];
  await spawn('ffmpeg', args, {
    signal: options.signal,
    timeout: options.timeout,
  });

  return outputPath;
}

/** Remux a .ts file to .mp4 using ffmpeg, remove original on success */
export async function remuxToMp4(
  inputPath: string,
  outputPath?: string,
  options: FfmpegOptions = {},
): Promise<string> {
  await ensureFfmpeg();

  const out = outputPath ?? inputPath.replace(/\.ts$/, '.mp4');
  const args = ['-i', inputPath, '-c', 'copy', '-y', out];
  await spawn('ffmpeg', args, {
    signal: options.signal,
    timeout: options.timeout,
  });

  // Remove original .ts if remuxed to different file
  if (out !== inputPath) {
    await unlink(inputPath).catch(() => {});
  }

  return out;
}
