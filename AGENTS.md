# AGENTS.md

## Project Overview

bigorec — TypeScript library and CLI for downloading and recording Bigo Live streams. Uses Bigo's internal API to extract HLS stream URLs and downloads via native HTTP (no ffmpeg dependency).

## Tech Stack

- **Language**: TypeScript (ES2022, ESM)
- **Runtime**: Node.js >= 18 (CLI), Bun >= 1.2 (TUI)
- **Build**: tsdown (rolldown-powered)
- **Package manager**: nub (pnpm-compatible)
- **CLI framework**: citty
- **TUI**: @opentui/core (requires Bun native FFI)
- **Lint/Format**: Biome
- **Git hooks**: Lefthook

## Setup Commands

```bash
nub install          # install dependencies
nub run build        # build library + CLI
nub run dev          # watch mode
nub run typecheck    # type checking only
nub run lint         # lint with biome
nub run format       # auto-fix with biome
```

## Project Structure

```
src/
  api.ts        — Bigo API client (getStreamInfo, isLive, parseSiteId)
  hls.ts        — HLS download (m3u8 parse → segments → merge)
  recorder.ts   — Recorder class (poll + auto-record when live)
  errors.ts     — Custom error classes (BigorecError, ApiError, etc.)
  types.ts      — TypeScript interfaces
  index.ts      — Public API exports
  tmux.ts       — Tmux session management (background recording)
  tui/
    index.ts    — TUI entry point (loadConfig → Manager → CLI)
    cli.ts      — @opentui/core TUI renderer (status table, keyboard)
    manager.ts  — Wraps Recorder per room with state machine
    config.ts   — JSONC config loader (bigorec.jsonc / bigorec.json)
bin/
  bigorec.ts    — CLI entry point (info, download, record commands)
  bigorec-tui   — TUI entry (shebang + import built output)
```

## Build Outputs

- `dist/index.mjs` + `dist/index.d.mts` — library
- `dist/bin/bigorec.mjs` — CLI (Node.js)
- `dist/tui/index.mjs` — TUI (Bun runtime)

## Key API Endpoint

```
POST https://ta.bigo.tv/official_website/studio/getInternalStudioInfo
Body: siteId={id}&verify=
Header: Accept: application/json
```

Returns `hls_src` (m3u8 URL) when stream is live, empty string when offline.

## Development Workflow

### CLI (Node.js)
```bash
nub run build
nub link
bigorec info <siteId>
```

### TUI (Bun)
```bash
nub run build
nub run tui            # or: bun bin/bigorec-tui
```

### Config File
Create `bigorec.jsonc` (with comments) or `bigorec.json`:
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

## CLI Commands

```bash
bigorec info <siteId>           # check room status
bigorec download <siteId>       # download current live stream
bigorec record <siteId>         # auto-record when live
bigorec start <siteId>          # start in tmux (survives terminal close)
bigorec stop [siteId]           # stop tmux session(s)
bigorec status [siteId]         # check tmux session(s)
```

## Testing

No test suite yet. Manual testing against live Bigo rooms:
```bash
bigorec info <siteId>
bigorec record <siteId>
bigorec-tui
```

## Code Style

- **Formatter**: Biome (2-space indent, single quotes, trailing commas, 100 line width)
- **Linter**: Biome recommended rules + `noUnusedVariables: warn`, `noUnusedImports: warn`
- **TypeScript**: Strict mode, ES2022 target, ESNext modules, bundler resolution
- **Naming**: camelCase for variables/functions, PascalCase for classes/interfaces
- **Imports**: Use `.js` extension in relative imports (ESM requirement)

## Pre-commit Hooks

Lefthook runs on commit:
- `biome check` — lint staged `.ts/.js` files
- `biome check --write` — format staged files

## Filename Convention

Output files: `{siteId}=YYYYMMDD_HHMMSS.ts`
Example: `1106771413=20260705_115200.ts`

## Polling Behavior

- When offline: polls every 3 minutes (safe, no blocking risk)
- When live: uses user-specified interval (default 30s)
- Invalid usernames fail fast with `[ERR] Unknown user: {id}`
- Ctrl+C exits immediately (abort-based sleep)
- m3u8 404 treated as stream ended (not an error)

## PR Guidelines

- Title format: `feat:`, `fix:`, `chore:`, `refactor:` (conventional commits)
- Run `nub run typecheck` and `nub run lint` before committing
- Build passes: `nub run build`
