# Brass Lantern – notes for working on this repo

- Electron app; UI strings: German is the source language, English translations live in `src/shared/en.json`. Wrap new UI text in `T('…')` and run `python3 tools/check-i18n.py`.
- Smoke tests: `xvfb-run -a node test/run.mjs test/smoke.mjs` (story files in `test/stories/` are not committed).

## Releasing a new version (always do this for every new version)
1. Bump `version` in `package.json`.
2. Write release notes in `docs/releases/v<version>.md` (English, same structure as the previous file).
3. Commit, then `git tag v<version>` and push the commit **and** the tag.
4. The GitHub Action `.github/workflows/release.yml` builds Windows, macOS and Linux and publishes the release with all files.
