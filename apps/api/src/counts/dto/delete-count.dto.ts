import { IsString, MaxLength, MinLength } from 'class-validator';

export class DeleteCountDto {
  @IsString()
  @MinLength(3, { message: 'יש לציין סיבה למחיקת הספירה' })
  @MaxLength(200)
  reason!: string;
}
