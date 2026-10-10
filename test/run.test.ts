import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CONFORMANCE_ROOT } from '../src/fixtures.js';
import { renderJson, runConformance, type Envelope } from '../src/run.js';

const REAL_MANIFEST = resolve(CONFORMANCE_ROOT, 'manifest.json');
const submoduleAvailable = existsSync(REAL_MANIFEST);

/**
 * Read the real manifest and return the ordered list of vector IDs whose
 * mode is in `modes`. Used to pin runner output ordering against the
 * manifest's declared order.
 */
function manifestIdsForModes(
  modes: readonly string[],
  filterIds: readonly string[] = [],
): string[] {
  const raw = readFileSync(REAL_MANIFEST, 'utf-8');
  const parsed = JSON.parse(raw) as { vectors?: Array<{ id?: unknown; mode?: unknown }> };

  const anyFilter = modes.length > 0 || filterIds.length > 0;

  return (parsed.vectors ?? [])
    .filter((v) => {
      if (typeof v.id !== 'string') return false;
      if (!anyFilter) return true;
      return modes.includes(String(v.mode)) || filterIds.includes(String(v.id));
    })
    .map((v) => String(v.id));
}

/**
 * Structural envelope shape guard: every required top-level field is
 * present and typed correctly. Used across suites to catch shape drift.
 */
function assertEnvelopeShape(env: Envelope): void {
  expect(env).toHaveProperty('manifest_version');
  expect(env).toHaveProperty('selection');
  expect(env.selection).toHaveProperty('total_in_manifest');
  expect(env.selection).toHaveProperty('selected');
  expect(env.selection).toHaveProperty('filter_modes');
  expect(env.selection).toHaveProperty('filter_ids');
  expect(Array.isArray(env.selection.filter_modes)).toBe(true);
  expect(Array.isArray(env.selection.filter_ids)).toBe(true);

  expect(env).toHaveProperty('results');
  expect(Array.isArray(env.results)).toBe(true);
  for (const r of env.results) {
    expect(r).toHaveProperty('id');
    expect(r).toHaveProperty('mode');
    expect(r).toHaveProperty('passed');
    expect(r).toHaveProperty('reason_code');
    expect(r).toHaveProperty('message');
    if (r.passed) {
      expect(r.reason_code).toBeNull();
      expect(r.message).toBeNull();
    } else {
      expect(typeof r.reason_code).toBe('string');
      expect(typeof r.message).toBe('string');
    }
  }

  expect(env).toHaveProperty('summary');
  const s = env.summary;
  expect(s).toHaveProperty('total');
  expect(s).toHaveProperty('passed');
  expect(s).toHaveProperty('failed');
  expect(s).toHaveProperty('all_passed');
  expect(s).toHaveProperty('diagnostic');
  expect(s).toHaveProperty('message');
  expect(s.total).toBe(s.passed + s.failed);

  expect(env).toHaveProperty('exit_code');
  expect([0, 1, 2]).toContain(env.exit_code);
}

// ---------------------------------------------------------------------------
// Suite 1: envelope shape guard on a golden run.
// ---------------------------------------------------------------------------

