# Contributing to pic-standard-ts

Thank you for your interest in the TypeScript implementation track for PIC
Standard. This repository is pre-parity and under active development. Before
contributing, please read the sections below.

## Status and expectations

The v0.9.0 target is TypeScript parity with the `pic-standard` Python
reference implementation on the following conformance modes:

- `canonicalization`
- `core`
- `trust_sanitization`

Evidence mode, HTTP bridge, and release/publish parity are explicitly out of
scope for v0.9.0. Any code path that would require those must fail closed
until implemented.

Until the conformance runner passes the modes listed above against the pinned
`pic-standard` corpus, this repository MUST NOT be treated as a conformant
PIC implementation.

## Prerequisites

- Node.js `>=20.19.0`
- npm 10 or newer
- Git with submodule support

Verify:

```bash
node --version
npm --version
git --version
```

## Getting started

Clone the repository with submodules so the vendored `pic-standard` corpus
is available for tests:

```bash
git clone --recurse-submodules https://github.com/pic-standard/pic-standard-ts.git
cd pic-standard-ts
npm ci
```

If you already have a clone without submodules, initialize them:

```bash
git submodule update --init --recursive
```

## Development workflow

Common tasks:

```bash
npm run lint          # ESLint on repository files
npm run format        # Prettier write
npm run format:check  # Prettier check (no write)
npm run typecheck     # tsc --noEmit
npm run test          # vitest run
npm run test:watch    # vitest watch mode
npm run build         # tsc (emits to dist/)
```

CI runs `format:check`, `lint`, `typecheck`, and `test` on every push and
pull request targeting `main`. All four must pass.

## Coding style

Formatting is enforced by Prettier. Linting is enforced by ESLint with the
`typescript-eslint` recommended ruleset. Both run in CI. Do not fight the
tools; adjust the config if a rule genuinely needs revisiting.

- Line endings: LF everywhere except Windows batch scripts. `.gitattributes`
  and `.editorconfig` enforce this.
- Indentation: 2 spaces.
- Line width: 100 characters (Prettier).
- Import order and style: Prettier owns formatting; the linter enforces
  correctness.

## Testing

Vitest runs from the repo root. Tests under `test/` execute the source
files under `src/` directly (transpiled on the fly). Add tests alongside
new modules, not after the fact.

The `vendor/pic-standard/` submodule contains the conformance corpus. Tests
that read the manifest or vectors must degrade gracefully when the
submodule is not initialized (for example via `describe.skipIf`).

## Submitting changes

- Open a pull request against `main`.
- Every commit must be signed off under the Developer Certificate of
  Origin. Use `git commit -s` or add a `Signed-off-by: Name <email>`
  trailer to the commit message.
- Prefer smaller, focused pull requests that touch a single concern.
- Do not commit generated files, build output, or the contents of
  `node_modules/`.

## Reporting issues

Open an issue at
[github.com/pic-standard/pic-standard-ts/issues](https://github.com/pic-standard/pic-standard-ts/issues).
Please do not include secrets, private keys, credentials, or sensitive
deployment details in public issues.

## License

By contributing, you agree that your contributions will be licensed under
the Apache License 2.0. See [`LICENSE`](LICENSE).
