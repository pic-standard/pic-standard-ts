/**
 * PIC Standard TypeScript implementation track.
 *
 * This package is pre-parity. Until the conformance runner passes
 * canonicalization, core, and trust-sanitization modes against the
 * pinned pic-standard corpus, the package MUST NOT be treated as a
 * conformant PIC implementation.
 *
 * No verifier surface is exported yet. Consumers MUST NOT treat this
 * package as a conformant PIC implementation until supportedModes claims
 * the relevant conformance mode and the corresponding tests pass.
 */

// ---------------------------------------------------------------------------
// Version metadata.
//
// Machine-readable metadata for conformance and differential tooling.
//
// `supportedModes` is empty until B2 lands canonicalization parity.
// Consumers MUST NOT invoke verifier paths based on parity that this
// field does not claim.
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
  /** Modes this implementation claims parity for. Empty until B2+. */
  readonly supportedModes: readonly SupportedMode[];
}

const VERSION_INFO: VersionInfo = {
  implName: 'pic-standard-ts',
  implVersion: '0.0.0-alpha.0',
  picProtocolVersion: 'PIC/1.0',
  conformanceManifestRef: 'v0.9.0-alpha.2',
  supportedModes: [],
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
