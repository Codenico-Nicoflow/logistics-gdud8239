import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationDto } from '../../common/pagination.dto';
import type { CompanyCode } from '../../companies/company-code';

export class QuerySignaturesDto extends PaginationDto {
  /** Free-text search across soldier name, מ.א. and serial. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;

  @IsOptional()
  @IsString({ message: 'פלוגה לא חוקית' })
  @MaxLength(40, { message: 'פלוגה לא חוקית' })
  company?: CompanyCode;

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
}
