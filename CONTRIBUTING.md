# Contributing to Atom

Thanks for taking the time to contribute. Atom is a small, deliberately focused app — the fastest way to get a change merged is to keep it small and keep it local-first.

## Ground rules

- **No network calls, accounts, telemetry, or analytics.** Atom is 100% offline. A PR that phones home will not be merged.
- **Your data belongs to the user.** Never destroy session data without an explicit, typed confirmation.
- **No bundled stock photography.** Standby images ship empty; users add their own.
- **Match the existing style** rather than reformatting files you're not otherwise changing.

## Development setup

Prerequisites: Node.js 22+, Rust stable, and the *Desktop development with C++* workload from Microsoft C++ Build Tools.

```bash
git clone https://github.com/samxnotfound/atom.git
cd atom
npm ci
npm run tauri dev
```

## Before you open a PR

```bash
npm test         # Vitest unit suite must pass
npm run build    # tsc + Vite must build clean
```

If you touched Rust:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

There is no linter gate, but TypeScript is strict and the build will fail on type errors — please don't silence them with `any` or `@ts-ignore`.

## Code layout

| Path | Contents |
| --- | --- |
| `src/domain/` | Pure logic — timer math, streaks, analytics, duration parsing. Keep it framework-free and tested. |
| `src/data/` | SQLite repositories, migrations, import/export. |
| `src/features/` | One folder per screen (focus, standby, timeline, history, reports, streaks, settings). |
| `src/ui/` | Shared presentational components. |
| `src-tauri/src/` | Rust commands: images, window control, sleep prevention, notifications. |
| `src-tauri/migrations/` | Versioned SQL. Add a new file; never edit an existing migration. |
| `tests/` | Vitest suites. Domain logic changes need a test. |

## Tests

Logic in `src/domain/` and `src/data/` is covered by Vitest. When you change how sessions are grouped, how streaks are counted, or how durations are parsed, add or update a test that would have caught the old behavior.

## Commits and pull requests

- Write commit subjects in the imperative mood: `Fix streak freeze counting across DST`.
- One logical change per PR. If it fixes an issue, reference it (`Fixes #12`).
- Include a short "before / after" note for UI changes, and a screenshot if the layout changed.
- Fill in the PR template checklist.

## Reporting bugs

Open an issue using the **Bug report** template and include your Windows version, the Atom version from Settings, and the steps that reproduce the problem. Never paste the contents of `atom.db` — it is your personal history. Export a JSON backup only if a maintainer asks for it.

## Security issues

Do not open a public issue. Follow [SECURITY.md](SECURITY.md).
