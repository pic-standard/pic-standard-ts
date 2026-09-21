/**
 * PIC Standard TypeScript conformance runner.
 *
 * Public entry: `runConformance(options): Envelope`. Never throws.
 * Envelope shape mirrors Repo A's `JsonRenderer.render_report` in
 * `vendor/pic-standard/conformance/run.py`; the semantic subset
 * (`.summary`, `.exit_code`, `.results[]|{id,passed,reason_code}`) is
 * what the eventual differential CI harness diffs.
 *
 * Runner-level scope: canonicalization, core, trust_sanitization.
 * Evidence-mode vectors encountered in an unfiltered run are marked
 * failed with `runner_error`. Explicit `--filter-mode evidence` is a
 * request error and exits 2 without running any vectors.
 */

import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import { Command } from 'commander';

import { canonicalize, CanonicalizationError } from './canonical.js';
import { verifyProposal, type VerifyOptions } from './pipeline.js';

// ---------------------------------------------------------------------------
// 8-token diagnostic taxonomy (module-private const; type alias exported)
// ---------------------------------------------------------------------------

const DiagCode = {
  VERDICT_MISMATCH: 'verdict_mismatch',
  ERROR_CODE_MISMATCH: 'error_code_mismatch',
  CANONICALIZATION_MISMATCH: 'canonicalization_mismatch',
  MANIFEST_DRIFT: 'manifest_drift',
  VECTOR_INVALID: 'vector_invalid',
  RUNNER_ERROR: 'runner_error',
  NO_VECTORS_SELECTED: 'no_vectors_selected',
  MANIFEST_INVALID: 'manifest_invalid',
} as const;

export type DiagnosticCode = (typeof DiagCode)[keyof typeof DiagCode];

const SUPPORTED_MODES: ReadonlySet<string> = new Set([
  'canonicalization',
  'core',
  'trust_sanitization',
]);

const RUNNER_RECOGNIZED_MODES: ReadonlySet<string> = new Set([
  'canonicalization',
  'core',
  'trust_sanitization',
  'evidence',
]);

const MANIFEST_KNOWN_MODES: ReadonlySet<string> = new Set([
  'canonicalization',
  'core',
  'trust_sanitization',
  'evidence',
]);

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RunOptions {
  readonly manifest: string;
  readonly filterModes?: readonly string[];
  readonly filterIds?: readonly string[];
}

export interface EnvelopeResult {
  readonly id: string;
  readonly mode: string;
  readonly passed: boolean;
  readonly reason_code: DiagnosticCode | null;
  readonly message: string | null;
}

export interface EnvelopeSelection {
  readonly total_in_manifest: number;
  readonly selected: number;
  readonly filter_modes: readonly string[];
  readonly filter_ids: readonly string[];
}

export interface EnvelopeSummary {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly all_passed: boolean;
  readonly diagnostic: DiagnosticCode | null;
  readonly message: string | null;
}

export interface Envelope {
  readonly manifest_version: string | null;
  readonly selection: EnvelopeSelection;
  readonly results: readonly EnvelopeResult[];
  readonly summary: EnvelopeSummary;
  readonly exit_code: number;
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function uniquePreserveOrder(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function validateManifestVectorPath(manifestPath: string, relPath: string): string | null {
  const manifestDir = dirname(manifestPath);
  if (isAbsolute(relPath)) {
    return `vector file path must be relative: ${relPath}`;
  }
  const abs = resolve(manifestDir, relPath);
  const rel = relative(manifestDir, abs);
  const escaped = rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel);
  if (escaped) {
    return `vector file path escapes manifest directory: ${relPath}`;
  }
  return null;
}

function makeErrorEnvelope(
  filterModes: readonly string[],
  filterIds: readonly string[],
  diagnostic: DiagnosticCode,
  message: string,
  exitCode: number,
  manifestVersion: string | null = null,
  totalInManifest: number = 0,
): Envelope {
  return {
    manifest_version: manifestVersion,
    selection: {
      total_in_manifest: totalInManifest,
      selected: 0,
      filter_modes: [...filterModes],
      filter_ids: [...filterIds],
    },
    results: [],
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      all_passed: false,
      diagnostic,
      message,
    },
    exit_code: exitCode,
  };
}

