import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

import { verifyProposal, type VerifyOptions, type VerifyResult } from '../src/pipeline.js';
import { PICErrorCode } from '../src/errors.js';
import type { ActionProposal, ImpactClass } from '../src/types.js';
import { CONFORMANCE_ROOT } from '../src/fixtures.js';

const manifestPath = resolve(CONFORMANCE_ROOT, 'manifest.json');
const submoduleAvailable = existsSync(manifestPath);

interface CoreManifestEntry {
  id: string;
  file: string;
  mode: 'core';
  expected: 'allow' | 'block';
  expected_error_code?: string;
}

interface CoreVector {
  id: string;
  description: string;
  source: string;
  expected: 'allow' | 'block';
  expected_error_code?: string;
  proposal: unknown;
  options?: { expected_tool?: unknown; strict_trust?: unknown };
}

interface Manifest {
  version?: string;
  vectors?: unknown[];
}

function isCoreManifestEntry(v: unknown): v is CoreManifestEntry {
  if (typeof v !== 'object' || v === null) {
    return false;
  }
  const e = v as Record<string, unknown>;
  return (
    typeof e['id'] === 'string' &&
    typeof e['file'] === 'string' &&
    e['mode'] === 'core' &&
    (e['expected'] === 'allow' || e['expected'] === 'block')
  );
}

function loadCoreManifest(): CoreManifestEntry[] {
  const raw = readFileSync(manifestPath, 'utf-8');
  const parsed = JSON.parse(raw) as Manifest;
  const vectors = parsed.vectors ?? [];
  const core: CoreManifestEntry[] = [];
  for (const v of vectors) {
    if (isCoreManifestEntry(v)) {
      core.push(v);
    }
  }
  return core;
}

function loadVector(entry: CoreManifestEntry): CoreVector {
  const path = resolve(CONFORMANCE_ROOT, entry.file);
  return JSON.parse(readFileSync(path, 'utf-8')) as CoreVector;
}

/** Translate vector snake_case options to TS API camelCase. */
function translateOptions(raw: CoreVector['options']): VerifyOptions {
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

/** Minimal valid proposal (read impact, no trust demands). Mutation base for local tests. */
function baseProposal(): ActionProposal {
  return {
    protocol: 'PIC/1.0',
    intent: 'read a file',
    impact: 'read',
    provenance: [{ id: 'user_input', trust: 'untrusted' }],
    claims: [{ text: 'user asked', evidence: ['user_input'] }],
    action: { tool: 'read_file', args: {} },
  };
}

/** High-impact proposal shape with a trusted provenance that satisfies the causal contract. */
function highImpactTrustedProposal(impact: ImpactClass): ActionProposal {
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
// Suite 1: manifest-driven core vectors.
// ---------------------------------------------------------------------------

describe.skipIf(!submoduleAvailable)('verifyProposal: vendored core vectors', () => {
  const manifest = submoduleAvailable ? loadCoreManifest() : [];

  it('manifest lists at least one core vector', () => {
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
        if (!result.allowed && vector.expected_error_code) {
          expect(result.error.code).toBe(vector.expected_error_code);
        }
      }

      expect(typeof result.eval_ms).toBe('number');
      expect(result.eval_ms).toBeGreaterThanOrEqual(0);
    });
  }
});

// ---------------------------------------------------------------------------
// Suite 2: local behavior (options, defaults, single-rule triggers).
// ---------------------------------------------------------------------------

