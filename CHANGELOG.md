# Changelog

All notable changes to Atom are documented here. This project follows [Semantic Versioning](https://semver.org) and the format of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.1.0] — 2026-11-18

First public release.

### Added
- Countdown, stopwatch, and Pomodoro focus timers with crash-safe session resume.
- Smart duration input (`25`, `1h30`, `1:30`, `1.5h`, `2h 15m`) with quick chips and ±5 minute nudges.
- Categories with colors and icons, plus task titles with autocomplete.
- **Standby Mode**: distraction-free full-screen timer over user-supplied photos, with shuffle-without-repeats rotation, automatic clock contrast, dim control, and sleep prevention.
- Sky gradient fallback when no Standby images are added.
- Timeline week strip and hourly day grid with manual entries.
- History grouped by day with totals, search, and category filters.
- Reports dashboard with Day / Week / Month / Year / All time / Custom ranges, plus CSV, JSON, and PDF export.
- Streaks where a day counts at one hour of focus, with freezes.
- Daily rolling JSON backups (last 14 kept) and backup import.
- 100% offline: local SQLite storage at `%APPDATA%\Atom\atom.db`, no accounts, no telemetry.

[Unreleased]: https://github.com/samxnotfound/atom/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/samxnotfound/atom/releases/tag/v0.1.0
