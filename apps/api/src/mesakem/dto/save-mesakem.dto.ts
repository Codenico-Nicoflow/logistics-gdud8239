import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';

export class MesakemLineDto {
  @IsUUID('4')
  itemId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0, { message: 'כמות לא יכולה להיות שלילית' })
  nashkiyaQty!: number;
}

export class SaveMesakemDto {
  @IsDateString({}, { message: 'תאריך לא תקין' })
  sessionDate!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MesakemLineDto)
  lines!: MesakemLineDto[];
}
