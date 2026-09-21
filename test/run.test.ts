import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { runConformance, renderJson, type Envelope } from '../src/run.js';
import { CONFORMANCE_ROOT } from '../src/fixtures.js';

const REAL_MANIFEST = resolve(CONFORMANCE_ROOT, 'manifest.json');
const submoduleAvailable = existsSync(REAL_MANIFEST);

/**
 * Read the real manifest and return the ordered list of vector IDs whose
 * mode is in `modes`. Used to pin runner output ordering against the
 * manifest's declared order.
 */
function manifestIdsForModes(modes: readonly string[]): string[] {
  const raw = readFileSync(REAL_MANIFEST, 'utf-8');
  const parsed = JSON.parse(raw) as { vectors?: Array<{ id?: unknown; mode?: unknown }> };
  return (parsed.vectors ?? [])
    .filter((v) => typeof v.id === 'string' && modes.includes(String(v.mode)))
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
  it('canonicalization-only filter passes 11 vectors, exit 0', () => {
    const env = runConformance({ manifest: REAL_MANIFEST, filterModes: ['canonicalization'] });
    assertEnvelopeShape(env);
    expect(env.summary.total).toBe(11);
    expect(env.summary.passed).toBe(11);
    expect(env.summary.failed).toBe(0);
    expect(env.exit_code).toBe(0);
  });

  it('core-only filter passes 7 vectors, exit 0', () => {
    const env = runConformance({ manifest: REAL_MANIFEST, filterModes: ['core'] });
    assertEnvelopeShape(env);
    expect(env.summary.total).toBe(7);
    expect(env.summary.passed).toBe(7);
    expect(env.exit_code).toBe(0);
  });

  it('trust_sanitization-only filter passes 24 vectors, exit 0', () => {
    const env = runConformance({ manifest: REAL_MANIFEST, filterModes: ['trust_sanitization'] });
    assertEnvelopeShape(env);
    expect(env.summary.total).toBe(24);
    expect(env.summary.passed).toBe(24);
    expect(env.exit_code).toBe(0);
  });

  it('golden three-claimed-modes filter passes 42 vectors, exit 0', () => {
    const env = runConformance({
      manifest: REAL_MANIFEST,
      filterModes: ['canonicalization', 'core', 'trust_sanitization'],
    });
    assertEnvelopeShape(env);
    expect(env.summary.total).toBe(42);
    expect(env.summary.passed).toBe(42);
    expect(env.exit_code).toBe(0);
  });

  it('unfiltered run includes evidence-mode failures, exit 1', () => {
    const env = runConformance({ manifest: REAL_MANIFEST });
    assertEnvelopeShape(env);
    expect(env.summary.total).toBeGreaterThan(42);
    expect(env.summary.failed).toBeGreaterThan(0);
    const evidenceResults = env.results.filter((r) => r.mode === 'evidence');
    expect(evidenceResults.length).toBeGreaterThan(0);
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
  it('filter-mode and filter-id union together', () => {
    const env = runConformance({
      manifest: REAL_MANIFEST,
      filterModes: ['canonicalization'],
      filterIds: ['core-allow-001-read-only'],
    });
    assertEnvelopeShape(env);
    expect(env.summary.total).toBe(12); // 11 canon + 1 core
    const ids = env.results.map((r) => r.id);
    expect(ids).toContain('core-allow-001-read-only');
    expect(ids.filter((id) => id.startsWith('canon-')).length).toBe(11);
  });

  it('results order matches manifest order after filtering', () => {
    const modes = ['canonicalization', 'core', 'trust_sanitization'];
    const env = runConformance({
      manifest: REAL_MANIFEST,
      filterModes: modes,
    });

    expect(env.results.map((r) => r.id)).toEqual(manifestIdsForModes(modes));
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