describe('verifyProposal: local behavior', () => {
  it('accepts a minimal read-impact proposal (no options)', () => {
    const result = verifyProposal(baseProposal());
    expect(result.allowed).toBe(true);
  });

  it('strictTrust defaults to true: rejects trusted-money without opt-out', () => {
    const result = verifyProposal(highImpactTrustedProposal('money'));
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.error.code).toBe(PICErrorCode.VERIFIER_FAILED);
    }
  });

  it('strictTrust: false accepts trusted-money', () => {
    const result = verifyProposal(highImpactTrustedProposal('money'), { strictTrust: false });
    expect(result.allowed).toBe(true);
  });

  it('expectedTool exact match: passes tool binding', () => {
    const result = verifyProposal(baseProposal(), { expectedTool: 'read_file' });
    expect(result.allowed).toBe(true);
  });

  it('expectedTool mismatch: rejects with PIC_TOOL_BINDING_MISMATCH', () => {
    const result = verifyProposal(baseProposal(), { expectedTool: 'other' });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.error.code).toBe(PICErrorCode.TOOL_BINDING_MISMATCH);
    }
  });

  it('expectedTool omitted: skips tool binding entirely', () => {
    const result = verifyProposal(baseProposal());
    expect(result.allowed).toBe(true);
  });

  it('whitespace in expectedTool rejects (no .strip)', () => {
    const result = verifyProposal(baseProposal(), { expectedTool: 'read_file ' });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.error.code).toBe(PICErrorCode.TOOL_BINDING_MISMATCH);
    }
  });

  it('duplicate provenance IDs reject with PIC_DUPLICATE_ID', () => {
    const proposal = {
      ...baseProposal(),
      provenance: [
        { id: 'dup', trust: 'untrusted' as const },
        { id: 'dup', trust: 'untrusted' as const },
      ],
      claims: [{ text: 'x', evidence: ['dup'] }],
    };
    const result = verifyProposal(proposal);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.error.code).toBe(PICErrorCode.DUPLICATE_ID);
    }
  });

  it('schema-invalid input returns VerifyResult with PIC_SCHEMA_INVALID (no throw)', () => {
    const bad: unknown = { protocol: 'PIC/1.0' };
    let result: VerifyResult | undefined;
    expect(() => {
      result = verifyProposal(bad);
    }).not.toThrow();
    expect(result?.allowed).toBe(false);
    if (result && !result.allowed) {
      expect(result.error.code).toBe(PICErrorCode.SCHEMA_INVALID);
    }
  });

  it('eval_ms is a non-negative number', () => {
    const result = verifyProposal(baseProposal());
    expect(typeof result.eval_ms).toBe('number');
    expect(Number.isFinite(result.eval_ms)).toBe(true);
    expect(result.eval_ms).toBeGreaterThanOrEqual(0);
  });

  it('does not mutate the caller proposal (strict-trust defensive copy)', () => {
    const original = highImpactTrustedProposal('money');
    const snapshot = JSON.stringify(original);
    verifyProposal(original);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('valid top-level evidence does not elevate provenance trust in B5', () => {
    const proposal: ActionProposal = {
      protocol: 'PIC/1.0',
      intent: 'send money',
      impact: 'money',
      provenance: [{ id: 'user', trust: 'untrusted' }],
      claims: [{ text: 'approved by evidence', evidence: ['ev-1'] }],
      action: { tool: 'pay', args: {} },
      evidence: [
        {
          id: 'ev-1',
          type: 'hash',
          ref: 'file://approval.txt',
          sha256: 'a'.repeat(64),
        },
      ],
    };

    const result = verifyProposal(proposal, { strictTrust: false });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.error.code).toBe(PICErrorCode.VERIFIER_FAILED);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 3: error precedence.
// ---------------------------------------------------------------------------

describe('verifyProposal: error precedence', () => {
  it('SCHEMA_INVALID beats DUPLICATE_ID', () => {
    const bad: unknown = {
      protocol: 'PIC/2.0',
      intent: 'x',
      impact: 'read',
      provenance: [
        { id: 'a', trust: 'untrusted' },
        { id: 'a', trust: 'untrusted' },
      ],
      claims: [],
      action: { tool: 't', args: {} },
    };
    const result = verifyProposal(bad);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.error.code).toBe(PICErrorCode.SCHEMA_INVALID);
    }
  });

  it('DUPLICATE_ID beats TOOL_BINDING_MISMATCH', () => {
    const proposal = {
      ...baseProposal(),
      provenance: [
        { id: 'x', trust: 'untrusted' as const },
        { id: 'x', trust: 'untrusted' as const },
      ],
      claims: [{ text: 'x', evidence: ['x'] }],
    };
    const result = verifyProposal(proposal, { expectedTool: 'wrong' });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.error.code).toBe(PICErrorCode.DUPLICATE_ID);
    }
  });

  it('TOOL_BINDING_MISMATCH beats VERIFIER_FAILED', () => {
    const proposal: ActionProposal = {
      protocol: 'PIC/1.0',
      intent: 'send money',
      impact: 'money',
      provenance: [{ id: 'user', trust: 'untrusted' }],
      claims: [{ text: 'send', evidence: ['user'] }],
      action: { tool: 'pay', args: {} },
    };
    const result = verifyProposal(proposal, { expectedTool: 'other', strictTrust: false });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.error.code).toBe(PICErrorCode.TOOL_BINDING_MISMATCH);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 4: high-impact enum coverage.
//
// Verifies the causal contract fires for each high-impact class and does
// not fire for non-high-impact classes.
// ---------------------------------------------------------------------------

describe('verifyProposal: high-impact enum coverage', () => {
  for (const impact of ['money', 'irreversible', 'privacy'] as const) {
    it(`triggers causal contract for impact=${impact} under strictTrust=true`, () => {
      const result = verifyProposal(highImpactTrustedProposal(impact));
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.error.code).toBe(PICErrorCode.VERIFIER_FAILED);
      }
    });

    it(`accepts impact=${impact} when strictTrust=false with trusted provenance`, () => {
      const result = verifyProposal(highImpactTrustedProposal(impact), { strictTrust: false });
      expect(result.allowed).toBe(true);
    });
  }

  for (const impact of ['read', 'write', 'external', 'compute'] as const) {
    it(`skips causal contract for non-high-impact impact=${impact}`, () => {
      const proposal: ActionProposal = { ...baseProposal(), impact };
      const result = verifyProposal(proposal);
      expect(result.allowed).toBe(true);
    });
  }
});
