import { ItemCategory } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
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
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
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
  @Max(1_000_000)
  authorizedQty!: number;

  /** Units physically at ימ״ח, out of authorizedQty. Admin-typed count. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  yamahQty?: number;

  /** Bulk (non-serialized) units currently sent out for repair, out of
   *  authorizedQty. Admin-typed count — serialized items track this per
   *  מסד via InstanceStatus.IN_REPAIR instead. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  repairQty?: number;

  /** The מסדים of the bulk units in repair (at most `repairQty`; a unit may have none). Ignored for a
   *  serialized item, whose repair list is its instances marked IN_REPAIR. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  repairSerials?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100_000_000)
  unitPrice?: number;
}
