import { AttendanceStatus, Gender } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class SetAttendanceDto {
  @IsUUID('4')
  teamMemberId!: string;

  @IsDateString({}, { message: 'תאריך לא תקין' })
  date!: string;

  /** `null` clears the cell. */
  @IsOptional()
  @IsEnum(AttendanceStatus, { message: 'סטטוס לא חוקי' })
  status?: AttendanceStatus | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class BulkAttendanceDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SetAttendanceDto)
  cells!: SetAttendanceDto[];
}

export class CreateTeamMemberDto {
  @IsString()
  @MinLength(1, { message: 'נדרש שם' })
  @MaxLength(40)
  nickname!: string;

  @IsOptional() @IsString() @MaxLength(80) fullName?: string;
  @IsOptional() @IsString() @MaxLength(20) personalNumber?: string;

  @IsEnum(Gender, { message: 'מין לא חוקי' })
  gender!: Gender;

  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

export class UpdateTeamMemberDto {
  @IsOptional() @IsString() @MaxLength(40) nickname?: string;
  @IsOptional() @IsString() @MaxLength(80) fullName?: string;
  @IsOptional() @IsString() @MaxLength(20) personalNumber?: string;
  @IsOptional() @IsEnum(Gender) gender?: Gender;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}
