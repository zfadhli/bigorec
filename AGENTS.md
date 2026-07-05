# AGENTS.md

## Project Overview

bigorec — TypeScript library and CLI for downloading and recording Bigo Live streams. Uses Bigo's internal API to extract HLS stream URLs and downloads via native HTTP (no ffmpeg dependency).

## Tech Stack

- **Language**: TypeScript (ES2022, ESM)
- **Runtime**: Node.js >= 18
- **Build**: tsdown (rolldown-powered)
- **Package manager**: nub (pnpm-compatible)
- **CLI framework**: citty
- **No external deps for core logic** — native fetch + hand-rolled m3u8 parser

## Setup Commands

```bash
nub install          # install dependencies
nub run build        # build library + CLI
nub run dev          # watch mode
nub run typecheck    # type checking only
```

## Project Structure

```
src/
  api.ts        — Bigo API client (getStreamInfo, isLive, parseSiteId)
  hls.ts        — HLS download (m3u8 parse → segments → merge)
  recorder.ts   — Recorder class (poll + auto-record when live)
  types.ts      — TypeScript interfaces
  index.ts      — Public API exports
bin/
  bigorec.ts    — CLI entry point (info, download, record commands)
```

## Key API Endpoint

```
POST https://ta.bigo.tv/official_website/studio/getInternalStudioInfo
Body: siteId={id}&verify=
Header: Accept: application/json
```

Returns `hls_src` (m3u8 URL) when stream is live, empty string when offline.

## Development Workflow

1. Edit source files in `src/` or `bin/`
2. Run `nub run build` to compile
3. Run `nub link` to symlink globally
4. Test with `bigorec info <siteId>`

## CLI Output Style

Follows tokrec conventions:
- Colored tags: `[LIVE]` green, `[INFO]`/`[OFF]` blue, `[DONE]` green, `[ERR]` red, `[WARN]` yellow
- Bold text via ANSI `\x1b[1;XXm` codes
- Minimal output — no boxes, no fluff

## Filename Convention

Output files: `{siteId}=YYYYMMDD_HHMMSS.ts`
Example: `1106771413=20260705_115200.ts`

## Polling Behavior

- When offline: polls every 3 minutes (safe, no blocking risk)
- When live: uses user-specified interval (default 30s)
- Invalid usernames fail fast with `[ERR] Unknown user: {id}`
- Ctrl+C exits immediately (abort-based sleep)

## Testing

No test suite yet. Manual testing against live Bigo rooms:
```bash
bigorec info <siteId>           # check room status
bigorec record <siteId>         # test auto-record
bigorec download <siteId> -o test.ts  # test download
```

## Build Output

- `dist/index.mjs` + `dist/index.d.mts` — library
- `dist/bin/bigorec.mjs` — CLI (auto-chmodded to executable)
