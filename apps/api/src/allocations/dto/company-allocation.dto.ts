import { Type } from 'class-transformer';
import { IsInt, IsString, Max, Min, MaxLength } from 'class-validator';
import type { CompanyCode } from '../../companies/company-code';

/** One cell of the samgad's grid — "פלוגה א מקבלת 82 M-4". */
export class SetCompanyAllocationDto {
  @IsString()
  itemId!: string;

  @IsString({ message: 'פלוגה לא חוקית' })
  @MaxLength(40, { message: 'פלוגה לא חוקית' })
  company!: CompanyCode;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  quantity!: number;
}

/** Adds an item to the grid at 0 for every company. */
export class AddGridItemDto {
  @IsString()
  itemId!: string;
}
