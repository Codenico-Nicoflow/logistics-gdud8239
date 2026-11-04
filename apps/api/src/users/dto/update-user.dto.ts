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
}
