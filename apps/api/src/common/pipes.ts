import { BadRequestException, type PipeTransform } from '@nestjs/common';

/**
 * Query parameters arrive as strings and a `@Query('x') x?: Company` annotation checks nothing at
 * runtime: whatever the client sends reaches the service and then Prisma, which turns a bad value
 * into an opaque 500. These pipes make the shape part of the contract.
 */

/** An optional `YYYY-MM-DD` that must also be a real calendar date. */
export class OptionalIsoDatePipe implements PipeTransform<string | undefined, string | undefined> {
  transform(value: string | undefined): string | undefined {
    if (value === undefined || value === '') return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
      throw new BadRequestException('תאריך לא תקין');
    }
    return value;
  }
}

/** A required `YYYY-MM-DD`. */
export class IsoDatePipe extends OptionalIsoDatePipe {
  override transform(value: string | undefined): string {
    const date = super.transform(value);
    if (date === undefined) throw new BadRequestException('נדרש תאריך');
    return date;
  }
}

/** An optional whole number within bounds — a list length, a page offset. */
export class BoundedIntPipe implements PipeTransform<string | undefined, number | undefined> {
  constructor(
    private readonly min: number,
    private readonly max: number,
    private readonly label = 'ערך',
  ) {}

  transform(value: string | undefined): number | undefined {
    if (value === undefined || value === '') return undefined;
    const n = Number(value);
    if (!Number.isInteger(n) || n < this.min || n > this.max) {
      throw new BadRequestException(`${this.label} חייב להיות מספר שלם בין ${this.min} ל-${this.max}`);
    }
    return n;
  }
}

/** An optional id that must be a v4 UUID. */
export class OptionalUuidPipe implements PipeTransform<string | undefined, string | undefined> {
  transform(value: string | undefined): string | undefined {
    if (value === undefined || value === '') return undefined;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      throw new BadRequestException('מזהה לא חוקי');
    }
    return value;
  }
}

/**
 * Postgres cannot store a NUL character in text, and a value containing one makes the whole query
 * fail — which used to surface as a 500 from any search box. Nothing legitimate contains one, so a
 * request that does is refused up front, for every query, body and path parameter at once.
 */
export class RejectNullBytesPipe implements PipeTransform<unknown, unknown> {
  transform(value: unknown): unknown {
    if (containsNull(value)) throw new BadRequestException('הקלט מכיל תווים לא חוקיים');
    return value;
  }
}

function containsNull(value: unknown, depth = 0): boolean {
  if (depth > 20) return true; // absurdly deep input is not a real request
  if (typeof value === 'string') return value.includes('\u0000');
  if (Array.isArray(value)) return value.some((v) => containsNull(v, depth + 1));
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([k, v]) => k.includes('\u0000') || containsNull(v, depth + 1));
  }
  return false;
}
