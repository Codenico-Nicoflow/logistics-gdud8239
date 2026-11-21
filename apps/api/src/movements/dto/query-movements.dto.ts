import { Company, MovementAction } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationDto } from '../../common/pagination.dto';
import { israelDayEnd, israelDayStart } from '../../common/israel-date';

const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `2026-11-21` means that whole Israeli day, not the UTC instant it parses to —
 * otherwise "to" would exclude its own day. Reads the raw query string
 * (`obj`) because the global pipe's implicit conversion has already turned
 * `value` into a UTC `Date` by the time a transform runs.
 */
export function asDate(field: 'from' | 'to') {
  return ({ obj }: { obj: Record<string, unknown> }): unknown => {
    const raw = obj[field];
    if (typeof raw !== 'string') return raw;
    if (DAY_ONLY.test(raw)) return field === 'from' ? israelDayStart(raw) : israelDayEnd(raw);
    return new Date(raw);
  };
}

export class QueryMovementsDto extends PaginationDto {
  /** Free-text across soldier name, item name, serial and who performed it. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;

  @IsOptional()
  @IsEnum(MovementAction, { message: 'פעולה לא חוקית' })
  action?: MovementAction;

  @IsOptional()
  @IsEnum(Company, { message: 'פלוגה לא חוקית' })
  company?: Company;

  @IsOptional()
  @IsUUID('4')
  soldierId?: string;

  @IsOptional()
  @IsUUID('4')
  itemId?: string;

  @IsOptional()
  @IsUUID('4')
  performedByUserId?: string;

  @IsOptional()
  @Transform(asDate('from'))
  @IsDate({ message: 'תאריך התחלה לא תקין' })
  from?: Date;

  @IsOptional()
  @Transform(asDate('to'))
  @IsDate({ message: 'תאריך סיום לא תקין' })
  to?: Date;
}
