import { IsString, MaxLength } from 'class-validator';

export class SetupPasswordDto {
  /** Strength is judged by `checkPassword` (it needs the person's own name), not by length rules here. */
  @IsString()
  @MaxLength(200, { message: 'סיסמה ארוכה מדי' })
  password!: string;
}
