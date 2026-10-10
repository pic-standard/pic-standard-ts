# Evaluate PIC Standard for TypeScript

This repository provides PIC-CJSON/1.0 canonicalization, proposal
schema validation and core PIC verification for Node.js. It implements
the `canonicalization`, `core` and `trust_sanitization` conformance
modes. License: Apache-2.0. Node.js 20.19.0 or later. Published to npm
as [`@pic-standard/pic-standard-ts`](https://www.npmjs.com/package/@pic-standard/pic-standard-ts).

Use this implementation when you need those primitives in a JavaScript
or TypeScript application. If you need signature verification or
trusted provenance derived from evidence, use the [Python
implementation](https://github.com/pic-standard/pic-standard) directly
or through its [HTTP bridge](https://github.com/pic-standard/pic-standard/blob/main/openapi/pic-bridge.v1.yaml).
Evidence-mode TypeScript parity is a current capability gap, planned
for completion in the v0.9.x series.

## Know the current boundary

`verifyProposal()` validates the proposal, rejects duplicate
provenance IDs, sanitizes incoming trust by default, checks an
independently supplied tool name, and evaluates the core causal
contract.

It does not verify signatures, verify evidence content, or derive
trusted provenance from evidence. With default strict trust, `money`,
`privacy` and `irreversible` proposals cannot satisfy the
trusted-provenance requirement in this implementation. Including a
signature-shaped object does not change that. Do not disable strict
trust to substitute for missing evidence verification.

The function returns `{ allowed, error, eval_ms }`. It does not
execute tools. A successful result is not proof that an action
occurred, that arguments have business approval, or that the declared
impact is accurate. The calling application must enforce its own
impact classification and execution boundary.

## Install and run a small check

Pin to `@pic-standard/pic-standard-ts@0.9.1` or later. Earlier
published versions could not read the proposal schema after a normal
`npm install`.

```bash
mkdir pic-ts-check && cd pic-ts-check
npm init -y
npm install @pic-standard/pic-standard-ts@^0.9.1
```

Save this as `check-pic.mjs` and run `node check-pic.mjs`:

```javascript
import assert from 'node:assert/strict';
import { verifyProposal } from '@pic-standard/pic-standard-ts';

const read = {
  protocol: 'PIC/1.0',
  intent: 'Read public documentation',
  impact: 'read',
  provenance: [{ id: 'request', trust: 'untrusted' }],
  claims: [{ text: 'Read public documentation', evidence: ['request'] }],
  action: { tool: 'docs.read', args: { page: 'overview' } },
};

const allowed = verifyProposal(read, { expectedTool: 'docs.read' });
assert.equal(allowed.allowed, true);

const wrongTool = verifyProposal(read, { expectedTool: 'docs.delete' });
assert.equal(wrongTool.allowed, false);
assert.equal(wrongTool.error.code, 'PIC_TOOL_BINDING_MISMATCH');

const payment = {
  ...read,
  intent: 'Send a payment',
  impact: 'money',
  provenance: [{ id: 'request', trust: 'trusted' }],
  claims: [{ text: 'Payment approved', evidence: ['request'] }],
  action: { tool: 'payments.send', args: { amount: 50, currency: 'EUR' } },
};
const blocked = verifyProposal(payment, { expectedTool: 'payments.send' });
assert.equal(blocked.allowed, false);
assert.equal(blocked.error.code, 'PIC_VERIFIER_FAILED');

console.log('PASS: read allowed; wrong tool and self-asserted payment blocked');
```

This checks an allowed read, exact tool-name binding, and rejection of
self-asserted authority on a `money` proposal under default strict
trust. No tool executes. The amounts here are illustrative application
arguments, not a PIC-defined money representation.

In an integration, obtain `expectedTool` from the application's actual
dispatch target. Omitting it or passing an empty string skips tool
binding. A tool-name check does not compare separately dispatched
arguments against `action.args`.

## Verify scope and follow the source

The conformance corpus is a repository-only workflow; run it from a
Git checkout with the pinned submodule initialized:

```bash
git clone --recurse-submodules https://github.com/pic-standard/pic-standard-ts.git
cd pic-standard-ts
npm ci
npm run conformance
```

That filters the vendored manifest to the three supported modes
(`canonicalization`, `core`, `trust_sanitization`). Evidence mode is
unsupported; a passing run does not imply evidence-mode parity. For
machine-readable output:

```bash
npm run conformance:json
```

The packed-artifact smoke test is run as part of CI on every PR; you
can reproduce it locally with:

```bash
npm run test:packed
```

which packs the package, installs the tarball into a throwaway
project, and asserts allow / wrong-tool / invalid-input outcomes
against the installed consumer-facing export.

Read [pipeline options and results](https://github.com/pic-standard/pic-standard-ts/blob/main/src/pipeline.ts),
the [schema loader](https://github.com/pic-standard/pic-standard-ts/blob/main/src/schema.ts),
and [contribution instructions](https://github.com/pic-standard/pic-standard-ts/blob/main/CONTRIBUTING.md)
for the current implementation. The canonical specification and
vectors belong to the Python repository; this repository implements
that shared contract.

Record the installed package version when reporting results. For a
reproducible evaluation against a specific submodule pin, also record
the parent commit and `git submodule status` of a checkout at that
pin. Use the corpus pinned by the checkout rather than replacing it
with another main-branch snapshot.