// ---------------------------------------------------------------------------
// Manifest loading
// ---------------------------------------------------------------------------

interface ManifestEntry {
  id: string;
  file: string;
  mode: string;
  expected: string;
}

interface LoadedManifest {
  version: string | null;
  entries: ManifestEntry[];
}

type ManifestLoadResult = { ok: true; manifest: LoadedManifest } | { ok: false; message: string };

function loadManifest(manifestPath: string): ManifestLoadResult {
  let raw: string;
  try {
    raw = readFileSync(manifestPath, 'utf-8');
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Could not read manifest ${manifestPath}: ${detail}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Malformed JSON in ${manifestPath}: ${detail}` };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, message: 'manifest root must be a JSON object' };
  }
  const root = parsed as { version?: unknown; vectors?: unknown };
  const version = typeof root.version === 'string' && root.version.length > 0 ? root.version : null;
  const vectors = root.vectors;
  if (!Array.isArray(vectors)) {
    return { ok: false, message: 'manifest.vectors must be an array' };
  }
  const entries: ManifestEntry[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < vectors.length; i++) {
    const v = vectors[i];
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      return { ok: false, message: `manifest.vectors[${i}] is not a JSON object` };
    }
    const e = v as Record<string, unknown>;
    if (
      typeof e['id'] !== 'string' ||
      typeof e['file'] !== 'string' ||
      typeof e['mode'] !== 'string' ||
      typeof e['expected'] !== 'string'
    ) {
      return { ok: false, message: `manifest.vectors[${i}] missing required string fields` };
    }
    const id = e['id'];
    if (seenIds.has(id)) {
      return { ok: false, message: `Duplicate vector id in manifest: ${id}` };
    }
    seenIds.add(id);
    const mode = e['mode'];
    if (!MANIFEST_KNOWN_MODES.has(mode)) {
      return { ok: false, message: `Unknown mode in manifest.vectors[${i}] (id=${id}): ${mode}` };
    }
    const file = e['file'];
    const pathError = validateManifestVectorPath(manifestPath, file);
    if (pathError) {
      return { ok: false, message: pathError };
    }
    entries.push({ id, file, mode, expected: e['expected'] });
  }
  return { ok: true, manifest: { version, entries } };
}

// ---------------------------------------------------------------------------
// Vector loading (discriminated result; distinguishes drift vs invalid)
// ---------------------------------------------------------------------------

interface VectorFile {
  input?: unknown;
  proposal?: unknown;
  expected_canonical_bytes_hex?: string;
  expected_error_code?: string;
  options?: { expected_tool?: unknown; strict_trust?: unknown };
}

type VectorLoadResult =
  { ok: true; vector: VectorFile } | { ok: false; reason_code: DiagnosticCode; message: string };

function loadVectorFile(manifestPath: string, relPath: string): VectorLoadResult {
  // Defense in depth: loadManifest has already validated this path.
  const pathError = validateManifestVectorPath(manifestPath, relPath);
  if (pathError) {
    return { ok: false, reason_code: DiagCode.MANIFEST_INVALID, message: pathError };
  }

  const abs = resolve(dirname(manifestPath), relPath);
  let raw: string;
  try {
    raw = readFileSync(abs, 'utf-8');
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason_code: DiagCode.MANIFEST_DRIFT,
      message: `could not read vector file ${abs}: ${detail}`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason_code: DiagCode.VECTOR_INVALID,
      message: `malformed JSON in vector file ${abs}: ${detail}`,
    };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      ok: false,
      reason_code: DiagCode.VECTOR_INVALID,
      message: `vector file root must be a JSON object: ${abs}`,
    };
  }
  return { ok: true, vector: parsed as VectorFile };
}

// ---------------------------------------------------------------------------
// Per-mode dispatchers
// ---------------------------------------------------------------------------

function runCanonicalizationVector(entry: ManifestEntry, vector: VectorFile): EnvelopeResult {
  if (entry.expected === 'canonical_match') {
    if (typeof vector.expected_canonical_bytes_hex !== 'string') {
      return {
        id: entry.id,
        mode: entry.mode,
        passed: false,
        reason_code: DiagCode.VECTOR_INVALID,
        message: 'canonical_match vector missing expected_canonical_bytes_hex',
      };
    }
    if (!('input' in vector)) {
      return {
        id: entry.id,
        mode: entry.mode,
        passed: false,
        reason_code: DiagCode.VECTOR_INVALID,
        message: 'canonical_match vector missing input',
      };
    }
    try {
      const bytes = canonicalize(vector.input);
      const hex = Buffer.from(bytes).toString('hex');
      if (hex === vector.expected_canonical_bytes_hex) {
        return { id: entry.id, mode: entry.mode, passed: true, reason_code: null, message: null };
      }
      return {
        id: entry.id,
        mode: entry.mode,
        passed: false,
        reason_code: DiagCode.CANONICALIZATION_MISMATCH,
        message: `expected ${vector.expected_canonical_bytes_hex} got ${hex}`,
      };
    } catch (err) {
      if (err instanceof CanonicalizationError) {
        return {
          id: entry.id,
          mode: entry.mode,
          passed: false,
          reason_code: DiagCode.VERDICT_MISMATCH,
          message: `expected canonical_match but canonicalize rejected: ${err.message}`,
        };
      }
      return {
        id: entry.id,
        mode: entry.mode,
        passed: false,
        reason_code: DiagCode.RUNNER_ERROR,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }
  if (entry.expected === 'canonical_reject') {
    if (!('input' in vector)) {
      return {
        id: entry.id,
        mode: entry.mode,
        passed: false,
        reason_code: DiagCode.VECTOR_INVALID,
        message: 'canonical_reject vector missing input',
      };
    }
    try {
      canonicalize(vector.input);
      return {
        id: entry.id,
        mode: entry.mode,
        passed: false,
        reason_code: DiagCode.VERDICT_MISMATCH,
        message: 'expected canonical_reject but canonicalize succeeded',
      };
    } catch (err) {
      if (err instanceof CanonicalizationError) {
        return { id: entry.id, mode: entry.mode, passed: true, reason_code: null, message: null };
      }
      return {
        id: entry.id,
        mode: entry.mode,
        passed: false,
        reason_code: DiagCode.RUNNER_ERROR,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }
  return {
    id: entry.id,
    mode: entry.mode,
    passed: false,
    reason_code: DiagCode.VECTOR_INVALID,
    message: `unknown expected token for canonicalization: ${entry.expected}`,
  };
}

function translateVectorOptions(raw: VectorFile['options']): VerifyOptions {
  if (!raw) return {};
  const out: { expectedTool?: string; strictTrust?: boolean } = {};
  if (typeof raw.expected_tool === 'string') out.expectedTool = raw.expected_tool;
  if (typeof raw.strict_trust === 'boolean') out.strictTrust = raw.strict_trust;
  return out;
}

function runVerifierVector(entry: ManifestEntry, vector: VectorFile): EnvelopeResult {
  if (!('proposal' in vector)) {
    return {
      id: entry.id,
      mode: entry.mode,
      passed: false,
      reason_code: DiagCode.VECTOR_INVALID,
      message: 'vector missing proposal',
    };
  }
  if (entry.expected !== 'allow' && entry.expected !== 'block') {
    return {
      id: entry.id,
      mode: entry.mode,
      passed: false,
      reason_code: DiagCode.VECTOR_INVALID,
      message: `unknown expected token for ${entry.mode}: ${entry.expected}`,
    };
  }
  if (entry.expected === 'block' && typeof vector.expected_error_code !== 'string') {
    return {
      id: entry.id,
      mode: entry.mode,
      passed: false,
      reason_code: DiagCode.VECTOR_INVALID,
      message: 'block vector missing expected_error_code',
    };
  }
  let result;
  try {
    result = verifyProposal(vector.proposal, translateVectorOptions(vector.options));
  } catch (err) {
    return {
      id: entry.id,
      mode: entry.mode,
      passed: false,
      reason_code: DiagCode.RUNNER_ERROR,
      message: err instanceof Error ? err.message : String(err),
    };
  }
  if (entry.expected === 'allow') {
    if (result.allowed) {
      return { id: entry.id, mode: entry.mode, passed: true, reason_code: null, message: null };
    }
    return {
      id: entry.id,
      mode: entry.mode,
      passed: false,
      reason_code: DiagCode.VERDICT_MISMATCH,
      message: `expected allow, got block(${result.error.code}: ${result.error.message})`,
    };
  }
  // expected === 'block'
  if (result.allowed) {
    return {
      id: entry.id,
      mode: entry.mode,
      passed: false,
      reason_code: DiagCode.VERDICT_MISMATCH,
      message: `expected block, got allow`,
    };
  }
  if (result.error.code !== vector.expected_error_code) {
    return {
      id: entry.id,
      mode: entry.mode,
      passed: false,
      reason_code: DiagCode.ERROR_CODE_MISMATCH,
      message: `expected ${vector.expected_error_code}, got ${result.error.code}`,
    };
  }
  return { id: entry.id, mode: entry.mode, passed: true, reason_code: null, message: null };
}

// ---------------------------------------------------------------------------
// runConformance: main entry point (never throws)
// ---------------------------------------------------------------------------

export function runConformance(options: RunOptions): Envelope {
  const filterModes = uniquePreserveOrder(options.filterModes ?? []);
  const filterIds = uniquePreserveOrder(options.filterIds ?? []);

  for (const m of filterModes) {
    if (m === 'evidence') {
      return makeErrorEnvelope(
        filterModes,
        filterIds,
        DiagCode.RUNNER_ERROR,
        'Mode "evidence" is not supported by this TypeScript runner in v0.9.0.',
        2,
      );
    }
    if (!RUNNER_RECOGNIZED_MODES.has(m)) {
      return makeErrorEnvelope(
        filterModes,
        filterIds,
        DiagCode.RUNNER_ERROR,
        `Unknown --filter-mode: ${m}`,
        2,
      );
    }
  }

  const loaded = loadManifest(options.manifest);
  if (!loaded.ok) {
    return makeErrorEnvelope(
      filterModes,
      filterIds,
      DiagCode.MANIFEST_INVALID,
      `ManifestError: ${loaded.message}`,
      2,
    );
  }
  const manifest = loaded.manifest;
  const totalInManifest = manifest.entries.length;

  const modeSet = new Set(filterModes);
  const idSet = new Set(filterIds);
  const anyFilter = modeSet.size > 0 || idSet.size > 0;
  const selected = manifest.entries.filter((e) => {
    if (!anyFilter) return true;
    return modeSet.has(e.mode) || idSet.has(e.id);
  });

  if (selected.length === 0) {
    return {
      manifest_version: manifest.version,
      selection: {
        total_in_manifest: totalInManifest,
        selected: 0,
        filter_modes: [...filterModes],
        filter_ids: [...filterIds],
      },
      results: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        all_passed: false,
        diagnostic: DiagCode.NO_VECTORS_SELECTED,
        message: '--filter-mode / --filter-id selected zero vectors',
      },
      exit_code: 2,
    };
  }

  const results: EnvelopeResult[] = [];
  for (const entry of selected) {
    if (entry.mode === 'evidence') {
      results.push({
        id: entry.id,
        mode: entry.mode,
        passed: false,
        reason_code: DiagCode.RUNNER_ERROR,
        message: 'evidence mode not supported in this build; scheduled for v0.9.x',
      });
      continue;
    }
    if (!SUPPORTED_MODES.has(entry.mode)) {
      // Defense in depth: loadManifest already rejects unknown modes.
      results.push({
        id: entry.id,
        mode: entry.mode,
        passed: false,
        reason_code: DiagCode.VECTOR_INVALID,
        message: `unsupported mode passed manifest validation: ${entry.mode}`,
      });
      continue;
    }
    const loadedVector = loadVectorFile(options.manifest, entry.file);
    if (!loadedVector.ok) {
      results.push({
        id: entry.id,
        mode: entry.mode,
        passed: false,
        reason_code: loadedVector.reason_code,
        message: loadedVector.message,
      });
      continue;
    }
    if (entry.mode === 'canonicalization') {
      results.push(runCanonicalizationVector(entry, loadedVector.vector));
    } else {
      results.push(runVerifierVector(entry, loadedVector.vector));
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  const allPassed = failed === 0;
  const exitCode = allPassed ? 0 : 1;

  return {
    manifest_version: manifest.version,
    selection: {
      total_in_manifest: totalInManifest,
      selected: results.length,
      filter_modes: [...filterModes],
      filter_ids: [...filterIds],
    },
    results,
    summary: {
      total: results.length,
      passed,
      failed,
      all_passed: allPassed,
      diagnostic: null,
      message: null,
    },
    exit_code: exitCode,
  };
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

export function renderJson(env: Envelope): string {
  return JSON.stringify(env, null, 2);
}

export function renderHuman(env: Envelope): string {
  const lines: string[] = [];
  lines.push(`Manifest: ${env.manifest_version ?? '<none>'}`);
  lines.push(`Selection: ${env.selection.selected}/${env.selection.total_in_manifest} vectors`);
  if (env.selection.filter_modes.length > 0) {
    lines.push(`  filter-modes: ${env.selection.filter_modes.join(', ')}`);
  }
  if (env.selection.filter_ids.length > 0) {
    lines.push(`  filter-ids: ${env.selection.filter_ids.join(', ')}`);
  }
  for (const r of env.results) {
    if (r.passed) {
      lines.push(`  PASS  ${r.id}`);
    } else {
      lines.push(`  FAIL  ${r.id}: ${r.reason_code ?? '?'} - ${r.message ?? ''}`);
    }
  }
  const s = env.summary;
  lines.push(`Summary: ${s.passed}/${s.total} passed, ${s.failed} failed`);
  if (s.diagnostic) {
    lines.push(`  diagnostic: ${s.diagnostic}`);
  }
  if (s.message) {
    lines.push(`  message: ${s.message}`);
  }
  lines.push(`exit_code=${env.exit_code}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI shim
// ---------------------------------------------------------------------------

function collectRepeatable(v: string, prev: string[] | undefined): string[] {
  return [...(prev ?? []), v];
}

function main(argv: readonly string[]): number {
  const program = new Command();
  program
    .name('pic-ts-run')
    .description('PIC Standard TypeScript conformance runner')
    .option('--manifest <path>', 'path to conformance manifest.json')
    .option(
      '--filter-mode <mode>',
      'restrict to this mode (repeatable, unions with --filter-id)',
      collectRepeatable,
    )
    .option(
      '--filter-id <id>',
      'restrict to this vector id (repeatable, unions with --filter-mode)',
      collectRepeatable,
    )
    .option('--json', 'emit JSON envelope on stdout', false)
    .option('--verbose', 'verbose human output (no effect on --json)', false);
  program.parse(['node', 'pic-ts-run', ...argv]);
  const opts = program.opts<{
    manifest?: string;
    filterMode?: string[];
    filterId?: string[];
    json?: boolean;
  }>();

  const env = runConformance({
    manifest: opts.manifest ?? 'vendor/pic-standard/conformance/manifest.json',
    filterModes: opts.filterMode ?? [],
    filterIds: opts.filterId ?? [],
  });

  if (opts.json) {
    process.stdout.write(renderJson(env) + '\n');
  } else {
    process.stdout.write(renderHuman(env) + '\n');
  }
  return env.exit_code;
}

const thisFileUrl = import.meta.url;
const invokedUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (thisFileUrl === invokedUrl) {
  process.exit(main(process.argv.slice(2)));
}
