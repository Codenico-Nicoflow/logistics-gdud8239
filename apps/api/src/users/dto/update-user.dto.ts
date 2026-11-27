import { Role } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { CompanyCode } from '../../companies/company-code';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsEnum(Role, { message: 'תפקיד לא חוקי' })
  role?: Role;

  @IsOptional()
  @IsString({ message: 'פלוגה לא חוקית' })
  @MaxLength(40, { message: 'פלוגה לא חוקית' })
  companyScope?: CompanyCode | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Only a super-admin may set this — enforced in UsersService, not here. */
  @IsOptional()
  @IsBoolean()
  isSuperAdmin?: boolean;

  /** Excuses the person from the authenticator step. Super-admin only — enforced in UsersService. */
  @IsOptional()
  @IsBoolean()
  mfaExempt?: boolean;
}
