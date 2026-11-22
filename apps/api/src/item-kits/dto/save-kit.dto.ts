import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsInt, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { KitLineMode } from '@prisma/client';

export class KitLineDto {
  @IsUUID()
  itemId!: string;

  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;

  @IsEnum(KitLineMode)
  mode!: KitLineMode;
}

export class SaveKitDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => KitLineDto)
  lines!: KitLineDto[];
}
