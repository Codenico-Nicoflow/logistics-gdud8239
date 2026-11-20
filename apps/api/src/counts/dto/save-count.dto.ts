import { CountShift } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CountLineDto {
  @IsUUID('4')
  itemId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0, { message: 'כמות לא יכולה להיות שלילית' })
  countedQty!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  faultyQty?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CountLineDto)
  lines!: CountLineDto[];
}
