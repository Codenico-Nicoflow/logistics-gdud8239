import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

export class AdminDto {
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'שם משתמש קצר מדי' })
  @MaxLength(64)
  adminUsername!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'נדרש שם לתצוגה' })
  @MaxLength(120)
  adminDisplayName!: string;
}

export class CreateBattalionDto extends AdminDto {
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'נדרש שם לגדוד' })
  @MaxLength(60)
  name!: string;

  /** The battalion's number as printed ("8239"). Unique across the platform, and fixed once created. */
  @Transform(trim)
  @Matches(/^\d{2,6}$/, { message: 'מספר הגדוד הוא 2 עד 6 ספרות' })
  number!: string;
}

export class RenameBattalionDto {
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'נדרש שם לגדוד' })
  @MaxLength(60)
  name!: string;
}

export class ActAsDto {
  @IsString()
  @MaxLength(64)
  battalionId!: string;
}
