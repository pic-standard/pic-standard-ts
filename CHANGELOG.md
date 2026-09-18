# Changelog

All notable changes to this project will be documented in this file.

This project follows Semantic Versioning:
https://semver.org/

## [Unreleased]

Pre-verifier scaffold plus PIC-CJSON/1.0 canonicalization, proposal
schema validation, and error-code mirror. Currently claims
canonicalization parity only. Core,
trust-sanitization, and verifier-decision paths are not yet implemented,
so this package MUST NOT be treated as a conformant PIC verifier. Marked
`"private": true` on npm.

### Added

- `PICErrorCode` in `src/errors.ts`: static TypeScript mirror of Repo
  A's `PICErrorCode` enum (10 members from `INVALID_REQUEST` through
  `INTERNAL_ERROR`, including the v0.9.0a2 `PIC_DUPLICATE_ID` code).
  Wrapped in `Object.freeze()` for runtime immutability. Value export
  as `PICErrorCode`; type export as `PICErrorCodeValue` from the
  public barrel.
- Errors parity test suite in `test/errors.test.ts` (8 tests). Parses
  the `class PICErrorCode` body in
  `vendor/pic-standard/sdk-python/pic_standard/errors.py` and asserts
  name, value, count, and mapping parity. Local shape tests (frozen,
  wire-prefixed, unique) run regardless of submodule availability.
- `validateProposal(value)` in `src/schema.ts` performing Ajv-compiled
  schema validation against the vendored PIC/1.0 proposal schema at the
  current submodule pin. Lazy singleton compile; returns
  `{ ok: true, proposal }` or `{ ok: false, errors[] }` with normalized
  JSON-pointer paths (root path emitted as `/`).
- TypeScript type definitions in `src/types.ts` mirroring the vendored
  schema: `ActionProposal`, `Provenance`, `Claim`, `Action`, `Evidence`
  (discriminated union of `HashEvidence` + `SigEvidence`), `ImpactClass`,
  `TrustLevel`.
- Schema-validation test suite in `test/schema.test.ts` (19 tests
  covering positive shapes, top-level rejection, provenance rejection,
  action rejection, and evidence rejection including the v0.9.0a2
  uppercase-SHA tightening).
- `canonicalize(value)` and `CanonicalizationError` in
  `src/canonical.ts` implementing PIC-CJSON/1.0 canonicalization. Passes
  all 11 vendored canonicalization conformance vectors byte-for-byte
  against Repo A `v0.9.0-alpha.2`.
- Manifest-driven canonicalization test suite in
  `test/canonical.test.ts` covering the vendored vectors plus
  implementation-local rejection cases (Date/Map/Set/class instances,
  accessor properties, non-enumerable properties, sparse arrays, cycles,
  own-symbol keys, lone surrogates, non-finite numbers).
- Node.js + TypeScript project skeleton: `package.json`, `tsconfig.json`,
  `eslint.config.mjs` (ESLint flat config), `.prettierrc`, `.editorconfig`,
  `.gitattributes`, `.gitignore`, `LICENSE` (Apache-2.0).
- Vendored `pic-standard` conformance corpus as a git submodule at
  `vendor/pic-standard/`, pinned to Repo A tag `v0.9.0-alpha.2`. This
  tag encodes the schema, evidence, tool-binding, and secure-trust-default
  behavior the TypeScript implementation must model against for v0.9.0
  final.
- Machine-readable version metadata via `getVersion()` in `src/index.ts`
  exposing `implName`, `implVersion`, `picProtocolVersion`,
  `conformanceManifestRef`, and `supportedModes`.
- Fixture loader in `src/fixtures.ts` that reads
  `vendor/pic-standard/conformance/manifest.json` via `fs`/`path` (not
  static JSON imports) and distinguishes "submodule missing" from
  "malformed JSON" in its error surface.
- Vitest smoke test in `test/smoke.test.ts` covering the version
  metadata surface and the manifest read.
- GitHub Actions CI workflow at `.github/workflows/ci.yml`. Runs
  `format:check`, `lint`, `typecheck`, and `test` on Node 20 for every
  push and pull request targeting `main`.
- `CONTRIBUTING.md` with contributor guidance covering setup, development
  workflow, coding style, and DCO sign-off.

### Changed

- `getVersion().supportedModes` now returns `['canonicalization']` (was
  `[]` before B2).

### Notes

- Conformance modes claimed: `canonicalization` only. Core and
  trust-sanitization parity are planned for later work blocks in the
  v0.9.0 track. Evidence-mode parity is out of scope for v0.9.0
  entirely.
- The `@pic-standard/pic-standard-ts` package name is not yet published
  to npm. It is marked `"private": true` and will remain so until an
  explicit release/publish PR removes that guard.
