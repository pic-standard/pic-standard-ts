import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

import { CONFORMANCE_ROOT, readManifest } from '../src/fixtures.js';
import { getVersion } from '../src/index.js';

/**
 * The vendored pic-standard corpus is only present after
 * `git submodule update --init --recursive`. When absent (e.g. during
 * skeleton scaffolding before the submodule is added), the
 * conformance-corpus tests skip; version-metadata tests still run.
 */
const submoduleAvailable = existsSync(resolve(CONFORMANCE_ROOT, 'manifest.json'));

describe('version metadata', () => {
  it('exposes the expected implementation identity', () => {
    const v = getVersion();
    expect(v.implName).toBe('pic-standard-ts');
    expect(v.implVersion).toBe('0.0.0-alpha.0');
    expect(v.picProtocolVersion).toBe('PIC/1.0');
    expect(v.conformanceManifestRef).toBe('v0.9.0-alpha.2');
  });

  it('claims canonicalization parity', () => {
    const v = getVersion();
    expect(v.supportedModes).toEqual(['canonicalization']);
  });
});

describe.skipIf(!submoduleAvailable)('vendored conformance corpus', () => {
  it('loads a well-formed JSON manifest', () => {
    const manifest = readManifest();
    expect(typeof manifest).toBe('object');
    expect(manifest).not.toBeNull();
  });
});
