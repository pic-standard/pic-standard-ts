import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

import { describe, it, expect } from 'vitest';

import { canonicalize, CanonicalizationError } from '../src/canonical.js';
import { CONFORMANCE_ROOT } from '../src/fixtures.js';

/**
 * Canonicalization manifest entry shape (subset of the fields we consume).
 */
interface CanonManifestEntry {
  id: string;
  file: string;
  mode: 'canonicalization';
  expected: 'canonical_match' | 'canonical_reject';
}

/**
 * Vector file shape (union of positive plus negative).
 */
interface CanonVector {
  id: string;
  description: string;
  source: string;
  input: unknown;
  expected_canonical_bytes_hex?: string;
  expected_sha256_hex?: string;
}

interface Manifest {
  version?: string;
  vectors?: unknown[];
}

const manifestPath = resolve(CONFORMANCE_ROOT, 'manifest.json');
const submoduleAvailable = existsSync(manifestPath);

function isCanonManifestEntry(v: unknown): v is CanonManifestEntry {
  if (typeof v !== 'object' || v === null) {
    return false;
  }

  const entry = v as Record<string, unknown>;

  return (
    typeof entry['id'] === 'string' &&
    typeof entry['file'] === 'string' &&
    entry['mode'] === 'canonicalization' &&
    (entry['expected'] === 'canonical_match' || entry['expected'] === 'canonical_reject')
  );
}

function loadCanonicalizationManifest(): CanonManifestEntry[] {
  const raw = readFileSync(manifestPath, 'utf-8');
  const parsed = JSON.parse(raw) as Manifest;
  const vectors = parsed.vectors ?? [];
  const canon: CanonManifestEntry[] = [];
  for (const v of vectors) {
    if (isCanonManifestEntry(v)) {
      canon.push(v);
    }
  }
  return canon;
}

function loadVector(entry: CanonManifestEntry): CanonVector {
  const path = resolve(CONFORMANCE_ROOT, entry.file);
  return JSON.parse(readFileSync(path, 'utf-8')) as CanonVector;
}

const manifest = submoduleAvailable ? loadCanonicalizationManifest() : [];

// ---------------------------------------------------------------------------
// Suite 1: manifest-driven vectors.
//
// Skipped when the vendored pic-standard submodule is not initialized.
// ---------------------------------------------------------------------------

describe.skipIf(!submoduleAvailable)('canonicalize: vendored conformance vectors', () => {
  it('manifest lists at least one canonicalization vector', () => {
    expect(manifest.length).toBeGreaterThan(0);
  });

  for (const entry of manifest) {
    if (entry.expected === 'canonical_match') {
      it(`${entry.id}: byte-exact canonical output`, () => {
        const vector = loadVector(entry);
        expect(vector.expected_canonical_bytes_hex).toBeDefined();
        expect(vector.expected_sha256_hex).toBeDefined();

        const actualBytes = canonicalize(vector.input);
        const actualHex = Buffer.from(actualBytes).toString('hex');
        expect(actualHex).toBe(vector.expected_canonical_bytes_hex);

        const actualSha = createHash('sha256').update(actualBytes).digest('hex');
        expect(actualSha).toBe(vector.expected_sha256_hex);
      });
    } else {
      it(`${entry.id}: rejects with CanonicalizationError`, () => {
        const vector = loadVector(entry);
        expect(() => canonicalize(vector.input)).toThrow(CanonicalizationError);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Suite 2: implementation-local rejections plus normalizations.
//
// Covers cases the vendored vectors cannot express portably (per
// conformance/canonicalization/README.md, section "What is NOT covered
// here"). Runs regardless of submodule availability because the inputs
// are constructed in memory.
// ---------------------------------------------------------------------------

describe('canonicalize: implementation-local rejection', () => {
  it('rejects NaN', () => {
    expect(() => canonicalize(NaN)).toThrow(CanonicalizationError);
  });

  it('rejects +Infinity', () => {
    expect(() => canonicalize(Infinity)).toThrow(CanonicalizationError);
  });

  it('rejects -Infinity', () => {
    expect(() => canonicalize(-Infinity)).toThrow(CanonicalizationError);
  });

  it('rejects undefined', () => {
    expect(() => canonicalize(undefined)).toThrow(CanonicalizationError);
  });

  it('rejects functions', () => {
    expect(() => canonicalize(() => 1)).toThrow(CanonicalizationError);
  });

  it('rejects symbols', () => {
    expect(() => canonicalize(Symbol('x'))).toThrow(CanonicalizationError);
  });

  it('rejects bigint', () => {
    expect(() => canonicalize(1n)).toThrow(CanonicalizationError);
  });

  it('rejects Date instances', () => {
    expect(() => canonicalize(new Date())).toThrow(CanonicalizationError);
  });

  it('rejects Map instances', () => {
    expect(() => canonicalize(new Map())).toThrow(CanonicalizationError);
  });

  it('rejects Set instances', () => {
    expect(() => canonicalize(new Set())).toThrow(CanonicalizationError);
  });

  it('rejects class instances', () => {
    class Point {
      constructor(
        public x: number,
        public y: number,
      ) {}
    }
    expect(() => canonicalize(new Point(1, 2))).toThrow(CanonicalizationError);
  });

  it('rejects plain objects with own symbol keys', () => {
    const obj = { a: 1, [Symbol('secret')]: 2 };
    expect(() => canonicalize(obj)).toThrow(CanonicalizationError);
  });

  it('rejects circular references', () => {
    const obj: Record<string, unknown> = {};
    obj['self'] = obj;
    expect(() => canonicalize(obj)).toThrow(CanonicalizationError);
  });

  it('rejects lone high surrogate carried by host string', () => {
    expect(() => canonicalize({ v: '\uD800' })).toThrow(CanonicalizationError);
  });

  it('rejects lone low surrogate carried by host string', () => {
    expect(() => canonicalize({ v: '\uDC00' })).toThrow(CanonicalizationError);
  });

  it('normalizes -0 to 0 in output bytes', () => {
    const bytes = canonicalize({ v: -0 });
    expect(new TextDecoder('utf-8').decode(bytes)).toBe('{"v":0}');
  });

  it('accepts null-prototype plain objects', () => {
    const obj = Object.create(null) as Record<string, unknown>;
    obj['a'] = 1;
    const bytes = canonicalize(obj);
    expect(new TextDecoder('utf-8').decode(bytes)).toBe('{"a":1}');
  });
});
