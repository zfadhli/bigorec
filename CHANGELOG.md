# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-07-07

### Added
- TUI for monitoring multiple Bigo rooms simultaneously (`bigorec-tui`)
- JSONC config support (`bigorec.jsonc` with comments)
- Custom error classes with exit code differentiation
- Tmux support for persistent recording (`bigorec start/stop/status`)
- Offline status with polling countdown

### Fixed
- Treat m3u8 404 as stream ended instead of surfacing as error
- Show only siteId in TUI status to prevent misalignment with long names
- Run TUI with Bun instead of Node.js (required by @opentui/core native FFI)
- Use clientBigoId for user validation
- Use 3-minute offline polling interval for countdown

### Changed
- Match tokrec-tui bin pattern (shebang + import built output)
- Swap oxlint/oxfmt for biome
- Migrate npm → nub
- Migrate tsup → tsdown (rolldown-powered, 2-8x faster)
