## What changed

<!-- One or two sentences on the problem and the fix. -->

## Related issues

<!-- Fixes #123, or "none" -->

## Type

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor (no behavior change)
- [ ] Documentation
- [ ] CI / build

## How I verified it

<!-- Commands you ran, plus what you clicked through in the app. -->

- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] `cargo check --manifest-path src-tauri/Cargo.toml` passes (Rust changes only)

## Checklist

- [ ] The change works fully offline and adds no accounts, telemetry, or network calls
- [ ] Session/database data is never destroyed without an explicit confirmation
- [ ] Domain logic changes include a test in `tests/`
- [ ] No `any`, `@ts-ignore`, or lint suppressions added to silence an error
- [ ] UI changes include a before/after screenshot
- [ ] No new bundled stock photography
