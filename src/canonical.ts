/**
 * PIC-CJSON/1.0 canonicalizer.
 *
 * Native-first strategy: object key sorting and value dispatch are custom,
 * but number and string serialization delegate to ECMAScript's built-in
 * `Number.prototype.toString()` and `JSON.stringify()` respectively, which
 * already produce the byte-exact output RFC 8785 / PIC-CJSON/1.0 requires
 * under modern V8 (Node 20+).
 *
 * The public API accepts `unknown`, so we defensively reject any host
 * value that has no portable JSON representation: non-finite numbers,
 * strings with lone UTF-16 surrogates, host-language types with no JSON
 * mapping (Date, Map, Set, class instances, functions, symbols, bigint,
 * undefined), objects with own symbol keys, objects with non-enumerable
 * or accessor own properties, arrays with non-index or non-enumerable or
 * accessor own properties, sparse arrays, and circular references.
 */

import { TextEncoder } from 'node:util';

const TEXT_ENCODER = new TextEncoder();

export class CanonicalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanonicalizationError';
  }
}

/**
 * Canonicalize a JSON-shaped value to UTF-8 bytes per PIC-CJSON/1.0.
 *
 * @throws CanonicalizationError for non-portable inputs.
 */
export function canonicalize(value: unknown): Uint8Array {
  const seen = new WeakSet<object>();
  const s = serializeValue(value, seen);
  return TEXT_ENCODER.encode(s);
}

function serializeValue(value: unknown, seen: WeakSet<object>): string {
  if (value === null) {
    return 'null';
  }
  const t = typeof value;
  if (t === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (t === 'number') {
    return serializeNumber(value as number);
  }
  if (t === 'string') {
    return serializeString(value as string);
  }
  if (t === 'object') {
    if (Array.isArray(value)) {
      return serializeArray(value, seen);
    }
    return serializeObject(value as object, seen);
  }
  // Explicit rejections: bigint, undefined, symbol, function.
  throw new CanonicalizationError(`Unsupported value type: ${t}`);
}

function serializeNumber(n: number): string {
  if (!Number.isFinite(n)) {
    throw new CanonicalizationError(`Non-finite number is not a portable JSON value: ${n}`);
  }
  // Normalize -0 to 0 per spec section 7.9.
  if (Object.is(n, -0)) {
    return '0';
  }
  // ECMAScript Number-to-String algorithm produces RFC 8785 section 3.2.2.3
  // shortest-round-trip form for finite numbers.
  return n.toString();
}

function serializeString(s: string): string {
  // Reject lone UTF-16 surrogates before emitting anything.
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      // High surrogate: MUST be followed by a low surrogate.
      const next = s.charCodeAt(i + 1);
      if (Number.isNaN(next) || next < 0xdc00 || next > 0xdfff) {
        throw new CanonicalizationError('String contains lone high surrogate');
      }
      i++; // consume the paired low surrogate
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      // Low surrogate without a preceding high surrogate.
      throw new CanonicalizationError('String contains lone low surrogate');
    }
  }
  // JSON.stringify in Node 20 produces PIC-CJSON-compliant escaping:
  // \", \\, \b, \t, \n, \f, \r, \u00XX lowercase for other C0 controls,
  // no forward-slash escape, no non-ASCII escape.
  const encoded = JSON.stringify(s);
  if (typeof encoded !== 'string') {
    throw new CanonicalizationError('String serialization failed');
  }
  return encoded;
}

function isArrayIndexKey(key: string, length: number): boolean {
  if (!/^(0|[1-9]\d*)$/.test(key)) {
    return false;
  }
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length;
}

function validateArrayShape(arr: readonly unknown[]): Record<string, PropertyDescriptor> {
  const symbolKeys = Object.getOwnPropertySymbols(arr);
  if (symbolKeys.length > 0) {
    throw new CanonicalizationError('Array has own symbol keys');
  }

  const descriptors = Object.getOwnPropertyDescriptors(arr);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (key === 'length') {
      continue;
    }
    if (!isArrayIndexKey(key, arr.length)) {
      throw new CanonicalizationError(`Array has non-index property: ${key}`);
    }
    if (!descriptor.enumerable) {
      throw new CanonicalizationError(`Array index is not enumerable: ${key}`);
    }
    if (!('value' in descriptor)) {
      throw new CanonicalizationError(`Array index is an accessor: ${key}`);
    }
  }

  return descriptors;
}

function serializeArray(arr: readonly unknown[], seen: WeakSet<object>): string {
  if (seen.has(arr)) {
    throw new CanonicalizationError('Circular reference detected');
  }
  const descriptors = validateArrayShape(arr);
  seen.add(arr);
  try {
    const parts: string[] = [];
    for (let i = 0; i < arr.length; i++) {
      const descriptor = descriptors[String(i)];
      if (descriptor === undefined) {
        throw new CanonicalizationError(`Array has sparse index: ${i}`);
      }
      if (!('value' in descriptor)) {
        throw new CanonicalizationError(`Array index is unavailable: ${i}`);
      }
      parts.push(serializeValue(descriptor.value, seen));
    }
    return '[' + parts.join(',') + ']';
  } finally {
    seen.delete(arr);
  }
}

function serializeObject(obj: object, seen: WeakSet<object>): string {
  // Reject non-plain objects: Date, Map, Set, class instances, etc.
  const proto = Object.getPrototypeOf(obj) as object | null;
  if (proto !== Object.prototype && proto !== null) {
    throw new CanonicalizationError('Only plain objects are allowed');
  }
  // Reject own symbol keys.
  const symbolKeys = Object.getOwnPropertySymbols(obj);
  if (symbolKeys.length > 0) {
    throw new CanonicalizationError('Object has own symbol keys');
  }
  // Cycle detection.
  if (seen.has(obj)) {
    throw new CanonicalizationError('Circular reference detected');
  }
  // Validate every own string-keyed property is an enumerable data property.
  const descriptors = Object.getOwnPropertyDescriptors(obj);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor.enumerable) {
      throw new CanonicalizationError(`Object property is not enumerable: ${key}`);
    }
    if (!('value' in descriptor)) {
      throw new CanonicalizationError(`Object property is an accessor: ${key}`);
    }
  }
  seen.add(obj);
  try {
    const keys = Object.keys(descriptors).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const parts: string[] = [];
    for (const k of keys) {
      const descriptor = descriptors[k];
      if (descriptor === undefined || !('value' in descriptor)) {
        throw new CanonicalizationError(`Object property is unavailable: ${k}`);
      }
      parts.push(serializeString(k) + ':' + serializeValue(descriptor.value, seen));
    }
    return '{' + parts.join(',') + '}';
  } finally {
    seen.delete(obj);
  }
}
