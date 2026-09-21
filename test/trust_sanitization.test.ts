import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

import { verifyProposal, type VerifyOptions } from '../src/pipeline.js';
import { PICErrorCode } from '../src/errors.js';
import type { ActionProposal, ImpactClass } from '../src/types.js';
import { CONFORMANCE_ROOT } from '../src/fixtures.js';

const manifestPath = resolve(CONFORMANCE_ROOT, 'manifest.json');
const submoduleAvailable = existsSync(manifestPath);

interface TrustSanitizationManifestEntry {
  id: string;
  file: string;
  mode: 'trust_sanitization';
  expected: 'allow' | 'block';
  matrix_id?: string;
  expected_error_code?: string;
}

interface TrustSanitizationVector {
  id: string;
  description: string;
  source: string;
  expected: 'allow' | 'block';
  expected_error_code?: string;
  matrix_id?: string;
  proposal: unknown;
  options?: {
    expected_tool?: unknown;
    strict_trust?: unknown;
    verify_evidence?: unknown;
    evidence_root_dir?: unknown;
  };
}

interface Manifest {
  version?: string;
  vectors?: unknown[];
}

function isTrustSanitizationManifestEntry(v: unknown): v is TrustSanitizationManifestEntry {
  if (typeof v !== 'object' || v === null) {
    return false;
  }
  const e = v as Record<string, unknown>;
  return (
    typeof e['id'] === 'string' &&
    typeof e['file'] === 'string' &&
    e['mode'] === 'trust_sanitization' &&
    (e['expected'] === 'allow' || e['expected'] === 'block')
  );
}

function loadTrustSanitizationManifest(): TrustSanitizationManifestEntry[] {
  const raw = readFileSync(manifestPath, 'utf-8');
  const parsed = JSON.parse(raw) as Manifest;
  const vectors = parsed.vectors ?? [];
  const out: TrustSanitizationManifestEntry[] = [];
  for (const v of vectors) {
    if (isTrustSanitizationManifestEntry(v)) {
      out.push(v);
    }
  }
  return out;
}

function loadVector(entry: TrustSanitizationManifestEntry): TrustSanitizationVector {
  const path = resolve(CONFORMANCE_ROOT, entry.file);
  return JSON.parse(readFileSync(path, 'utf-8')) as TrustSanitizationVector;
}

/**
 * Translate vector snake_case options to the TS API's camelCase.
 *
 * `verify_evidence` is intentionally ignored: evidence verification is
 * out of the v0.9.0 TypeScript scope, and the trust-sanitization matrix
 * vectors do not require it to affect the verdict (every row's verdict
 * is identical across the two `verify_evidence` columns).
 *
 * `evidence_root_dir` is likewise ignored (only relevant to Repo A's
 * evidence resolver, which B6 does not implement).
 */
function translateOptions(raw: TrustSanitizationVector['options']): VerifyOptions {
  if (!raw) {
    return {};
  }
  const out: { expectedTool?: string; strictTrust?: boolean } = {};
  if (typeof raw.expected_tool === 'string') {
    out.expectedTool = raw.expected_tool;
  }
  if (typeof raw.strict_trust === 'boolean') {
    out.strictTrust = raw.strict_trust;
  }
  return out;
}

/** High-impact proposal with a trusted provenance. Used to pin the strictTrust default. */
function highImpactTrusted(impact: ImpactClass = 'money'): ActionProposal {
  return {
    protocol: 'PIC/1.0',
    intent: `perform ${impact}`,
    impact,
    provenance: [{ id: 'approved', trust: 'trusted' }],
    claims: [{ text: `${impact} action`, evidence: ['approved'] }],
    action: { tool: 'do_thing', args: {} },
  };
}

// ---------------------------------------------------------------------------
// Suite 1: manifest-driven trust-sanitization vectors.
// ---------------------------------------------------------------------------

describe.skipIf(!submoduleAvailable)('verifyProposal: vendored trust-sanitization vectors', () => {
  const manifest = submoduleAvailable ? loadTrustSanitizationManifest() : [];

  it('manifest lists at least one trust_sanitization vector', () => {
    expect(manifest.length).toBeGreaterThan(0);
  });

  for (const entry of manifest) {
    it(`${entry.id}: ${entry.expected}`, () => {
      const vector = loadVector(entry);
      const options = translateOptions(vector.options);
      const result = verifyProposal(vector.proposal, options);

      if (vector.expected === 'allow') {
        expect(result.allowed).toBe(true);
        if (result.allowed) {
          expect(result.error).toBeNull();
        }
      } else {
        expect(result.allowed).toBe(false);
        expect(vector.expected_error_code).toBeDefined();
        if (!result.allowed) {
          expect(result.error.code).toBe(vector.expected_error_code);
        }
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Suite 2: pin the intentional ignore of verify_evidence.
//
// The trust-sanitization matrix carries `options.verify_evidence` on
// every vector. This test asserts we actually observed that field on at
// least one vector (so future readers know the ignore was deliberate,
// not a parser bug), and documents that we chose not to expose the
// corresponding flag in the public VerifyOptions API for v0.9.0.
// ---------------------------------------------------------------------------

describe.skipIf(!submoduleAvailable)('trust_sanitization: verify_evidence handling', () => {
  it('verify_evidence appears in vectors and is intentionally ignored by the harness', () => {
    const manifest = loadTrustSanitizationManifest();
    const ignoredVerifyEvidenceValues = manifest
      .map(loadVector)
      .map((v) => v.options?.verify_evidence)
      .filter((v) => typeof v === 'boolean');

    // Vectors DO carry a boolean verify_evidence.
    expect(ignoredVerifyEvidenceValues.length).toBeGreaterThan(0);

    // Harness translation intentionally drops it. This assertion pins
    // that decision: any future translator regression that starts
    // forwarding verify_evidence would need to add the option to
    // VerifyOptions in the same PR.
    const translated = translateOptions({ verify_evidence: true, strict_trust: false });
    expect(translated).toEqual({ strictTrust: false });
    expect('verifyEvidence' in translated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: pin the strictTrust default directly.
//
// The vector suite proves this indirectly. Adding a direct local test so
// B6's mode claim is anchored to a specific behavior contract that
// won't drift silently under future refactors.
// ---------------------------------------------------------------------------

describe('verifyProposal: strictTrust default', () => {
  it('treats omitted strictTrust as strict_trust=true', () => {
    const omitted = verifyProposal(highImpactTrusted());
    const explicit = verifyProposal(highImpactTrusted(), { strictTrust: true });

    expect(omitted.allowed).toBe(explicit.allowed);
    if (!omitted.allowed && !explicit.allowed) {
      expect(omitted.error.code).toBe(explicit.error.code);
      // Both paths should surface VERIFIER_FAILED because sanitization
      // downgrades self-asserted trusted provenance under the default.
      expect(omitted.error.code).toBe(PICErrorCode.VERIFIER_FAILED);
    }
  });
});
