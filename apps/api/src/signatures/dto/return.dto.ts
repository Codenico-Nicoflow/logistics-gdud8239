import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ReturnDto {
  /** Partial return of a non-serialized item; omitted returns the whole quantity. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'כמות חייבת להיות לפחות 1' })
  @Max(100_000)
  quantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
