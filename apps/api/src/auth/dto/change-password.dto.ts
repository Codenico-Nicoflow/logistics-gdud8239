import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: 'נדרשת הסיסמה הנוכחית' })
  currentPassword!: string;

  @IsString()
  @MinLength(10, { message: 'הסיסמה החדשה חייבת להכיל לפחות 10 תווים' })
  @MaxLength(200, { message: 'סיסמה ארוכה מדי' })
  newPassword!: string;
}
