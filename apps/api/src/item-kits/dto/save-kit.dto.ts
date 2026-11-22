import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsUUID, Max, Min, ValidateNested } from 'class-validator';

export class KitLineDto {
  @IsUUID()
  itemId!: string;

  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;
}

export class SaveKitDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => KitLineDto)
  lines!: KitLineDto[];
}
