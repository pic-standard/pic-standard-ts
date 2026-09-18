/**
 * PIC Standard TypeScript implementation track.
 *
 * This package is pre-verifier. It currently claims canonicalization
 * parity only. Core and trust-sanitization parity are not implemented yet,
 * so this package MUST NOT be treated as a conformant PIC verifier.
 *
 * Verifier decisions (`verifyProposal`) are not yet implemented.
 * Consumers MUST NOT invoke paths for modes not listed in
 * `supportedModes`.
 */

// ---------------------------------------------------------------------------
// Version metadata.
//
// Machine-readable metadata for conformance and differential tooling.
//
// `supportedModes` reflects the modes this implementation currently claims
// parity for against the pinned pic-standard corpus. Consumers MUST NOT
// invoke paths for modes not listed here.
// ---------------------------------------------------------------------------

/**
 * Conformance modes this implementation may claim during the v0.9.0 track.
 *
 * Evidence-mode parity is intentionally excluded from the v0.9.0 TypeScript
 * target. Evidence-related paths must fail closed until implemented.
 */
export type SupportedMode = 'canonicalization' | 'core' | 'trust_sanitization';

/**
 * Version metadata shape exposed by the implementation.
 */
export interface VersionInfo {
  /** Implementation identifier. */
  readonly implName: string;
  /** Implementation version. Must match package.json until a runtime lookup lands. */
  readonly implVersion: string;
  /** PIC protocol version this implementation targets. */
  readonly picProtocolVersion: string;
  /** Git tag of the pinned pic-standard repository consumed as the conformance corpus. */
  readonly conformanceManifestRef: string;
  /** Modes this implementation claims parity for. */
  readonly supportedModes: readonly SupportedMode[];
}

const VERSION_INFO: VersionInfo = {
  implName: 'pic-standard-ts',
  implVersion: '0.0.0-alpha.0',
  picProtocolVersion: 'PIC/1.0',
  conformanceManifestRef: 'v0.9.0-alpha.2',
  supportedModes: ['canonicalization'],
};

/**
 * Return the machine-readable version metadata for this implementation.
 *
 * Consumers use this to check parity claims before invoking implementation
 * paths.
 */
export function getVersion(): VersionInfo {
  return VERSION_INFO;
}

// ---------------------------------------------------------------------------
// Canonicalization surface.
//
// PIC-CJSON/1.0 canonicalizer. Passes all vendored canonicalization
// conformance vectors byte-for-byte against the pinned pic-standard tag.
// ---------------------------------------------------------------------------

export { canonicalize, CanonicalizationError } from './canonical.js';

// ---------------------------------------------------------------------------
// Schema validation surface.
//
// Ajv-compiled validator for PIC/1.0 Action Proposals against the vendored
// schema at the current submodule pin. Supporting types mirror the schema.
// ---------------------------------------------------------------------------

export { validateProposal } from './schema.js';
export type { ValidationError, ValidationResult } from './schema.js';
export type {
  Action,
  ActionProposal,
  Claim,
  Evidence,
  HashEvidence,
  ImpactClass,
  Provenance,
  SigEvidence,
  TrustLevel,
} from './types.js';

// ---------------------------------------------------------------------------
// Error codes.
//
// Static TS mirror of Repo A's PICErrorCode enum. Parity is enforced by
// test/errors.test.ts.
// ---------------------------------------------------------------------------

export { PICErrorCode } from './errors.js';
export type { PICErrorCode as PICErrorCodeValue } from './errors.js';
