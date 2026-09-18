import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

import { validateProposal, type ValidationResult } from '../src/schema.js';
import type { ActionProposal, HashEvidence, SigEvidence } from '../src/types.js';

const SCHEMA_PATH = resolve(
  process.cwd(),
  'vendor',
  'pic-standard',
  'sdk-python',
  'pic_standard',
  'schemas',
  'proposal_schema.json',
);
const submoduleAvailable = existsSync(SCHEMA_PATH);

/** Minimal valid proposal used as a fixture base. */
function baseProposal(): ActionProposal {
  return {
    protocol: 'PIC/1.0',
    intent: 'read a file',
    impact: 'read',
    provenance: [],
    claims: [],
    action: { tool: 'read_file', args: {} },
  };
}

/**
 * Inclusion helper. Asserts result rejected AND at least one error matches
 * the expected {path, keyword}. Does not depend on Ajv error count or
 * ordering.
 */
function expectValidationError(
  result: ValidationResult,
  expected: { path: string; keyword: string },
): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining(expected)]));
  }
}

describe.skipIf(!submoduleAvailable)('validateProposal: positive cases', () => {
  it('accepts the minimal valid proposal', () => {
    const result = validateProposal(baseProposal());
    expect(result.ok).toBe(true);
  });

  it('accepts a provenance entry with an optional source', () => {
    const proposal: unknown = {
      ...baseProposal(),
      provenance: [{ id: 'user-1', trust: 'trusted', source: 'test' }],
    };
    expect(validateProposal(proposal).ok).toBe(true);
  });

  it('accepts a proposal with hash evidence', () => {
    const hashEv: HashEvidence = {
      id: 'ev-1',
      type: 'hash',
      ref: 'file://data.txt',
      sha256: 'a'.repeat(64),
    };
    const proposal = { ...baseProposal(), evidence: [hashEv] };
    expect(validateProposal(proposal).ok).toBe(true);
  });

  it('accepts a proposal with sig evidence', () => {
    const sigEv: SigEvidence = {
      id: 'ev-1',
      type: 'sig',
      ref: 'inline:payload',
      payload: 'some payload',
      alg: 'ed25519',
      signature: 'base64sig',
      key_id: 'key-1',
    };
    const proposal = { ...baseProposal(), evidence: [sigEv] };
    expect(validateProposal(proposal).ok).toBe(true);
  });

  it('accepts a proposal with claims', () => {
    const proposal = {
      ...baseProposal(),
      claims: [{ text: 'the file exists', evidence: ['ev-1'] }],
    };
    expect(validateProposal(proposal).ok).toBe(true);
  });
});

describe.skipIf(!submoduleAvailable)('validateProposal: top-level rejection', () => {
  it('rejects a proposal missing `protocol`', () => {
    const proposal: unknown = {
      intent: 'read a file',
      impact: 'read',
      provenance: [],
      claims: [],
      action: { tool: 'read_file', args: {} },
    };
    expectValidationError(validateProposal(proposal), {
      path: '/',
      keyword: 'required',
    });
  });

  it('normalizes root path to "/" for top-level required errors', () => {
    const proposal: unknown = {
      intent: 'read a file',
      impact: 'read',
      provenance: [],
      claims: [],
      action: { tool: 'read_file', args: {} },
    };
    expectValidationError(validateProposal(proposal), {
      path: '/',
      keyword: 'required',
    });
  });

  it('rejects a wrong `protocol` value', () => {
    const proposal: unknown = { ...baseProposal(), protocol: 'PIC/2.0' };
    expectValidationError(validateProposal(proposal), {
      path: '/protocol',
      keyword: 'const',
    });
  });

  it('rejects an invalid `impact` enum value', () => {
    const proposal: unknown = { ...baseProposal(), impact: 'illegal' };
    expectValidationError(validateProposal(proposal), {
      path: '/impact',
      keyword: 'enum',
    });
  });

  it('rejects an additional top-level property', () => {
    const proposal: unknown = { ...baseProposal(), extra: 'unexpected' };
    expectValidationError(validateProposal(proposal), {
      path: '/',
      keyword: 'additionalProperties',
    });
  });

  it('rejects a proposal missing `intent`', () => {
    const proposal: unknown = {
      protocol: 'PIC/1.0',
      impact: 'read',
      provenance: [],
      claims: [],
      action: { tool: 'read_file', args: {} },
    };
    expectValidationError(validateProposal(proposal), {
      path: '/',
      keyword: 'required',
    });
  });
});

describe.skipIf(!submoduleAvailable)('validateProposal: provenance rejection', () => {
  it('rejects a provenance item missing `trust`', () => {
    const proposal: unknown = {
      ...baseProposal(),
      provenance: [{ id: 'user-1' }],
    };
    expectValidationError(validateProposal(proposal), {
      path: '/provenance/0',
      keyword: 'required',
    });
  });

  it('rejects the legacy `semi_trusted` trust value', () => {
    const proposal: unknown = {
      ...baseProposal(),
      provenance: [{ id: 'user-1', trust: 'semi_trusted' }],
    };
    expectValidationError(validateProposal(proposal), {
      path: '/provenance/0/trust',
      keyword: 'enum',
    });
  });

  it('rejects an additional property on a provenance item', () => {
    const proposal: unknown = {
      ...baseProposal(),
      provenance: [{ id: 'user-1', trust: 'trusted', extra: 'unexpected' }],
    };
    expectValidationError(validateProposal(proposal), {
      path: '/provenance/0',
      keyword: 'additionalProperties',
    });
  });
});

describe.skipIf(!submoduleAvailable)('validateProposal: action rejection', () => {
  it('rejects action args that are not an object', () => {
    const proposal: unknown = {
      ...baseProposal(),
      action: { tool: 'read_file', args: 'not-object' },
    };
    expectValidationError(validateProposal(proposal), {
      path: '/action/args',
      keyword: 'type',
    });
  });

  it('rejects an additional property on action', () => {
    const proposal: unknown = {
      ...baseProposal(),
      action: { tool: 'read_file', args: {}, extra: 'unexpected' },
    };
    expectValidationError(validateProposal(proposal), {
      path: '/action',
      keyword: 'additionalProperties',
    });
  });
});

describe.skipIf(!submoduleAvailable)('validateProposal: evidence rejection', () => {
  it('rejects hash evidence with uppercase SHA-256 hex (v0.9.0a2 tightening)', () => {
    const proposal: unknown = {
      ...baseProposal(),
      evidence: [
        {
          id: 'ev-1',
          type: 'hash',
          ref: 'file://x',
          sha256: 'A'.repeat(64),
        },
      ],
    };
    expectValidationError(validateProposal(proposal), {
      path: '/evidence/0/sha256',
      keyword: 'pattern',
    });
  });

  it('rejects hash evidence missing `sha256`', () => {
    const proposal: unknown = {
      ...baseProposal(),
      evidence: [{ id: 'ev-1', type: 'hash', ref: 'file://x' }],
    };
    expect(validateProposal(proposal).ok).toBe(false);
  });

  it('rejects sig evidence with wrong `alg`', () => {
    const proposal: unknown = {
      ...baseProposal(),
      evidence: [
        {
          id: 'ev-1',
          type: 'sig',
          ref: 'inline:x',
          payload: 'p',
          alg: 'rsa',
          signature: 'sig',
          key_id: 'k',
        },
      ],
    };
    expect(validateProposal(proposal).ok).toBe(false);
  });
});
