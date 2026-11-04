import { Company } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationDto } from '../../common/pagination.dto';

export class QuerySignaturesDto extends PaginationDto {
  /** Free-text search across soldier name, מ.א. and serial. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;

  @IsOptional()
  @IsEnum(Company, { message: 'פלוגה לא חוקית' })
  company?: Company;

  @IsOptional()
  @IsUUID('4')
  itemId?: string;

  @IsOptional()
  @IsUUID('4')
  soldierId?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeReturned?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  needsAttentionOnly?: boolean;
}
