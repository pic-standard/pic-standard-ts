/**
 * TypeScript type definitions for PIC/1.0 Action Proposals.
 *
 * These types mirror `vendor/pic-standard/sdk-python/pic_standard/schemas/
 * proposal_schema.json` at the current submodule pin (v0.9.0-alpha.2).
 * They are a developer convenience; the Ajv-compiled validator in
 * `src/schema.ts` is the runtime source of truth.
 *
 * When the schema pin updates, review and hand-align these types with
 * the pinned schema.
 */

/** Impact classes recognized by PIC/1.0. */
export type ImpactClass =
  'read' | 'write' | 'external' | 'irreversible' | 'money' | 'compute' | 'privacy';

/** Trust levels recognized by PIC/1.0. `semi_trusted` was removed at v0.9.0a1. */
export type TrustLevel = 'trusted' | 'untrusted';

/** Provenance entry: a source that contributed to the proposal. */
export interface Provenance {
  readonly id: string;
  readonly trust: TrustLevel;
  readonly source?: string;
}

/** Claim: a text statement backed by references to evidence IDs. */
export interface Claim {
  readonly text: string;
  readonly evidence: readonly string[];
}

/** Action: the tool call being proposed. */
export interface Action {
  readonly tool: string;
  readonly args: Readonly<Record<string, unknown>>;
}

/** Hash evidence. */
export interface HashEvidence {
  readonly id: string;
  readonly type: 'hash';
  readonly ref: string;
  readonly sha256: string;
  readonly attestor?: string;
}

/** Signature evidence using Ed25519. */
export interface SigEvidence {
  readonly id: string;
  readonly type: 'sig';
  readonly ref: string;
  readonly payload: string;
  readonly signer?: string;
  readonly alg: 'ed25519';
  readonly signature: string;
  readonly key_id: string;
  readonly attestor?: string;
}

/** Evidence: hash or sig. Discriminated by `type`. */
export type Evidence = HashEvidence | SigEvidence;

/** PIC/1.0 Action Proposal. */
export interface ActionProposal {
  readonly protocol: 'PIC/1.0';
  readonly intent: string;
  readonly impact: ImpactClass;
  readonly provenance: readonly Provenance[];
  readonly claims: readonly Claim[];
  readonly action: Action;
  readonly evidence?: readonly Evidence[];
}
