import { Company, Role } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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
  @IsEnum(Company, { message: 'פלוגה לא חוקית' })
  companyScope?: Company;

  /** Optional: when omitted the API generates one and returns it once. */
  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'הסיסמה חייבת להכיל לפחות 6 תווים' })
  @MaxLength(200)
  password?: string;
}
