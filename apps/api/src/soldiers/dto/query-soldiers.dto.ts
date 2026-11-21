import { Company } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../common/pagination.dto';

export class QuerySoldiersDto extends PaginationDto {
  /** Free-text search across name, מ.א. and phone. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;

  @IsOptional()
  @IsEnum(Company, { message: 'פלוגה לא חוקית' })
  company?: Company;

  @IsOptional()
  @Type(() => Boolean)
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  withOpenSignatures?: boolean;

  /**
   * Narrows by what the soldier is holding: `with` for anyone signed on
   * something, `without` for anyone holding nothing. The two are opposites, so
   * one field rather than two flags that could contradict each other.
   */
  @IsOptional()
  @IsIn(['with', 'without'], { message: 'מסנן החזקה לא חוקי' })
  holding?: 'with' | 'without';

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeInactive?: boolean;

  /** Soldiers missing a מ.א. or a phone — the data-cleanup view. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  incompleteOnly?: boolean;

  /** Only מסופחים — soldiers enlisted for a specific תעסוקה rather than the unit's own. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  attachedOnly?: boolean;

  /** `name` (default) sorts by last/first name; `company` groups by פלוגה first. */
  @IsOptional()
  @IsIn(['name', 'company'], { message: 'מיון לא חוקי' })
  sort?: 'name' | 'company';
}
