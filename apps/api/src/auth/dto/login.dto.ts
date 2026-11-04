import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(2, { message: 'שם משתמש קצר מדי' })
  @MaxLength(64, { message: 'שם משתמש ארוך מדי' })
  username!: string;

  @IsString()
  @MinLength(1, { message: 'נדרשת סיסמה' })
  @MaxLength(200, { message: 'סיסמה ארוכה מדי' })
  password!: string;
}
