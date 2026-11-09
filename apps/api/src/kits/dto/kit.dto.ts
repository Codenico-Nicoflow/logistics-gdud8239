import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class KitLineDto {
  @IsString()
  itemId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'כמות בערכה חייבת להיות לפחות 1' })
  quantity!: number;
}

export class CreateKitDto {
  @IsString()
  @MinLength(1, { message: 'נדרש שם לערכה' })
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'ערכה חייבת לכלול לפחות פריט אחד' })
  @ValidateNested({ each: true })
  @Type(() => KitLineDto)
  lines!: KitLineDto[];
}

export class UpdateKitDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** When given, replaces the kit's contents wholesale. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'ערכה חייבת לכלול לפחות פריט אחד' })
  @ValidateNested({ each: true })
  @Type(() => KitLineDto)
  lines?: KitLineDto[];
}
