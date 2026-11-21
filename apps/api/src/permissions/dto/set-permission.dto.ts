import { IsEnum, IsIn } from 'class-validator';
import { PermissionLevel, Role } from '@prisma/client';
import { PERMISSION_KEYS } from '../permissions.service';

export class SetPermissionDto {
  @IsEnum(Role)
  role!: Role;

  /** Only keys the app actually checks; anything else would be a silent no-op row. */
  @IsIn([...PERMISSION_KEYS], { message: 'מפתח הרשאה לא חוקי' })
  key!: string;

  @IsEnum(PermissionLevel)
  level!: PermissionLevel;
}
