# PIC Standard TypeScript

TypeScript implementation track for PIC Standard.

This repository is currently pre-parity. The implementation target is PIC
`v0.9.0-alpha.2`, pinned from the canonical
[`pic-standard/pic-standard`](https://github.com/pic-standard/pic-standard)
repository. Until the conformance runner passes canonicalization, core,
and trust-sanitization modes, this package should not be treated as a
conformant PIC implementation.

## Status

- Pre-parity. The package exposes only machine-readable version metadata.
  No verifier surface is exported yet.
- No published npm release. The package is marked `"private": true` and
  will remain so until an explicit release/publish PR removes that guard.
- Conformance corpus is consumed via a git submodule pinned to
  [`pic-standard/pic-standard@v0.9.0-alpha.2`](https://github.com/pic-standard/pic-standard/tree/v0.9.0-alpha.2).

## Implementation target

Target baseline: PIC `v0.9.0-alpha.2`.

Planned v0.9.0 parity scope:

- `canonicalization`
- `core`
- `trust_sanitization`

Not in v0.9.0 scope:

- evidence-mode parity
- signature verification parity
- HTTP bridge parity
- release/publish parity with the Python package

Evidence mode is intentionally excluded from the initial TypeScript parity
target. Until implemented, evidence-related paths must fail closed rather
than behave as permissive stubs.

## Getting started

Clone with submodules so the vendored `pic-standard` corpus is available:

```bash
git clone --recurse-submodules https://github.com/pic-standard/pic-standard-ts.git
cd pic-standard-ts
npm ci
```

Run the test suite (Vitest):

```bash
npm test
```

Run the full check set locally (mirrors CI):

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
```

## Repository layout

```
pic-standard-ts/
├── src/                   TypeScript source
├── test/                  Vitest test suite
├── vendor/pic-standard/   git submodule pinned to Repo A v0.9.0-alpha.2
├── .github/workflows/     GitHub Actions CI
├── eslint.config.mjs      ESLint flat config
├── tsconfig.json          TypeScript compiler options
├── .prettierrc            Prettier config
└── package.json
```

## Relationship to `pic-standard`

The canonical PIC Standard specification and Python reference implementation
live at
[`pic-standard/pic-standard`](https://github.com/pic-standard/pic-standard).
That repository defines the protocol, hosts the conformance manifest and
vectors, and ships the Python verifier that this TypeScript implementation
is measured against.

This repository consumes a specific tagged snapshot of the Python repository
as a git submodule under `vendor/pic-standard/`. The submodule pin defines
which version of the protocol this TypeScript implementation targets. When
the TypeScript implementation reaches parity for the listed modes, its own
tag can claim conformance against the corresponding `pic-standard` tag.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for setup, development workflow,
coding style, and how to submit changes.

## License

Apache-2.0. See [`LICENSE`](LICENSE).
