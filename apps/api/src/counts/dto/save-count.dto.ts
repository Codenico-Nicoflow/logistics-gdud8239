import { CountShift } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

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

  // Same shape and cap as every other drawn signature (1008, אפסון): a PNG data URL, nothing else.
  @IsOptional() @IsString() @Matches(PNG_DATA_URL, { message: 'חתימה לא תקינה' }) @MaxLength(400_000, { message: 'החתימה גדולה מדי' })
  responsibleSignatureImage?: string;
  @IsOptional() @IsString() @Matches(PNG_DATA_URL, { message: 'חתימה לא תקינה' }) @MaxLength(400_000, { message: 'החתימה גדולה מדי' })
  officerSignatureImage?: string;
}
