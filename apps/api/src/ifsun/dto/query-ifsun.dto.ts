import { Transform } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationDto } from '../../common/pagination.dto';
import { asDate } from '../../movements/dto/query-movements.dto';

export class QueryIfsunDto extends PaginationDto {
  /** `ALL` includes closed records — the history. Default is what is on the shelf now. */
  @IsOptional()
  @IsIn(['STORED', 'COLLECTED', 'CREDITED', 'ALL'])
  status?: 'STORED' | 'COLLECTED' | 'CREDITED' | 'ALL';

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  q?: string;

  /** Day the item was stored, from (inclusive) … */
  @IsOptional()
  @Transform(asDate('from'))
  @IsDate()
  from?: Date;

  /** … to (inclusive, the whole Israeli day). */
  @IsOptional()
  @Transform(asDate('to'))
  @IsDate()
  to?: Date;
}
