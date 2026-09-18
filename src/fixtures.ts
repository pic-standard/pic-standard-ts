/**
 * Fixture loader for the vendored pic-standard conformance corpus.
 *
 * The `pic-standard` repository is pinned as a git submodule at
 * `vendor/pic-standard/`. Its conformance manifest and vectors are
 * loaded from disk (not via static JSON imports) so builds and tests
 * do not depend on Node ESM JSON import-attribute behavior.
 *
 * If the submodule is not initialized (e.g. a fresh clone without
 * `git submodule update --init --recursive`), the loader throws a
 * clear error rather than silently returning an empty result.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Absolute path to the vendored pic-standard conformance directory.
 *
 * Resolves from the current working directory. Repo-local scripts and
 * CI run from the repository root, which keeps the path stable both
 * when Vitest executes TypeScript directly and when compiled JavaScript
 * is executed from `dist/`.
 */
export const CONFORMANCE_ROOT = resolve(process.cwd(), 'vendor', 'pic-standard', 'conformance');

/**
 * Load and parse `vendor/pic-standard/conformance/manifest.json`.
 *
 * Throws a descriptive error if the submodule is not initialized, or a
 * distinct error if the file is present but malformed.
 */
export function readManifest(): unknown {
  const manifestPath = resolve(CONFORMANCE_ROOT, 'manifest.json');
  let raw: string;
  try {
    raw = readFileSync(manifestPath, 'utf-8');
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not read ${manifestPath}: ${detail}. ` +
        'Run `git submodule update --init --recursive` to fetch the ' +
        'vendored pic-standard corpus.',
    );
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Malformed JSON in ${manifestPath}: ${detail}`);
  }
}
