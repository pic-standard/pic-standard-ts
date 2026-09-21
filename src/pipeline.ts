/**
 * PIC/1.0 Action Proposal verification pipeline.
 *
 * Orchestrates: schema validation, duplicate provenance-id check,
 * strict-trust sanitization (defensive copy), tool binding, and the
 * core causal contract. Returns a public `VerifyResult` discriminated
 * union.
 *
 * Error precedence (v0.9.0a2, matching Repo A):
 *   SCHEMA_INVALID > DUPLICATE_ID > TOOL_BINDING_MISMATCH >
 *   EVIDENCE_REQUIRED / EVIDENCE_FAILED > VERIFIER_FAILED
 *
 * Evidence verification is NOT implemented in B5. B5 never emits
 * PIC_EVIDENCE_REQUIRED or PIC_EVIDENCE_FAILED, and does not derive
 * trusted provenance from evidence. Evidence shape is validated at the
 * schema level, but its content has no trust-elevation effect here.
 */

import { performance } from 'node:perf_hooks';

import { PICErrorCode } from './errors.js';
import type { PICErrorCode as PICErrorCodeValue } from './errors.js';
import { validateProposal } from './schema.js';
import {
  checkCausalContract,
  checkToolBinding,
  findDuplicateProvenanceId,
  sanitizeTrust,
} from './verifier.js';

/**
 * Options for `verifyProposal`.
 *
 * Field naming mirrors Repo A's public option keys:
 *   expectedTool  <-> vendored vector's `expected_tool`
 *   strictTrust   <-> vendored vector's `strict_trust`
 */
export interface VerifyOptions {
  /**
   * Enforce tool binding: `proposal.action.tool` must equal this string
   * exactly (no whitespace normalization). When omitted or empty, tool
   * binding is skipped, matching the reference verifier's falsy-skip.
   */
  readonly expectedTool?: string;
  /**
   * Sanitize `provenance[].trust` to `'untrusted'` before verification.
   * Default `true` (the v0.9.0a2 secure default). Pass `false` for the
   * legacy behavior where self-asserted `'trusted'` provenance can
   * satisfy the causal contract.
   */
  readonly strictTrust?: boolean;
}

export interface VerifyError {
  readonly code: PICErrorCodeValue;
  readonly message: string;
}

/**
 * Discriminated union. When `allowed` is `true`, `error` is `null`; when
 * `false`, `error` is populated. TypeScript flow narrowing follows the
 * discriminant automatically.
 */
export type VerifyResult =
  | { readonly allowed: true; readonly error: null; readonly eval_ms: number }
  | { readonly allowed: false; readonly error: VerifyError; readonly eval_ms: number };

function elapsedMs(start: number): number {
  return Math.max(0, performance.now() - start);
}

function allow(start: number): VerifyResult {
  return { allowed: true, error: null, eval_ms: elapsedMs(start) };
}

function block(start: number, code: PICErrorCodeValue, message: string): VerifyResult {
  return {
    allowed: false,
    error: { code, message },
    eval_ms: elapsedMs(start),
  };
}

/**
 * Verify a PIC/1.0 Action Proposal.
 *
 * The pipeline runs in the fixed order below; the first failure wins:
 *
 *   1. Schema validation (delegates to Ajv-compiled validator).
 *   2. Duplicate provenance ID check.
 *   3. Strict-trust sanitization (defensive copy; `strictTrust` default true).
 *   4. Tool binding (only if `options.expectedTool` provided and non-empty).
 *   5. Core causal contract (high-impact requires a claim reference to trusted provenance).
 *
 * @param proposal - any value; validated against the PIC/1.0 schema.
 * @param options  - optional runtime options.
 * @returns a `VerifyResult`. Schema-invalid input returns a result with
 *   `PIC_SCHEMA_INVALID`; it never throws for bad user input. The
 *   underlying schema loader may still throw if the vendored schema
 *   file is missing or malformed (a deployment problem, not a user
 *   input problem).
 */
export function verifyProposal(proposal: unknown, options: VerifyOptions = {}): VerifyResult {
  const start = performance.now();

  // Step 1: Schema validation.
  const validation = validateProposal(proposal);
  if (!validation.ok) {
    const first = validation.errors[0];
    const detail = first ? `${first.path}: ${first.message}` : 'schema validation failed';
    return block(start, PICErrorCode.SCHEMA_INVALID, detail);
  }
  const validated = validation.proposal;

  // Step 2: Duplicate provenance ID check.
  const dup = findDuplicateProvenanceId(validated);
  if (dup !== null) {
    return block(start, PICErrorCode.DUPLICATE_ID, `Duplicate provenance id: ${dup}`);
  }

  // Step 3: Strict-trust sanitization (defensive copy).
  const strictTrust = options.strictTrust ?? true;
  const effective = strictTrust ? sanitizeTrust(validated) : validated;

  // Step 4: Tool binding (falsy-skip: undefined or empty string skips).
  const expectedTool = options.expectedTool;
  if (expectedTool !== undefined && expectedTool !== '') {
    const mismatch = checkToolBinding(effective, expectedTool);
    if (mismatch !== null) {
      return block(
        start,
        PICErrorCode.TOOL_BINDING_MISMATCH,
        `Tool binding mismatch (proposal.action.tool=${JSON.stringify(mismatch.proposed)} but expected=${JSON.stringify(mismatch.expected)})`,
      );
    }
  }

  // Step 5: Core causal contract.
  const causal = checkCausalContract(effective);
  if (causal !== null) {
    return block(
      start,
      PICErrorCode.VERIFIER_FAILED,
      `Contract Violation: Action of type '${causal.impact}' cannot proceed without evidence from a TRUSTED source.`,
    );
  }

  return allow(start);
}
