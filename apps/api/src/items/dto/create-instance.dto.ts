import { InstanceStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateInstanceDto {
  @IsString()
  @MinLength(1, { message: 'נדרש מסד' })
  @MaxLength(40)
  serial!: string;

  @IsOptional()
  @IsEnum(InstanceStatus, { message: 'מצב לא חוקי' })
  status?: InstanceStatus;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}
