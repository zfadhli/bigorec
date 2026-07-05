# Handoff

## Goal

Build a TypeScript lib + CLI for downloading and recording Bigo Live streams.

## Session Info

- **Branch:** `master`
- **Project:** bigorec
- **Saved:** 2026-07-05

## Recent Commits

```
ec579ec fix: use clientBigoId for user validation
dc5cb3e feat: add tmux support for persistent recording
231f3e6 fix: use 3min offline interval for countdown
fb4cd09 feat: show offline status with polling countdown
d4a071c chore: swap oxlint/oxfmt for biome
```

## Project Structure

```
src/
  api.ts        — Bigo API client (getStreamInfo, isLive, parseSiteId)
  hls.ts        — HLS download (m3u8 parse → segments → merge)
  recorder.ts   — Recorder class (poll + auto-record when live)
  tmux.ts       — tmux session helpers (start/stop/status)
  types.ts      — TypeScript interfaces
  index.ts      — Public API exports
bin/
  bigorec.ts    — CLI entry point (info, download, record, start, stop, status)
```

## Key Decisions

- **Bigo API**: POST to `https://ta.bigo.tv/official_website/studio/getInternalStudioInfo` with `siteId` param. Returns `hls_src` (m3u8 URL) when live.
- **API validation**: Use `clientBigoId` field (always present) instead of `siteId` (empty for offline users).
- **Adaptive polling**: 3 min when offline, user-specified interval when live.
- **Build tool**: tsdown (rolldown-powered, migrated from tsup).
- **Package manager**: nub (migrated from npm).
- **Linting/formatting**: biome (migrated from oxlint + oxfmt).
- **CLI output**: tokrec-style colored tags (`[LIVE]`, `[OFF]`, `[INFO]`, etc.).
- **Filename format**: `{siteId}=YYYYMMDD_HHMMSS.ts`.
- **tmux support**: `start`/`stop`/`status` commands for persistent recording.

## Dead Ends

- **oxlint/oxfmt import sorting**: oxfmt only sorts by module path, not member order within imports. Biome handles both.

## Blockers

- None.

## Next Steps

- [ ] Test recording with a live stream to verify HLS download works end-to-end
- [ ] Add TS→MP4 remux option (currently outputs raw `.ts` segments)
- [ ] Consider adding multi-room recording support
- [ ] Consider adding notifications (desktop/webhook) when stream goes live

## Suggested Skills

- None needed — project is self-contained and well-documented in AGENTS.md
