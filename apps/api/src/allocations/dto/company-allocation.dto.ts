import { Type } from 'class-transformer';
import { Company } from '@prisma/client';
import { IsEnum, IsInt, IsString, Min } from 'class-validator';

/** One cell of the samgad's grid — "פלוגה א מקבלת 82 M-4". */
export class SetCompanyAllocationDto {
  @IsString()
  itemId!: string;

  @IsEnum(Company, { message: 'פלוגה לא חוקית' })
  company!: Company;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity!: number;
}

/** Adds an item to the grid at 0 for every company. */
export class AddGridItemDto {
  @IsString()
  itemId!: string;
}
