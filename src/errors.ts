/**
 * PIC protocol error codes.
 *
 * Mirrors `class PICErrorCode` in
 * `vendor/pic-standard/sdk-python/pic_standard/errors.py` at the current
 * submodule pin (v0.9.0-alpha.2). The Python enum is the source of truth;
 * `docs/ERRORS.md` in the same submodule is the human-facing
 * documentation. `integrations/openclaw/lib/types.ts` is a downstream
 * reference, not the source.
 *
 * `test/errors.test.ts` enforces parity by parsing the Python enum body
 * and comparing names, values, and counts. When the submodule pin
 * updates, hand-align this file to the vendored source and let the
 * parity test catch any drift.
 */

export const PICErrorCode = Object.freeze({
  INVALID_REQUEST: 'PIC_INVALID_REQUEST',
  LIMIT_EXCEEDED: 'PIC_LIMIT_EXCEEDED',
  SCHEMA_INVALID: 'PIC_SCHEMA_INVALID',
  DUPLICATE_ID: 'PIC_DUPLICATE_ID',
  VERIFIER_FAILED: 'PIC_VERIFIER_FAILED',
  TOOL_BINDING_MISMATCH: 'PIC_TOOL_BINDING_MISMATCH',
  EVIDENCE_REQUIRED: 'PIC_EVIDENCE_REQUIRED',
  EVIDENCE_FAILED: 'PIC_EVIDENCE_FAILED',
  POLICY_VIOLATION: 'PIC_POLICY_VIOLATION',
  INTERNAL_ERROR: 'PIC_INTERNAL_ERROR',
} as const);

export type PICErrorCode = (typeof PICErrorCode)[keyof typeof PICErrorCode];
