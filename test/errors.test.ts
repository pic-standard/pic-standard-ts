import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

import { PICErrorCode } from '../src/errors.js';

const ERRORS_PY = resolve(
  process.cwd(),
  'vendor',
  'pic-standard',
  'sdk-python',
  'pic_standard',
  'errors.py',
);
const submoduleAvailable = existsSync(ERRORS_PY);

/**
 * Extract `NAME = "PIC_..."` entries from the body of `class PICErrorCode`
 * only. Ignores anything outside the class body (imports, other classes,
 * helpers, module-level constants).
 */
function extractPICErrorCodeMembers(
  src: string,
): ReadonlyArray<{ readonly name: string; readonly value: string }> {
  const classHeader = src.match(/^class PICErrorCode\b[^:]*:\s*$/m);
  if (!classHeader || classHeader.index === undefined) {
    throw new Error('class PICErrorCode not found in errors.py');
  }
  const afterClass = src.slice(classHeader.index + classHeader[0].length);
  const bodyEnd = afterClass.match(/^(?:class |def |@)/m);
  const body =
    bodyEnd && bodyEnd.index !== undefined ? afterClass.slice(0, bodyEnd.index) : afterClass;
  const pattern = /^ {4}([A-Z][A-Z_]*)\s*=\s*"(PIC_[A-Z_]+)"\s*$/gm;
  const members: Array<{ name: string; value: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(body)) !== null) {
    const name = m[1];
    const value = m[2];
    if (name === undefined || value === undefined) {
      continue;
    }
    members.push({ name, value });
  }
  return members;
}

describe('PICErrorCode: local shape', () => {
  it('exports an immutable runtime object', () => {
    expect(Object.isFrozen(PICErrorCode)).toBe(true);
  });

  it('all values start with PIC_', () => {
    for (const value of Object.values(PICErrorCode)) {
      expect(value).toMatch(/^PIC_/);
    }
  });

  it('all values are unique', () => {
    const values = Object.values(PICErrorCode);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe.skipIf(!submoduleAvailable)('PICErrorCode: parity with Repo A source', () => {
  const src = submoduleAvailable ? readFileSync(ERRORS_PY, 'utf-8') : '';
  const sourceEntries = submoduleAvailable ? extractPICErrorCodeMembers(src) : [];

  it('extracts at least one member from the Python class body', () => {
    expect(sourceEntries.length).toBeGreaterThan(0);
  });

  it('has the same number of members as Repo A PICErrorCode', () => {
    expect(Object.keys(PICErrorCode).length).toBe(sourceEntries.length);
  });

  it('has the same member names as Repo A PICErrorCode', () => {
    const tsNames = new Set(Object.keys(PICErrorCode));
    const pyNames = new Set(sourceEntries.map((e) => e.name));
    expect(tsNames).toEqual(pyNames);
  });

  it('has the same member values as Repo A PICErrorCode', () => {
    const tsValues = new Set(Object.values(PICErrorCode));
    const pyValues = new Set(sourceEntries.map((e) => e.value));
    expect(tsValues).toEqual(pyValues);
  });

  it('has matching name-to-value mappings', () => {
    for (const { name, value } of sourceEntries) {
      expect(PICErrorCode[name as keyof typeof PICErrorCode]).toBe(value);
    }
  });
});
