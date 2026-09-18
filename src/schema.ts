/**
 * PIC/1.0 Action Proposal schema validator.
 *
 * The Ajv validator is compiled lazily from the vendored copy of
 * `proposal_schema.json` at the current submodule pin. Ajv 8's default
 * strict mode stays on; `allErrors: true` lets callers see every
 * violation in one pass, and `validateSchema: true` verifies the schema
 * itself is well-formed at compile time.
 *
 * Pre-publish implementation: the schema is loaded from the vendored
 * Repo A submodule in the working tree (resolved from `process.cwd()`).
 * Release packaging will replace this with package-local schema loading
 * before npm publish.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Ajv } from 'ajv';
import type { ValidateFunction, ErrorObject, AnySchema } from 'ajv';

import type { ActionProposal } from './types.js';

// Pre-publish implementation: schema is loaded from the vendored Repo A
// submodule in the working tree. Release packaging will replace this with
// package-local schema loading before npm publish.
const REPO_ROOT_SCHEMA_PATH = resolve(
  process.cwd(),
  'vendor',
  'pic-standard',
  'sdk-python',
  'pic_standard',
  'schemas',
  'proposal_schema.json',
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
    raw = readFileSync(REPO_ROOT_SCHEMA_PATH, 'utf-8');
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not read ${REPO_ROOT_SCHEMA_PATH}: ${detail}. ` +
        'Run `git submodule update --init --recursive` to fetch the ' +
        'vendored pic-standard corpus.',
    );
  }
  let schema: AnySchema;
  try {
    schema = JSON.parse(raw) as AnySchema;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Malformed JSON in ${REPO_ROOT_SCHEMA_PATH}: ${detail}`);
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
