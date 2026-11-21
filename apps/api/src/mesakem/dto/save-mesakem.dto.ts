import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

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

  /**
   * Required when the day's figures changed while a count already signed them:
   * saving then reopens that count (signatures cleared) and records this reason.
   */
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'יש לציין סיבה לתיקון' })
  @MaxLength(200)
  correctionReason?: string;
}
