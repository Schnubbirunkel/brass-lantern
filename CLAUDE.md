# Brass Lantern – notes for working on this repo

- Electron app; UI strings: German is the source language, English translations live in `src/shared/en.json`. Wrap new UI text in `T('…')` and run `python3 tools/check-i18n.py`.
- Smoke tests: `xvfb-run -a node test/run.mjs test/smoke.mjs` (story files in `test/stories/` are not committed).
- Windows paths: the WebAssembly interpreters only understand Unix-style absolute paths. Every path handed to or received from an interpreter must go through `src/main/vmpath.mjs` (`toVm`/`fromVm`). Test Windows behaviour on Linux with `LANTERN_FAKE_WIN=/ xvfb-run -a node test/run.mjs test/winpaths.mjs` (`LANTERN_FAKE_WIN_NOFIX=1` reproduces the original bug).

- Status bars (short grid windows) are laid out by parts with CSS (`layoutStatusLine` in `glkote.js`), so the displayed text has no padding spaces. Code that needs the game's status text (automap) must read `line._src`, not `textContent`. Tests: `test/statusresize.mjs`, `test/dragstatus.mjs`, `test/statusall.mjs`.

## Versions and releases (same scheme as the Android projects Barkeep and Boardshelf)

**Every change that is pushed to `main` is a new version and gets released – do this automatically, without being asked:**
1. Bump the version in `VERSION` (single source; `tools/sync-version.mjs` copies it into `package.json` – run it or `npm start`/`npm run dist:*` before committing so both match). Fix → patch (1.2.3 → 1.2.4), new feature → minor (1.2.x → 1.3.0).
2. Write `docs/release-notes/v<VERSION>.md`: German first, then English, same structure as the previous file, screenshots embedded via `raw.githubusercontent.com/.../main/docs/screenshots/de_*.png`.
3. Run `npm test` (tests with `test/fixtures`; needs xvfb-run). Run `npm run screenshots` if the UI changed – CI regenerates and commits them anyway.
4. Commit and push to `main`. Tags can't be pushed from Claude sessions and aren't needed.
5. `.github/workflows/build.yml` tests and builds every push; if `VERSION` has no release yet it publishes `v<VERSION>` with all builds, `de_*.png` and `screenshots.zip`, and commits updated screenshots (`[skip ci]`). Watch it with `gh api repos/Schnubbirunkel/brass-lantern/actions/runs` and report the release link when it's done.
