# Handoff

## Goal

Build a TUI for bigorec (matching tokrec-tui pattern), add JSONC config support, release v0.2.0, and update project docs (README + AGENTS.md).

## Session Info

- **Branch:** `master`
- **Project:** bigorec — TypeScript library/CLI for downloading and recording Bigo Live streams
- **Saved:** 2026-07-07

## Changes

Clean working tree — no uncommitted changes.

Recent commits:
```
e8ab432 docs: rewrite README with TUI, badges, and admonitions
240a735 docs: add AGENTS.md for coding agents
4af53c7 Release v0.2.0 (#1)
acc204a feat: add custom error classes with exit code differentiation
52716c0 fix: use clientBigoId for user validation
```

## Files Touched

| File | Status | Done | Left |
|------|--------|------|------|
| `src/tui/config.ts` | new | JSONC config loader (tiny-jsonc), .jsonc/.json fallback | — |
| `src/tui/manager.ts` | new | Recorder wrapper per room, state machine (idle/polling/recording/error) | — |
| `src/tui/cli.ts` | new | @opentui/core TUI renderer, keyboard shortcuts (q/s/r/n) | — |
| `src/tui/index.ts` | new | TUI entry point (loadConfig → Manager → CLI → start) | — |
| `bin/bigorec-tui` | new | shebang + import built output (tokrec-tui pattern) | — |
| `src/recorder.ts` | modified | 404 treated as stream ended (not error) | — |
| `tsdown.config.ts` | modified | Added TUI entry with neverBundle for @opentui/core | — |
| `package.json` | modified | Added @opentui/core, tiny-jsonc, bigorec-tui bin, tui/tui:dev scripts | — |
| `tsconfig.json` | modified | Removed rootDir (was conflicting with bin/) | — |
| `bigorec.json.example` | new | Example config with JSONC comments | — |
| `CHANGELOG.md` | new | Keep a Changelog format for v0.2.0 | — |
| `AGENTS.md` | new | Agent context file (setup, structure, code style) | — |
| `README.md` | rewritten | Centered header, badges, TUI docs, admonitions, project structure | — |

## Key Decisions

- **Bun required for TUI**: @opentui/core uses native FFI (Zig) that only works with Bun's runtime. CLI (Node.js) and TUI (Bun) are separate entry points.
- **tiny-jsonc for JSONC**: 562 bytes, zero deps, TS types built in. Smaller than strip-json-comments (8.2kB) and jsonc-parser (213kB).
- **404 as stream end**: m3u8 404 from Bigo CDN means stream ended. Silently return instead of emitting error, so TUI shows "polling" instead of "error: 404".
- **Display name removed from TUI**: Showing `@nickName (siteId)` caused misalignment with long names. Show only siteId.
- **tokrec-tui bin pattern**: `bin/bigorec-tui` is shebang + `await import("../dist/tui/index.mjs")`, matching the reference project.

## Dead Ends

- **@opentui/core on Node.js**: Import succeeds but `createCliRenderer()` throws "native FFI not available for this runtime". Must use Bun.
- **nub link for TUI**: `nub link` doesn't create linuxbrew symlinks. Manually created symlink in `/home/linuxbrew/.linuxbrew/bin/`.

## Blockers

- None.

## Next Steps

- [ ] Push v0.2.0 docs changes (AGENTS.md + README.md) to origin if not already pushed
- [ ] Consider adding test suite (currently manual testing only)
- [ ] Consider adding `@types/node` as a regular dependency (currently devDep, but TUI uses Node.js types)

## Suggested Skills

- **deepwork**: For multi-phase features (e.g., test suite, new TUI modes)
- **ponytail**: For simplification audits on the growing codebase
