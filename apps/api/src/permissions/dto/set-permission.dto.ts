import { IsEnum, IsString } from 'class-validator';
import { PermissionLevel, Role } from '@prisma/client';

export class SetPermissionDto {
  @IsEnum(Role)
  role!: Role;

  @IsString()
  key!: string;

  @IsEnum(PermissionLevel)
  level!: PermissionLevel;
}
