import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class IssueDto {
  @IsUUID('4', { message: 'מזהה חייל לא חוקי' })
  soldierId!: string;

  @IsUUID('4', { message: 'מזהה פריט לא חוקי' })
  itemId!: string;

  /**
   * Required for a serialized item. The service rejects a serialized item
   * without one — unlike the Excel import, which flags instead of refusing.
   */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  serial?: string;

  /** Only meaningful for non-serialized items; a serial carries a quantity of 1. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'כמות חייבת להיות לפחות 1' })
  @Max(100_000)
  quantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  receiptNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
