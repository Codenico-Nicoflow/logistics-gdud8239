import { Company, Role } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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
  @IsEnum(Company, { message: 'פלוגה לא חוקית' })
  companyScope?: Company | null;

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
