import { Role } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { CompanyCode } from '../../companies/company-code';

export class CreateUserDto {
  @IsString()
  @MinLength(2, { message: 'שם משתמש קצר מדי' })
  @MaxLength(64)
  username!: string;

  @IsString()
  @MinLength(2, { message: 'נדרש שם לתצוגה' })
  @MaxLength(120)
  displayName!: string;

  @IsEnum(Role, { message: 'תפקיד לא חוקי' })
  role!: Role;

  @IsOptional()
  @IsString({ message: 'פלוגה לא חוקית' })
  @MaxLength(40, { message: 'פלוגה לא חוקית' })
  companyScope?: CompanyCode;

  /** Optional: when omitted the API generates one and returns it once. */
}
