import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateCompanyDto {
  @IsString({ message: 'שם הפלוגה חסר' })
  @IsNotEmpty({ message: 'שם הפלוגה חסר' })
  @MaxLength(40, { message: 'שם הפלוגה ארוך מדי' })
  name!: string;
}

/** The code is never editable: other tables hold it. Rename, reorder, or deactivate. */
export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'שם הפלוגה חסר' })
  @MaxLength(40, { message: 'שם הפלוגה ארוך מדי' })
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
