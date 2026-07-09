# Summary

## AC Results

| AC | Status | Evidence |
|----|--------|----------|
| AC-1 | Pass | `downloadHls()` → `downloadHlsWithFfmpeg()` spawns ffmpeg with `-i <url> -c copy -y <output>` |
| AC-2 | Pass | `recorder.ts` finally block calls `remuxToMp4()` when `remux: true`, removes .ts |
| AC-3 | Pass | `ensureFfmpeg()` throws `FfmpegNotAvailableError` with install instructions |

## Files Changed

| File | Change |
|------|--------|
| `src/ffmpeg.ts` | New — ffmpeg utilities (checkFfmpeg, downloadHlsWithFfmpeg, remuxToMp4) |
| `src/hls.ts` | Rewritten — 167→32 lines, uses ffmpeg instead of HTTP segment download |
| `src/recorder.ts` | Added remux in finally block, imports remuxToMp4 |
| `src/types.ts` | Added `remux?: boolean` to RecordOptions, `remuxed` event |
| `src/errors.ts` | Added `FfmpegError` class |
| `src/index.ts` | Exports new ffmpeg functions and FfmpegError |
| `bin/bigorec.ts` | Removed `-c` concurrency flag from download command |
| `package.json` | Added `nano-spawn` dependency |

## Deviations

| What | Why | Impact |
|------|-----|--------|
| Removed concurrency option from DownloadOptions/CLI | ffmpeg handles parallelism internally | None — backward compatible, flag was meaningless with ffmpeg |
| Removed onSegment callback from downloadLiveHls | ffmpeg doesn't expose segment-level progress | Minor — can add progress via ffmpeg stderr parsing later if needed |
