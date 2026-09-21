# Changelog

All notable changes to this project will be documented in this file.

This project follows Semantic Versioning:
https://semver.org/

## [0.9.0] - 2026-09-21

First v0.9.0 release of the TypeScript implementation of PIC Standard.
Passes the shared conformance corpus from
[`pic-standard/pic-standard@v0.9.0`](https://github.com/pic-standard/pic-standard/releases/tag/v0.9.0)
for `canonicalization`, `core`, and `trust_sanitization` modes (42 of
84 vectors in the claimed-mode subset). Advisory differential CI in
this repository confirms parity against the Python reference
implementation on every pull request targeting `main`. Evidence-mode
parity, signature verification, and evidence-derived trust remain out
of scope for v0.9.0 and are v0.9.x completion items, so this package
MUST NOT be treated as implementing full PIC evidence-mode verifier
semantics. Published to npm under the `alpha` dist-tag:
`npm install @pic-standard/pic-standard-ts@alpha`.

### Added

- Advisory differential CI job (`Differential CI vs Python (advisory)`)
  in `.github/workflows/ci.yml`. Runs on `push` to `main` and
  `pull_request` targeting `main`; Node 20 only (matrix Node coverage
  handled by the `build` job). Installs `pic_standard` from the
  vendored `pic-standard` repository root so the Python package
  metadata, manifest, schema, vectors, and reference verifier all
  come from the same pinned commit. Emits both
  TypeScript and Python conformance envelopes for the three claimed
  modes (canonicalization + core + trust_sanitization; evidence is
  deliberately unimplemented in TS), then compares the plan section
  8.2 semantic subset via `scripts/diff_conformance.py`. Not part of
  branch protection: a red diff surfaces real signal without blocking
  merges. Release-tag gating is deferred to B10. On failure, uploads
  `py.json`, `ts.json`, and `diff.txt` as a run-scoped artifact for
  7 days.
- `scripts/diff_conformance.py` implementing the plan section 8.2
  differential-conformance contract. Two-positional-arg CLI
  (`python scripts/diff_conformance.py <a.json> <b.json>`), stable so
  Repo A's future authoritative script can drop in without churn.
  Projects each envelope to
  `{summary: {total, passed, failed, all_passed, diagnostic},
exit_code, results[]: {id, passed, reason_code}}` with `results[]`
  order preserved, canonicalizes with sorted keys + LF + indent, and
  byte-compares. Exit codes: 0 match, 1 differ (unified diff to
  stderr), 2 usage/malformed-input. Custom `InputError` for bad-input
  paths (helpers never call `SystemExit` directly).
- `scripts/test_diff_conformance.py` self-test (15 tests) pinning the
  projection contract independently of real runner output. Verifies
  match on identical envelopes, on message-only diffs, on
  selection/manifest_version diffs, and on `results[].mode` diffs;
  differ on `reason_code` / result-order / `passed` / `exit_code` /
  `summary.diagnostic` diffs; exit 2 on missing summary,
  missing-summary-field, missing-result-field, malformed JSON, missing
  file, and wrong-arg-count.
- Conformance runner in `src/run.ts` producing a differential-CI-ready
  JSON envelope. Public entry `runConformance(options): Envelope` never
  throws; also exports `renderJson`, `renderHuman`, and the envelope
  types. CLI shim `pic-ts-run` invoked via `node dist/run.js` with
  Commander flags: `--manifest`, `--filter-mode` (repeatable, union),
  `--filter-id` (repeatable, union), `--json`, `--verbose`. Exit codes
  0/1/2 match Repo A's Python runner. Envelope shape mirrors
  `vendor/pic-standard/conformance/run.py`'s `JsonRenderer.render_report`
  semantic subset (`.summary`, `.exit_code`, `.results[]`). Filter
  values normalized (dedup preserving order). Manifest-load validation
  covers path escape, unknown modes, duplicate IDs (all
  `manifest_invalid` at exit 2, no vectors executed) and missing
  referenced vector files (`manifest_drift` as a per-vector result).
  Canonicalization-throw-on-match returns `verdict_mismatch`, not
  `runner_error`.
- Runner test suite in `test/run.test.ts` (21 tests across 7 suites).
  Envelope shape guard; exact vector counts (11 canon, 7 core, 24
  trust_san, 42 three-mode, >42 unfiltered with evidence failures);
  manifest-order pinning against the vendored manifest via
  `manifestIdsForModes` helper; filter union semantics; unsupported-mode
  and unknown-id exit codes; manifest error handling via temp files
  (missing, malformed, duplicate IDs, unknown mode, path escape, missing
  vector file); never-throws contract with envelope validation on both
  branches; renderer contracts (`renderJson` JSON.parse round-trip and
  filter dedup preservation).
- `conformance` and `conformance:json` npm scripts for local reproduction
  of the manifest run over the three claimed modes. Both are
  self-contained (they invoke `npm run build` first) so they work from a
  clean checkout after `npm ci`.
- CI Build and Conformance steps in `.github/workflows/ci.yml`. Build
  compiles `src/` to `dist/`; Conformance runs `npm run conformance`
  against the vendored manifest. Any regression in the 42 claimed-mode
  vectors turns CI red.
- Trust-sanitization vector test suite in
  `test/trust_sanitization.test.ts` (27 tests). Manifest-driven against
  the vendored 24-vector matrix (`strict_trust × verify_evidence` across
  6 proposal bases). Explicit block-branch guard requires every block
  vector to carry an `expected_error_code`. Explicit
  `verify_evidence`-is-ignored guard pins that evidence-mode is out of
  the v0.9.0 TS scope. Direct local test pins `strictTrust` default as
  equivalent to `strictTrust: true`.
- `verifyProposal(proposal, options?)` in `src/pipeline.ts` implementing
  the PIC/1.0 core verifier pipeline. Runs (in order) schema validation,
  duplicate provenance-id check, strict-trust sanitization (defensive
  copy; default `true` per v0.9.0a2), tool binding, and the core causal
  contract. Returns a `VerifyResult` discriminated union
  `{allowed, error, eval_ms}`. Timing via `node:perf_hooks`
  `performance.now()`. Schema-invalid input returns a `VerifyResult`
  with `PIC_SCHEMA_INVALID`; no exception escapes for bad user input.
- Pure verification primitives in `src/verifier.ts`:
  `findDuplicateProvenanceId`, `sanitizeTrust`, `checkToolBinding`,
  `checkCausalContract`, `isHighImpact`. No I/O, no schema, no evidence
  verification.
- Pipeline test suite in `test/pipeline.test.ts` (33 tests). Manifest-
  driven vendored core vectors (all 7 pass expected allow/block verdicts
  and error codes), plus local behavior tests, error-precedence pin,
  high-impact enum coverage, a mutation guard on strict-trust
  sanitization, and an explicit no-trust-elevation test for top-level
  evidence.
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
  `format:check`, `lint`, `typecheck`, `test`, `build`, and
  `conformance` on Node 20 for every push and pull request targeting
  `main`.
- `CONTRIBUTING.md` with contributor guidance covering setup, development
  workflow, coding style, and DCO sign-off.

### Changed

- **Submodule pin bumped from `pic-standard/pic-standard@v0.9.0-alpha.2` to `pic-standard/pic-standard@v0.9.0`.** The claimed modes (`canonicalization`, `core`, `trust_sanitization`) continue to pass against the pinned shared corpus; advisory differential CI confirms semantic-subset parity against the Python reference implementation on pull requests targeting `main`.
- **`package.json`**: `version` bumped from `0.0.0-alpha.0` to `0.9.0`; `description` updated to name the shipped modes explicitly; `"private": true` removed to allow `npm publish --access public --tag alpha` (npm dist-tag `alpha`, not `latest`).
- CI now runs a matrix of Node 20 and Node 22 (was Node 20 only before
  B8). `fail-fast: false` so both legs surface independent results.
  Node 20 stays as the engines floor (`>=20.19.0`) and the v0.9.0
  compatibility floor; Node 22 covers the newer supported LTS line
  used by many current deployments. Node 24+ expansion is
  intentionally deferred. Two check runs per PR:
  `Build & test (Node 20)` and `Build & test (Node 22)`.
- `getVersion().supportedModes` now returns
  `['canonicalization', 'core', 'trust_sanitization']` (was
  `['canonicalization', 'core']` before B6, `['canonicalization']`
  before B5, `[]` before B2).
- Public positioning updated to reflect that verifier decisions,
  core parity, and trust-sanitization parity are now implemented.
  Evidence-mode parity, signature verification, and evidence-derived
  trust remain explicitly out of the current claim.

### Notes

- The differential CI job is deliberately advisory: it can fail visibly on PRs, but it is not in the required-checks list on `main`. Release-tag gating (making the differential a required check for `pic-standard-ts` release tags) is deferred to v0.9.x.
- Conformance modes claimed: `canonicalization`, `core`, and
  `trust_sanitization`. Evidence-mode parity, signature verification,
  and evidence-derived trust remain out of scope for v0.9.0.
- The conformance runner covers ONLY the modes in `supportedModes`.
  Explicit `--filter-mode evidence` fails fast with exit 2, diagnostic
  `runner_error`, and no vectors executed. Unfiltered runs mark
  evidence-mode vectors failed with `runner_error` message ("evidence
  mode not supported in this build; scheduled for v0.9.x") but do not
  abort other vectors.
- The runner is a tooling surface, not part of the library barrel.
  `src/index.ts` continues to export only the library API
  (`canonicalize`, `verifyProposal`, `PICErrorCode`, `validateProposal`,
  `getVersion`, plus the PIC/1.0 type surface). The runner is invoked
  after build via `node dist/run.js`.
- The `@pic-standard/pic-standard-ts` package is published to npm as `0.9.0` under the `alpha` dist-tag. Install with `npm install @pic-standard/pic-standard-ts@alpha`. The default `npm install @pic-standard/pic-standard-ts` (no dist-tag) does NOT resolve to `0.9.0` until an explicit `npm dist-tag add @pic-standard/pic-standard-ts@0.9.0 latest`. `0.9.0` is immutable on npm; any fix ships as a new version.
