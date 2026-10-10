# Contributing to pic-standard-ts

Thank you for your interest in the TypeScript implementation of PIC Standard.
Before contributing, please read the sections below.

## Status and expectations

v0.9.0, published to npm as `@pic-standard/pic-standard-ts@0.9.0`, passes the
shared conformance corpus from the pinned `pic-standard` release for these
modes:

- `canonicalization`
- `core`
- `trust_sanitization`

Evidence verification and HTTP bridge parity are not implemented. The
conformance runner rejects requests for unsupported evidence mode. This
repository MUST NOT be described as conformant for any mode outside the three
listed above, and evidence mode remains publicly unsupported until its full
acceptance criteria pass.

Evidence-mode support is the next track. It depends on the v1.0 contract that
`pic-standard` is currently stabilizing, so implementation starts only on an
agreed baseline. If you are interested, say so in
[pic-standard discussion #117](https://github.com/pic-standard/pic-standard/discussions/117)
or on [pic-standard#15](https://github.com/pic-standard/pic-standard/issues/15).

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
