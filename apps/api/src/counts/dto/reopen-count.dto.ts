import { IsString, MaxLength, MinLength } from 'class-validator';

export class ReopenCountDto {
  @IsString()
  @MinLength(3, { message: 'יש לציין סיבה לביטול הסגירה' })
  @MaxLength(200)
  reason!: string;
}
