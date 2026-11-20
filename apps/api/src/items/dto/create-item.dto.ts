import { ItemCategory } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateItemDto {
  @IsString()
  @MinLength(1, { message: 'נדרש שם פריט' })
  @MaxLength(80)
  name!: string;

  /** Alternative spellings the Excel import should resolve to this item. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  aliases?: string[];

  @IsEnum(ItemCategory, { message: 'קטגוריה לא חוקית' })
  category!: ItemCategory;

  /** Whether a מסד is mandatory when signing this item out. */
  @IsBoolean()
  isSerialized!: boolean;

  /** Whether the item shows in מסכם and the ספירת נשקיה sheet. Defaults to true. */
  @IsOptional()
  @IsBoolean()
  inSummary?: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  authorizedQty!: number;

  /** Units physically at ימ״ח, out of authorizedQty. Admin-typed count. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  yamahQty?: number;

  /** Bulk (non-serialized) units currently sent out for repair, out of
   *  authorizedQty. Admin-typed count — serialized items track this per
   *  מסד via InstanceStatus.IN_REPAIR instead. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  repairQty?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice?: number;
}
