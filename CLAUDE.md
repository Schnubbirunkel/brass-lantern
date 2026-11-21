# Brass Lantern – notes for working on this repo

- Electron app; UI strings: German is the source language, English translations live in `src/shared/en.json`. Wrap new UI text in `T('…')` and run `python3 tools/check-i18n.py`.
- Smoke tests: `xvfb-run -a node test/run.mjs test/smoke.mjs` (story files in `test/stories/` are not committed).
- Windows paths: the WebAssembly interpreters only understand Unix-style absolute paths. Every path handed to or received from an interpreter must go through `src/main/vmpath.mjs` (`toVm`/`fromVm`). Test Windows behaviour on Linux with `LANTERN_FAKE_WIN=/ xvfb-run -a node test/run.mjs test/winpaths.mjs` (`LANTERN_FAKE_WIN_NOFIX=1` reproduces the original bug).

## Releasing a new version (always do this for every new version)
1. Bump `version` in `package.json`.
2. Write release notes in `docs/releases/v<version>.md` (English, same structure as the previous file).
3. Commit and push to `main` (tags can't be pushed from Claude sessions – not needed).
4. The GitHub Action `.github/workflows/release.yml` notices the new version, builds Windows, macOS and Linux, creates the tag `v<version>` and publishes the release with all files. Check the run with `gh api repos/Schnubbirunkel/brass-lantern/actions/runs`.