describe.skipIf(!submoduleAvailable)('runConformance: envelope shape', () => {
  it('emits an envelope with all required top-level fields for a claimed-modes run', () => {
    const env = runConformance({
      manifest: REAL_MANIFEST,
      filterModes: ['canonicalization', 'core', 'trust_sanitization'],
    });
    assertEnvelopeShape(env);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: happy paths (single mode + golden three-mode + unfiltered).
// ---------------------------------------------------------------------------
describe.skipIf(!submoduleAvailable)('runConformance: happy paths', () => {
  it('canonicalization-only filter passes all vectors, exit 0', () => {
    const expectedIds = manifestIdsForModes(['canonicalization']);
    expect(expectedIds.length).toBeGreaterThan(0);

    const env = runConformance({ manifest: REAL_MANIFEST, filterModes: ['canonicalization'] });
    assertEnvelopeShape(env);

    expect(env.results.map((r) => r.id)).toEqual(expectedIds);
    expect(env.summary.total).toBe(expectedIds.length);
    expect(env.summary.passed).toBe(expectedIds.length);
    expect(env.summary.failed).toBe(0);
    expect(env.summary.all_passed).toBe(true);
    expect(env.exit_code).toBe(0);
  });

  it('core-only filter passes all vectors, exit 0', () => {
    const expectedIds = manifestIdsForModes(['core']);
    expect(expectedIds.length).toBeGreaterThan(0);

    const env = runConformance({ manifest: REAL_MANIFEST, filterModes: ['core'] });
    assertEnvelopeShape(env);

    expect(env.results.map((r) => r.id)).toEqual(expectedIds);
    expect(env.summary.total).toBe(expectedIds.length);
    expect(env.summary.passed).toBe(expectedIds.length);
    expect(env.summary.failed).toBe(0);
    expect(env.summary.all_passed).toBe(true);
    expect(env.selection.selected).toBe(expectedIds.length);
    expect(env.exit_code).toBe(0);
  });

  it('trust_sanitization-only filter passes all vectors, exit 0', () => {
    const expectedIds = manifestIdsForModes(['trust_sanitization']);
    expect(expectedIds.length).toBeGreaterThan(0);

    const env = runConformance({ manifest: REAL_MANIFEST, filterModes: ['trust_sanitization'] });
    assertEnvelopeShape(env);

    expect(env.results.map((r) => r.id)).toEqual(expectedIds);
    expect(env.summary.total).toBe(expectedIds.length);
    expect(env.summary.passed).toBe(expectedIds.length);
    expect(env.summary.failed).toBe(0);
    expect(env.summary.all_passed).toBe(true);
    expect(env.selection.selected).toBe(expectedIds.length);
    expect(env.exit_code).toBe(0);
  });

  it('golden three-claimed-modes filter passes all selected vectors, exit 0', () => {
    const modes = ['canonicalization', 'core', 'trust_sanitization'];
    const expectedIds = manifestIdsForModes(modes);
    expect(expectedIds.length).toBeGreaterThan(0);

    const env = runConformance({
      manifest: REAL_MANIFEST,
      filterModes: modes,
    });
    assertEnvelopeShape(env);

    expect(env.results.map((r) => r.id)).toEqual(expectedIds);
    expect(env.summary.total).toBe(expectedIds.length);
    expect(env.summary.passed).toBe(expectedIds.length);
    expect(env.summary.failed).toBe(0);
    expect(env.summary.all_passed).toBe(true);
    expect(env.selection.selected).toBe(expectedIds.length);
    expect(env.exit_code).toBe(0);
  });

  it('unfiltered run includes evidence-mode failures, exit 1', () => {
    const allManifestIds = manifestIdsForModes([
      'canonicalization',
      'core',
      'trust_sanitization',
      'evidence',
    ]);
    const expectedEvidenceIds = manifestIdsForModes(['evidence']);

    expect(allManifestIds.length).toBeGreaterThan(0);
    expect(expectedEvidenceIds.length).toBeGreaterThan(0);

    const env = runConformance({ manifest: REAL_MANIFEST });
    assertEnvelopeShape(env);

    expect(env.selection.total_in_manifest).toBe(allManifestIds.length);
    expect(env.selection.selected).toBe(allManifestIds.length);
    expect(env.summary.total).toBe(allManifestIds.length);

    expect(env.summary.failed).toBe(expectedEvidenceIds.length);
    expect(env.summary.passed).toBe(allManifestIds.length - expectedEvidenceIds.length);
    expect(env.summary.all_passed).toBe(false);

    expect(env.results.map((r) => r.id)).toEqual(allManifestIds);

    const evidenceResults = env.results.filter((r) => r.mode === 'evidence');
    expect(evidenceResults.map((r) => r.id)).toEqual(expectedEvidenceIds);
    for (const r of evidenceResults) {
      expect(r.passed).toBe(false);
      expect(r.reason_code).toBe('runner_error');
    }
    expect(env.exit_code).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: filter semantics (union, ordering).
// ---------------------------------------------------------------------------
describe.skipIf(!submoduleAvailable)('runConformance: filter semantics', () => {
  it('filter-mode and filter-id union together dynamically', () => {
    const expectedIds = manifestIdsForModes(['canonicalization'], ['core-allow-001-read-only']);
    expect(expectedIds.length).toBeGreaterThan(0);

    const env = runConformance({
      manifest: REAL_MANIFEST,
      filterModes: ['canonicalization'],
      filterIds: ['core-allow-001-read-only'],
    });

    assertEnvelopeShape(env);
    expect(env.results.map((r) => r.id)).toEqual(expectedIds);
    expect(env.summary.total).toBe(expectedIds.length);
  });

  it('overlapping mode and id selections deduplicate perfectly', () => {
    const expectedIds = manifestIdsForModes(['core']);
    expect(expectedIds.length).toBeGreaterThan(0);

    const env = runConformance({
      manifest: REAL_MANIFEST,
      filterModes: ['core'],
      filterIds: ['core-allow-001-read-only'],
    });

    assertEnvelopeShape(env);
    expect(env.results.map((r) => r.id)).toEqual(expectedIds);
    expect(env.summary.total).toBe(expectedIds.length);
  });

  it('results order matches manifest order after filtering', () => {
    const modes = ['canonicalization', 'core', 'trust_sanitization'];
    const expectedIds = manifestIdsForModes(modes);
    expect(expectedIds.length).toBeGreaterThan(0);

    const env = runConformance({
      manifest: REAL_MANIFEST,
      filterModes: modes,
    });

    expect(env.results.map((r) => r.id)).toEqual(expectedIds);
  });
});
// ---------------------------------------------------------------------------
// Suite 4: unsupported / unknown filter values (exit 2).
// ---------------------------------------------------------------------------

describe.skipIf(!submoduleAvailable)('runConformance: unsupported filter handling', () => {
  it('explicit --filter-mode evidence returns exit 2 with runner_error diagnostic and no results', () => {
    const env = runConformance({ manifest: REAL_MANIFEST, filterModes: ['evidence'] });
    assertEnvelopeShape(env);
    expect(env.exit_code).toBe(2);
    expect(env.summary.diagnostic).toBe('runner_error');
    expect(env.summary.message).toMatch(/evidence.*not supported/i);
    // Explicit unsupported-mode selection is a request error, not a run
    // with failing vectors. No vectors are executed.
    expect(env.results).toEqual([]);
    expect(env.summary.total).toBe(0);
  });

  it('unknown --filter-mode returns exit 2 with runner_error diagnostic', () => {
    const env = runConformance({ manifest: REAL_MANIFEST, filterModes: ['not-a-real-mode'] });
    assertEnvelopeShape(env);
    expect(env.exit_code).toBe(2);
    expect(env.summary.diagnostic).toBe('runner_error');
    expect(env.results).toEqual([]);
    expect(env.summary.total).toBe(0);
  });

  it('unknown --filter-id returns exit 2 with no_vectors_selected diagnostic', () => {
    const env = runConformance({ manifest: REAL_MANIFEST, filterIds: ['does-not-exist'] });
    assertEnvelopeShape(env);
    expect(env.exit_code).toBe(2);
    expect(env.summary.diagnostic).toBe('no_vectors_selected');
  });
});

// ---------------------------------------------------------------------------
// Suite 5: manifest error handling (never throws; envelope always returned).
// ---------------------------------------------------------------------------

describe('runConformance: manifest errors', () => {
  let tmpRoot: string;

  beforeAll(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'pic-ts-run-test-'));
  });

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('missing manifest file returns exit 2 with manifest_invalid, does not throw', () => {
    const missing = join(tmpRoot, 'does-not-exist.json');
    let env: Envelope | undefined;
    expect(() => {
      env = runConformance({ manifest: missing });
    }).not.toThrow();
    expect(env).toBeDefined();
    if (env) {
      assertEnvelopeShape(env);
      expect(env.exit_code).toBe(2);
      expect(env.summary.diagnostic).toBe('manifest_invalid');
    }
  });

  it('malformed manifest JSON returns exit 2 with manifest_invalid', () => {
    const bad = join(tmpRoot, 'bad.json');
    writeFileSync(bad, '{ not valid json', 'utf-8');
    const env = runConformance({ manifest: bad });
    assertEnvelopeShape(env);
    expect(env.exit_code).toBe(2);
    expect(env.summary.diagnostic).toBe('manifest_invalid');
  });

  it('duplicate vector IDs in manifest return exit 2 with manifest_invalid', () => {
    const dup = join(tmpRoot, 'dup.json');
    writeFileSync(
      dup,
      JSON.stringify({
        version: 'conformance/v0.1',
        vectors: [
          {
            id: 'x',
            file: 'canonicalization/001.json',
            mode: 'canonicalization',
            expected: 'canonical_match',
          },
          {
            id: 'x',
            file: 'canonicalization/002.json',
            mode: 'canonicalization',
            expected: 'canonical_match',
          },
        ],
      }),
      'utf-8',
    );
    const env = runConformance({ manifest: dup });
    assertEnvelopeShape(env);
    expect(env.exit_code).toBe(2);
    expect(env.summary.diagnostic).toBe('manifest_invalid');
    expect(env.summary.message).toMatch(/duplicate/i);
  });

  it('unknown manifest mode returns exit 2 with manifest_invalid', () => {
    const badMode = join(tmpRoot, 'bad-mode.json');
    writeFileSync(
      badMode,
      JSON.stringify({
        version: 'conformance/v0.1',
        vectors: [
          {
            id: 'x',
            file: 'canonicalization/001.json',
            mode: 'not-a-real-mode',
            expected: 'canonical_match',
          },
        ],
      }),
      'utf-8',
    );

    const env = runConformance({ manifest: badMode });
    assertEnvelopeShape(env);
    expect(env.exit_code).toBe(2);
    expect(env.summary.diagnostic).toBe('manifest_invalid');
    expect(env.results).toEqual([]);
    expect(env.summary.message).toMatch(/unknown mode/i);
  });

  it('path-escaping vector file path returns exit 2 with manifest_invalid before execution', () => {
    const escape = join(tmpRoot, 'escape.json');
    writeFileSync(
      escape,
      JSON.stringify({
        version: 'conformance/v0.1',
        vectors: [
          {
            id: 'escape',
            file: '../outside.json',
            mode: 'canonicalization',
            expected: 'canonical_match',
          },
        ],
      }),
      'utf-8',
    );

    const env = runConformance({ manifest: escape });
    assertEnvelopeShape(env);
    expect(env.exit_code).toBe(2);
    expect(env.summary.diagnostic).toBe('manifest_invalid');
    expect(env.results).toEqual([]);
    expect(env.summary.message).toMatch(/escapes manifest directory/i);
  });

  it('missing referenced vector file returns manifest_drift as a vector result', () => {
    const drift = join(tmpRoot, 'drift.json');
    writeFileSync(
      drift,
      JSON.stringify({
        version: 'conformance/v0.1',
        vectors: [
          {
            id: 'missing-vector',
            file: 'missing-vector.json',
            mode: 'canonicalization',
            expected: 'canonical_match',
          },
        ],
      }),
      'utf-8',
    );

    const env = runConformance({ manifest: drift });
    assertEnvelopeShape(env);
    expect(env.exit_code).toBe(1);
    expect(env.summary.diagnostic).toBeNull();
    expect(env.results).toHaveLength(1);
    expect(env.results[0]?.reason_code).toBe('manifest_drift');
  });

  it('successful synthetic filtering with fixed expectations', () => {
    const inlineManifest = join(tmpRoot, 'inline.json');
    writeFileSync(
      inlineManifest,
      JSON.stringify({
        version: 'conformance/v0.1',
        vectors: [
          { id: 'v1', file: 'f1.json', mode: 'core', expected: 'allow' },
          { id: 'v2', file: 'f2.json', mode: 'trust_sanitization', expected: 'allow' },
          { id: 'v3', file: 'f3.json', mode: 'core', expected: 'allow' },
          { id: 'v4', file: 'f4.json', mode: 'canonicalization', expected: 'canonical_match' },
        ],
      }),
      'utf-8',
    );

    const dummyCore = {
      proposal: {
        protocol: 'PIC/1.0',
        intent: 'read',
        impact: 'read',
        provenance: [],
        claims: [],
        action: { tool: 'x', args: {} },
      },
    };
    writeFileSync(join(tmpRoot, 'f1.json'), JSON.stringify(dummyCore), 'utf-8');
    writeFileSync(join(tmpRoot, 'f2.json'), JSON.stringify(dummyCore), 'utf-8');
    writeFileSync(join(tmpRoot, 'f3.json'), JSON.stringify(dummyCore), 'utf-8');

    const env = runConformance({
      manifest: inlineManifest,
      filterModes: ['core'],
      filterIds: ['v2', 'v3'],
    });

    assertEnvelopeShape(env);
    expect(env.exit_code).toBe(0);

    expect(env.results.map((r) => r.id)).toEqual(['v1', 'v2', 'v3']);
    expect(env.summary.total).toBe(3);
    expect(env.summary.passed).toBe(3);
    expect(env.summary.all_passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite 6: exception-free contract.
// ---------------------------------------------------------------------------

describe('runConformance: never throws', () => {
  it('returns an envelope for a nonexistent manifest path', () => {
    const env = runConformance({ manifest: '/definitely/not/a/real/path/manifest.json' });
    assertEnvelopeShape(env);
    expect(env.exit_code).toBe(2);
  });

  it('returns an envelope for empty filter arrays', () => {
    const env = runConformance({
      manifest: '/definitely/not/a/real/path/manifest.json',
      filterModes: [],
      filterIds: [],
    });
    assertEnvelopeShape(env);
    expect(env.exit_code).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Suite 7: renderer contracts and filter normalization.
// ---------------------------------------------------------------------------

describe.skipIf(!submoduleAvailable)('runConformance: renderer contracts', () => {
  it('renderJson emits parseable JSON with no extra text; round-trips through JSON.parse', () => {
    const env = runConformance({
      manifest: REAL_MANIFEST,
      filterModes: ['canonicalization', 'core', 'trust_sanitization'],
    });
    const rendered = renderJson(env);
    expect(JSON.parse(rendered)).toEqual(env);
  });

  it('deduplicates repeated filter values while preserving order', () => {
    const env = runConformance({
      manifest: REAL_MANIFEST,
      filterModes: ['core', 'core', 'canonicalization', 'core'],
      filterIds: ['core-allow-001-read-only', 'core-allow-001-read-only'],
    });
    expect(env.selection.filter_modes).toEqual(['core', 'canonicalization']);
    expect(env.selection.filter_ids).toEqual(['core-allow-001-read-only']);
  });
});
