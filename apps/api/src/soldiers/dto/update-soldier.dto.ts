import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateSoldierDto } from './create-soldier.dto';

export class UpdateSoldierDto extends PartialType(CreateSoldierDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
