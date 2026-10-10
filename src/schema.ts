/**
 * PIC/1.0 Action Proposal schema validator.
 *
 * The Ajv validator is compiled lazily from this package's bundled
 * copy of `proposal_schema.json` under `schemas/`. Ajv 8's default
 * strict mode stays on; `allErrors: true` lets callers see every
 * violation in one pass, and `validateSchema: true` verifies the
 * schema itself is well-formed at compile time.
 *
 * The schema path resolves relative to this module's own URL, so it
 * works identically whether loaded from `src/schema.ts` under source
 * tests or from `dist/schema.js` inside an npm-installed consumer.
 * The build script `scripts/copy-schema.mjs` copies the schema from
 * the pinned pic-standard submodule into `schemas/` before every
 * build and test; this package's `files` field ships `schemas/`
 * alongside `dist/`.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ajv } from 'ajv';
import type { ValidateFunction, ErrorObject, AnySchema } from 'ajv';

import type { ActionProposal } from './types.js';

const PACKAGE_SCHEMA_PATH = fileURLToPath(
  new URL('../schemas/proposal_schema.json', import.meta.url),
);

/**
 * A single validation error surfaced to callers.
 */
export interface ValidationError {
  /** JSON pointer to the offending value. Root is normalized to `/`. */
  readonly path: string;
  /** Human-readable Ajv message. */
  readonly message: string;
  /** Ajv keyword that failed (e.g. `required`, `enum`, `pattern`, `const`). */
  readonly keyword: string;
}

/**
 * Validation result. On success, `.proposal` narrows to `ActionProposal`.
 */
export type ValidationResult =
  | { readonly ok: true; readonly proposal: ActionProposal }
  | { readonly ok: false; readonly errors: readonly ValidationError[] };

let cachedValidator: ValidateFunction | undefined;

function loadValidator(): ValidateFunction {
  if (cachedValidator !== undefined) {
    return cachedValidator;
  }
  let raw: string;
  try {
    raw = readFileSync(PACKAGE_SCHEMA_PATH, 'utf-8');
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not read bundled proposal schema at ${PACKAGE_SCHEMA_PATH}: ${detail}. ` +
        `This usually indicates a packaging failure: the published tarball ` +
        `should include \`schemas/proposal_schema.json\` next to \`dist/\`. ` +
        `In a source checkout, run \`npm run copy-schema\` (or any build/test ` +
        `which triggers it automatically) to regenerate it from the pinned ` +
        `pic-standard submodule.`,
    );
  }
  let schema: AnySchema;
  try {
    schema = JSON.parse(raw) as AnySchema;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Malformed JSON in ${PACKAGE_SCHEMA_PATH}: ${detail}`);
  }
  const ajv = new Ajv({
    allErrors: true,
    strict: true,
    validateSchema: true,
  });
  cachedValidator = ajv.compile(schema);
  return cachedValidator;
}

function normalizeErrors(errors: readonly ErrorObject[] | null | undefined): ValidationError[] {
  if (!errors) {
    return [];
  }
  return errors.map((e) => ({
    path: e.instancePath === '' ? '/' : e.instancePath,
    message: e.message ?? 'validation error',
    keyword: e.keyword,
  }));
}

/**
 * Validate a value against the PIC/1.0 Action Proposal schema.
 *
 * On success, `.proposal` is the schema-conformant input, typed as
 * `ActionProposal`. On failure, `.errors` is a non-empty list of
 * `ValidationError` objects. See `ValidationError` for the shape.
 */
export function validateProposal(value: unknown): ValidationResult {
  const validate = loadValidator();
  if (validate(value)) {
    return { ok: true, proposal: value as ActionProposal };
  }
  return { ok: false, errors: normalizeErrors(validate.errors) };
}
