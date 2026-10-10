#!/usr/bin/env node
/**
 * Copy the PIC proposal schema from the pinned pic-standard submodule
 * into this package's `schemas/` directory so it ships inside the npm
 * tarball and is loadable from both `src/` (tests) and `dist/`
 * (consumers) via an `import.meta.url`-relative path.
 *
 * Fails fast if the source schema is missing: that is the real
 * invariant we want to catch at build time, not at runtime for a
 * consumer who did `npm install` and expected a working package.
 */

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

const SOURCE = resolve(
  repoRoot,
  'vendor',
  'pic-standard',
  'sdk-python',
  'pic_standard',
  'schemas',
  'proposal_schema.json',
);
const DEST_DIR = resolve(repoRoot, 'schemas');
const DEST = resolve(DEST_DIR, 'proposal_schema.json');

if (!existsSync(SOURCE)) {
  console.error(
    `copy-schema: source schema not found at ${SOURCE}. ` +
      `Run \`git submodule update --init --recursive\` to fetch the ` +
      `vendored pic-standard corpus before building.`,
  );
  process.exit(1);
}

mkdirSync(DEST_DIR, { recursive: true });
copyFileSync(SOURCE, DEST);
console.log(`copy-schema: wrote ${DEST}`);
