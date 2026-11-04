import { Company, MovementAction } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationDto } from '../../common/pagination.dto';

export class QueryMovementsDto extends PaginationDto {
  /** Free-text across soldier name, item name, serial and who performed it. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;

  @IsOptional()
  @IsEnum(MovementAction, { message: 'פעולה לא חוקית' })
  action?: MovementAction;

  @IsOptional()
  @IsEnum(Company, { message: 'פלוגה לא חוקית' })
  company?: Company;

  @IsOptional()
  @IsUUID('4')
  soldierId?: string;

  @IsOptional()
  @IsUUID('4')
  itemId?: string;

  @IsOptional()
  @IsUUID('4')
  performedByUserId?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'תאריך התחלה לא תקין' })
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'תאריך סיום לא תקין' })
  to?: Date;
}
