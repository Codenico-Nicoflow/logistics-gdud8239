import { InstanceStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class SetInstanceStatusDto {
  @IsEnum(InstanceStatus, { message: 'מצב לא חוקי' })
  status!: InstanceStatus;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}
