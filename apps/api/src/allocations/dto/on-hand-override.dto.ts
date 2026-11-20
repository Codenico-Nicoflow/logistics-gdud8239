import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min, ValidateIf } from 'class-validator';

export class SetOnHandOverrideDto {
  @IsString()
  itemId!: string;

  /** `null` clears the override, reverting to the item's real בפועל. */
  @ValidateIf((o: SetOnHandOverrideDto) => o.onHand !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  onHand!: number | null;
}
