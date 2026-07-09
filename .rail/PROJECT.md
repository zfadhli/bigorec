# bigorec

## What This Is

TypeScript library and CLI for downloading and recording Bigo Live streams via native HTTP. Uses Bigo's internal API to extract HLS stream URLs and downloads segments without ffmpeg dependency.

## Requirements

- Download live Bigo streams via HLS
- Auto-record when stream goes live (polling)
- Multi-room monitoring via TUI
- Background recording via tmux sessions
- CLI commands: info, download, record, start, stop, status
- Config file support (JSONC/JSON)

## Constraints

- No ffmpeg dependency (native HTTP only)
- Node.js >= 18 for CLI, Bun >= 1.2 for TUI
- ESM-first TypeScript

## Success Metrics

| Metric | Target |
|--------|--------|
| Stream detection latency | < 30s |
| Recording uptime | > 99% during live |
| Multi-room support | 10+ rooms |
