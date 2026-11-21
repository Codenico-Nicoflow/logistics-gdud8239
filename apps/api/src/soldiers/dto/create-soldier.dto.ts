import { Company } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateSoldierDto {
  @IsString()
  @MinLength(1, { message: 'נדרש שם פרטי' })
  @MaxLength(60)
  firstName!: string;

  @IsString()
  @MinLength(1, { message: 'נדרש שם משפחה' })
  @MaxLength(60)
  lastName!: string;

  /**
   * Optional: the Excel has rows without a מ.א., and the app must be able to
   * record a soldier now and fill it in later.
   */
  @IsOptional()
  @Matches(/^\d{5,9}$/, { message: 'מספר אישי חייב להיות בין 5 ל-9 ספרות' })
  personalNumber?: string;

  @IsOptional()
  @Matches(/^0\d{1,2}-?\d{7}$/, { message: 'מספר טלפון לא תקין' })
  phone?: string;

  @IsEnum(Company, { message: 'פלוגה לא חוקית' })
  company!: Company;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  receiptNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  /** מסופח — attached from another unit (e.g. for one תעסוקה). Defaults to organic. */
  @IsOptional()
  @IsBoolean()
  isAttached?: boolean;
}
