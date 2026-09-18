# Changelog

All notable changes to this project will be documented in this file.

This project follows Semantic Versioning:
https://semver.org/

## [Unreleased]

Initial repository scaffolding for the TypeScript implementation track of PIC
Standard. This initial state is pre-parity: the package does not yet implement
any verifier surface and is marked `private` on npm.

### Added

- Node.js + TypeScript project skeleton: `package.json`, `tsconfig.json`,
  `eslint.config.mjs` (ESLint flat config), `.prettierrc`, `.editorconfig`,
  `.gitattributes`, `.gitignore`, `LICENSE` (Apache-2.0).
- Vendored `pic-standard` conformance corpus as a git submodule at
  `vendor/pic-standard/`, pinned to Repo A tag `v0.9.0-alpha.2`. This tag
  encodes the schema, evidence, tool-binding, and secure-trust-default
  behavior the TypeScript implementation must model against for v0.9.0
  final.
- Machine-readable version metadata via `getVersion()` in `src/index.ts`
  exposing `implName`, `implVersion`, `picProtocolVersion`,
  `conformanceManifestRef`, and `supportedModes`. `supportedModes` is
  empty until canonicalization parity lands.
- Fixture loader in `src/fixtures.ts` that reads
  `vendor/pic-standard/conformance/manifest.json` via `fs`/`path` (not
  static JSON imports) and distinguishes "submodule missing" from
  "malformed JSON" in its error surface.
- Vitest smoke test in `test/smoke.test.ts` covering the version
  metadata surface and the manifest read (the latter degrades gracefully
  when the submodule is not initialized).
- GitHub Actions CI workflow at `.github/workflows/ci.yml`. Runs
  `format:check`, `lint`, `typecheck`, and `test` on Node 20 for every
  push and pull request targeting `main`.
- `CONTRIBUTING.md` with contributor guidance covering setup, development
  workflow, coding style, and DCO sign-off.

### Notes

- Conformance modes claimed: none. Evidence-mode parity, HTTP bridge
  parity, and release/publish parity are explicitly out of scope for
  v0.9.0.
- The `@pic-standard/pic-standard-ts` package name is not yet published
  to npm. It is marked `"private": true` and will remain so until the
  first v0.9.0 candidate build.
