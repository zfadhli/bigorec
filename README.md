<div align="center">

# bigorec

Download and record [Bigo Live](https://www.bigo.tv) streams.

[![npm version](https://img.shields.io/npm/v/bigorec?style=flat-square)](https://www.npmjs.com/package/bigorec)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js->=18-3c873a?style=flat-square)](https://nodejs.org)
[![Bun](https://img.shields.io/badge/Bun->=1.2-000000?style=flat-square)](https://bun.sh)

[Features](#features) &bull; [Install](#install) &bull; [Usage](#usage) &bull; [TUI](#tui) &bull; [Library](#library-api) &bull; [Development](#development)

</div>

## Features

- **No ffmpeg** — pure HTTP download, merges HLS segments into `.ts` files
- **Auto-record** — polls rooms and records when live
- **TUI dashboard** — monitor multiple rooms in real-time with `bigorec-tui`
- **Background recording** — tmux sessions survive terminal close
- **JSONC config** — add comments to your `bigorec.jsonc`
- **Library API** — use as a TypeScript/JavaScript module

## Install

```bash
npm install -g bigorec
```

Or with [nub](https://github.com/nicepkg/nub):

```bash
nub add -g bigorec
```

## Usage

### CLI

```bash
# Check room status
bigorec info 1106771413

# Download current live stream
bigorec download 1106771413 -o stream.ts

# Auto-record (polls every 3 min when offline, records when live)
bigorec record 1106771413

# Record with options
bigorec record 1106771413 -d ./recordings -p 15 -m 3600
```

You can also pass a full URL:

```bash
bigorec info https://www.bigo.tv/1106771413
```

### Background Recording

Start recording in a tmux session that survives terminal close:

```bash
bigorec start 1106771413         # start in tmux
bigorec status                   # check active sessions
bigorec stop 1106771413          # stop a session
bigorec stop                     # stop all sessions
```

### TUI

Interactive terminal UI for monitoring multiple rooms simultaneously.

> [!NOTE]
> The TUI requires [Bun](https://bun.sh) >= 1.2 (uses native FFI for rendering).

```bash
# Install Bun if needed
curl -fsSL https://bun.sh/install | bash

# Run the TUI
bigorec-tui
```

**Keyboard shortcuts:**

| Key | Action |
|-----|--------|
| `q` | Quit (stops all recordings) |
| `s` | Stop mode — pick a room to stop |
| `r` | Restart mode — pick a room to restart |
| `n` | New room — add a siteId at runtime |

### Config

Create `bigorec.jsonc` (with comments) or `bigorec.json` in your working directory:

```jsonc
{
  // Output directory for recorded files
  "outputDir": "./recordings",
  // Polling interval in minutes
  "interval": 3,
  // Bigo room siteIds to monitor
  "rooms": ["1106771413"]
}
```

## Library API

```ts
import { getStreamInfo, isLive, downloadHls, Recorder } from 'bigorec'

// Get stream info
const info = await getStreamInfo('1106771413')
console.log(info.nickName, info.alive, info.hlsSrc)

// Download current live stream
await downloadHls(info.hlsSrc, { output: 'stream.ts' })

// Auto-record (EventEmitter-based)
const recorder = new Recorder('1106771413', { pollInterval: 15 })
recorder.on('live', (info) => console.log(`Recording ${info.nickName}...`))
recorder.on('recording', (path) => console.log(`Saved to ${path}`))
await recorder.start()

// One-shot record
const path = await recordOnce('1106771413')
```

### API Reference

| Function | Description |
|----------|-------------|
| `getStreamInfo(siteId)` | Fetch stream metadata. Throws if room not found. |
| `isLive(siteId)` | Check if a room is currently live. |
| `downloadHls(m3u8Url, options?)` | Download HLS stream to file. Returns output path. |
| `recordOnce(siteId, options?)` | Download current live stream in one call. Throws if offline. |

### Recorder Events

| Event | Payload | Description |
|-------|---------|-------------|
| `live` | `StreamInfo` | Stream started |
| `offline` | — | Stream ended |
| `recording` | `string` (path) | Recording started |
| `progress` | `number` (segments) | Segment downloaded |
| `error` | `Error` | Something went wrong |

## How It Works

1. Calls Bigo's internal API to extract the HLS stream URL
2. Parses the m3u8 playlist and downloads segments with concurrent HTTP requests
3. Merges segments into a single `.ts` file

No ffmpeg required — pure HTTP download.

## Output Format

Files are saved as `{siteId}=YYYYMMDD_HHMMSS.ts` (e.g., `1106771413=20260705_115200.ts`).

## Limitations

- Single quality tier per stream (Bigo's API limitation)
- No VOD/recording support — live streams only
- 1080p HEVC streams require a computed token not yet reverse-engineered
- Some streams may not return `hls_src` even when live (Bigo server-side issue)

## Development

```bash
git clone https://github.com/zfadhli/bigorec.git
cd bigorec
nub install
nub run build
```

### Commands

| Command | Description |
|---------|-------------|
| `nub run build` | Build library + CLI |
| `nub run dev` | Watch mode |
| `nub run tui` | Run TUI (requires Bun) |
| `nub run typecheck` | Type checking |
| `nub run lint` | Lint with Biome |
| `nub run format` | Auto-fix with Biome |

### Project Structure

```
src/
  api.ts        — Bigo API client
  hls.ts        — HLS download (m3u8 parse, segments, merge)
  recorder.ts   — Recorder class (poll + auto-record)
  errors.ts     — Custom error classes
  types.ts      — TypeScript interfaces
  index.ts      — Public API exports
  tmux.ts       — Tmux session management
  tui/
    index.ts    — TUI entry point
    cli.ts      — @opentui/core renderer
    manager.ts  — Recorder wrapper per room
    config.ts   — JSONC config loader
bin/
  bigorec.ts    — CLI entry point
  bigorec-tui   — TUI entry (Bun)
```
