import { Type } from 'class-transformer';
import { IsInt, IsString, Min } from 'class-validator';

/** One cell of the company commander's per-soldier breakdown. */
export class SetSoldierAllocationDto {
  @IsString()
  itemId!: string;

  @IsString()
  soldierId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity!: number;
}
