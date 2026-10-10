#!/usr/bin/env node
/**
 * Packed-artifact regression test.
 *
 * Runs OUTSIDE the normal unit suite (not invoked by `npm test`) and
 * from an unrelated working directory. Packs this package (the
 * `prepack` script wires in the build), installs the tarball into a
 * throwaway project under `os.tmpdir()`, and runs three cases against
 * the installed consumer-facing export:
 *
 *   - Allow:         a valid read proposal with matching expectedTool
 *   - Block:         wrong expectedTool, expects PIC_TOOL_BINDING_MISMATCH
 *   - Invalid input: proposal missing a required field, expects PIC_SCHEMA_INVALID
 *
 * Exits nonzero on any mismatch. This is the authoritative
 * "consumers of @pic-standard/pic-standard-ts can actually call
 * verifyProposal() after npm install" gate.
 *
 * Child processes are invoked without a shell, through
 * `process.execPath` + `npm_execpath`, so paths with spaces are safe
 * on all platforms. Temporary directories are cleaned up in a
 * `finally` block regardless of outcome.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

const npmExecPath = process.env.npm_execpath;
if (!npmExecPath) {
  console.error(
    'test-packed-artifact: npm_execpath is not set. ' +
      'This script must be invoked via `npm run test:packed`.',
  );
  process.exit(1);
}

function runNpm(args, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  console.log(`$ npm ${args.join(' ')}  (cwd=${cwd})`);
  return execFileSync(process.execPath, [npmExecPath, ...args], {
    stdio: 'inherit',
    ...options,
  });
}

function runNode(args, options = {}) {
  return execFileSync(process.execPath, args, {
    encoding: 'utf-8',
    ...options,
  });
}

let packDir;
let consumerDir;

try {
  // 1. Pack the package. `prepack` runs the build, which copies the
  // schema and compiles TypeScript. No separate build invocation needed.
  packDir = mkdtempSync(join(tmpdir(), 'pic-ts-pack-'));
  runNpm(['pack', '--pack-destination', packDir], { cwd: repoRoot });
  const tarball = readdirSync(packDir).find((f) => f.endsWith('.tgz'));
  if (!tarball) {
    console.error('test-packed-artifact: npm pack produced no .tgz');
    process.exit(1);
  }
  const tarballPath = join(packDir, tarball);
  console.log(`packed: ${tarballPath}`);

  // 2. Install the tarball into a fresh project outside the repo.
  consumerDir = mkdtempSync(join(tmpdir(), 'pic-ts-consumer-'));
  writeFileSync(
    join(consumerDir, 'package.json'),
    JSON.stringify({ name: 'pic-ts-smoke', version: '0.0.0', type: 'module' }, null, 2),
  );
  runNpm(['install', '--no-save', tarballPath], { cwd: consumerDir });

  // 3. Write a smoke script that exercises three cases.
  const smoke = `
import { verifyProposal } from '@pic-standard/pic-standard-ts';

const base = {
  protocol: 'PIC/1.0',
  intent: 'Read public documentation',
  impact: 'read',
  provenance: [{ id: 'request', trust: 'untrusted' }],
  claims: [{ text: 'Read public documentation', evidence: ['request'] }],
  action: { tool: 'docs.read', args: { page: 'overview' } },
};

const results = {};

// Allow
const allowResult = verifyProposal(base, { expectedTool: 'docs.read' });
results.allow = {
  allowed: allowResult.allowed,
  error: allowResult.error?.code ?? null,
};

// Block: wrong expectedTool
const blockResult = verifyProposal(base, { expectedTool: 'docs.delete' });
results.block = {
  allowed: blockResult.allowed,
  error: blockResult.error?.code ?? null,
};

// Invalid input: missing required field (drop action)
const { action, ...invalid } = base;
const invalidResult = verifyProposal(invalid, { expectedTool: 'docs.read' });
results.invalid = {
  allowed: invalidResult.allowed,
  error: invalidResult.error?.code ?? null,
};

console.log(JSON.stringify(results, null, 2));
`;
  const smokePath = join(consumerDir, 'smoke.mjs');
  writeFileSync(smokePath, smoke);

  // 4. Run the smoke script with the same Node, no shell.
  const stdout = runNode([smokePath], { cwd: consumerDir });
  console.log(stdout);
  const results = JSON.parse(stdout);

  const expectations = {
    allow: { allowed: true, error: null },
    block: { allowed: false, error: 'PIC_TOOL_BINDING_MISMATCH' },
    invalid: { allowed: false, error: 'PIC_SCHEMA_INVALID' },
  };

  const diffs = [];
  for (const key of Object.keys(expectations)) {
    const got = results[key];
    const want = expectations[key];
    if (got.allowed !== want.allowed || got.error !== want.error) {
      diffs.push(`${key}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
    }
  }

  if (diffs.length > 0) {
    console.error('test-packed-artifact: MISMATCH');
    for (const d of diffs) console.error(`  - ${d}`);
    process.exit(1);
  }
  console.log('test-packed-artifact: PASS');
} finally {
  if (packDir) rmSync(packDir, { recursive: true, force: true });
  if (consumerDir) rmSync(consumerDir, { recursive: true, force: true });
}
