import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/pagination.dto';

export class QueryIfsunDto extends PaginationDto {
  /** `ALL` includes closed records — the history. Default is what is on the shelf now. */
  @IsOptional()
  @IsIn(['STORED', 'COLLECTED', 'CREDITED', 'ALL'])
  status?: 'STORED' | 'COLLECTED' | 'CREDITED' | 'ALL';

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  q?: string;
}
