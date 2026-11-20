import { CountShift } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class SaveCountDto {
  @IsDateString({}, { message: 'תאריך לא תקין' })
  sessionDate!: string;

  @IsEnum(CountShift, { message: 'משמרת לא חוקית' })
  shift!: CountShift;

  @IsOptional() @IsString() @MaxLength(80) responsibleName?: string;
  @IsOptional() @IsString() @MaxLength(20) responsiblePn?: string;
  @IsOptional() @IsString() @MaxLength(30) responsibleRank?: string;
  @IsOptional() @IsString() @MaxLength(80) officerName?: string;
  @IsOptional() @IsString() @MaxLength(20) officerPn?: string;
  @IsOptional() @IsString() @MaxLength(30) officerRank?: string;

  @IsOptional() @IsString() responsibleSignatureImage?: string;
  @IsOptional() @IsString() officerSignatureImage?: string;
}
