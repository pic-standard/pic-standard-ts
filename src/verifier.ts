/**
 * Pure verification primitives for PIC/1.0 Action Proposals.
 *
 * These functions receive schema-validated ActionProposal values and
 * return small, deterministic decisions. They perform NO I/O, NO schema
 * validation, and NO evidence verification. The pipeline in
 * `src/pipeline.ts` orchestrates them and translates results into a
 * public VerifyResult.
 */

import type { ActionProposal, ImpactClass } from './types.js';

/**
 * Impact classes that require trusted evidence per the core causal
 * contract in the reference verifier. Mirrors `HIGH_IMPACT` in
 * `vendor/pic-standard/sdk-python/pic_standard/verifier.py`.
 *
 * Kept module-private. Consumers use `isHighImpact()` instead so no
 * runtime `Set` reference escapes the module (readonly typing does not
 * guard against JS-side mutation).
 */
const HIGH_IMPACT: ReadonlySet<ImpactClass> = new Set<ImpactClass>([
  'money',
  'irreversible',
  'privacy',
]);

/** True when this impact class triggers the causal contract check. */
export function isHighImpact(impact: ImpactClass): boolean {
  return HIGH_IMPACT.has(impact);
}

/**
 * Scan provenance IDs for duplicates. Returns the first duplicate seen,
 * or null if all IDs are unique.
 *
 * This check must run BEFORE any semantic verification per the error
 * precedence pinned in Repo A v0.9.0a2
 * (SCHEMA_INVALID > DUPLICATE_ID > TOOL_BINDING_MISMATCH > ...).
 */
export function findDuplicateProvenanceId(proposal: ActionProposal): string | null {
  const seen = new Set<string>();
  for (const p of proposal.provenance) {
    if (seen.has(p.id)) {
      return p.id;
    }
    seen.add(p.id);
  }
  return null;
}

/**
 * Return a defensive copy of the proposal with every provenance.trust
 * downgraded to 'untrusted'. Under strict-trust mode (the v0.9.0a2
 * default), this is applied before the causal contract check, so
 * self-asserted 'trusted' provenance no longer satisfies high-impact
 * requirements on its own.
 */
export function sanitizeTrust(proposal: ActionProposal): ActionProposal {
  return {
    ...proposal,
    provenance: proposal.provenance.map((p) => ({ ...p, trust: 'untrusted' as const })),
  };
}

/**
 * Exact-string tool binding check. Rejects any whitespace difference; the
 * reference verifier at v0.9.0a2 does NOT apply `.strip()` (per MAINT-F1
 * finding). Returns null on match, or the `{proposed, expected}` tuple
 * on mismatch.
 */
export function checkToolBinding(
  proposal: ActionProposal,
  expectedTool: string,
): { readonly proposed: string; readonly expected: string } | null {
  const proposed = proposal.action.tool;
  if (proposed === expectedTool) {
    return null;
  }
  return { proposed, expected: expectedTool };
}

/**
 * Core causal contract: for high-impact proposals (money, irreversible,
 * privacy), at least one claim must reference a trusted provenance id
 * via its `evidence[]` array. In the reference verifier, `claim.evidence`
 * items are strings matched against `provenance[].id` (a schema-level
 * naming collision with the top-level `evidence` object array, which is
 * unrelated in B5).
 *
 * Returns null on satisfaction, or a rejection object naming the impact
 * class that failed.
 */
export function checkCausalContract(
  proposal: ActionProposal,
): { readonly impact: ImpactClass } | null {
  if (!isHighImpact(proposal.impact)) {
    return null;
  }
  const trustedIds = new Set<string>();
  for (const p of proposal.provenance) {
    if (p.trust === 'trusted') {
      trustedIds.add(p.id);
    }
  }
  for (const claim of proposal.claims) {
    for (const evId of claim.evidence) {
      if (trustedIds.has(evId)) {
        return null;
      }
    }
  }
  return { impact: proposal.impact };
}
