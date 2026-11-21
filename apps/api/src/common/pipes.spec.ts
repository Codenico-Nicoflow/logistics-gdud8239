import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { BoundedIntPipe, IsoDatePipe, OptionalIsoDatePipe, OptionalUuidPipe, RejectNullBytesPipe } from './pipes';

describe('OptionalIsoDatePipe / IsoDatePipe', () => {
  it('accepts a real date, passes through empty, rejects everything else', () => {
    const pipe = new OptionalIsoDatePipe();
    expect(pipe.transform('2026-11-21')).toBe('2026-11-21');
    expect(pipe.transform(undefined)).toBeUndefined();
    expect(pipe.transform('')).toBeUndefined();
    for (const bad of ['2026-13-45', '2026-02-30x', "' OR 1=1", 'yesterday', '21/11/2026']) {
      expect(() => pipe.transform(bad), bad).toThrow(BadRequestException);
    }
  });

  it('the required form refuses a missing date', () => {
    expect(() => new IsoDatePipe().transform(undefined)).toThrow(BadRequestException);
  });
});

describe('BoundedIntPipe', () => {
  const pipe = new BoundedIntPipe(1, 200, 'take');
  it('accepts whole numbers in range', () => {
    expect(pipe.transform('1')).toBe(1);
    expect(pipe.transform('200')).toBe(200);
    expect(pipe.transform(undefined)).toBeUndefined();
  });
  it('rejects out of range, fractional and non-numeric values', () => {
    for (const bad of ['0', '201', '-3', '1.5', 'abc', '1e9', ' ']) {
      expect(() => pipe.transform(bad), bad).toThrow(BadRequestException);
    }
  });
});

describe('OptionalUuidPipe', () => {
  it('accepts a v4 UUID and rejects anything else', () => {
    const pipe = new OptionalUuidPipe();
    expect(pipe.transform('00000000-0000-4000-8000-000000000000')).toBe('00000000-0000-4000-8000-000000000000');
    expect(pipe.transform(undefined)).toBeUndefined();
    expect(() => pipe.transform("' OR 1=1--")).toThrow(BadRequestException);
    expect(() => pipe.transform('not-a-uuid')).toThrow(BadRequestException);
  });
});

describe('RejectNullBytesPipe', () => {
  const pipe = new RejectNullBytesPipe();
  it('refuses a NUL anywhere, however deep, in a string, key or array', () => {
    expect(() => pipe.transform('a\u0000b')).toThrow(BadRequestException);
    expect(() => pipe.transform({ q: ['ok', { deep: 'x\u0000' }] })).toThrow(BadRequestException);
    expect(() => pipe.transform({ ['k\u0000']: 1 })).toThrow(BadRequestException);
  });
  it('leaves ordinary Hebrew, numbers, null and nested data untouched', () => {
    const value = { name: 'חייל א׳', n: 3, none: null, list: [{ a: 'x' }] };
    expect(pipe.transform(value)).toBe(value);
    expect(pipe.transform(undefined)).toBeUndefined();
  });
});
