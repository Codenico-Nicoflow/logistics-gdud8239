import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * One row of a ימ"ח intake sheet, already resolved to a real catalog item —
 * the review grid is what turns a loose PDF name into this `itemId`, so the
 * backend never has to guess a match.
 */
export class IntakeRowDto {
  @IsUUID('4')
  itemId!: string;

  /** `serial`: one new מסד to register. `bulk`: add `quantity` to the item's
   *  authorizedQty with no individual instance — for items like M5 or ציין
   *  לייזר that the ימ"ח sheet only ever counts, never lists by serial. */
  @IsIn(['serial', 'bulk'])
  kind!: 'serial' | 'bulk';

  @IsOptional()
  @IsString()
  @MaxLength(40)
  serial?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity?: number;

  /** Free text — e.g. "שייך לחטיבה" when the item didn't come from ימ״ח. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class SubmitIntakeDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'אין שורות לקליטה' })
  @ArrayMaxSize(2000, { message: 'יותר מדי שורות בקליטה אחת' })
  @ValidateNested({ each: true })
  @Type(() => IntakeRowDto)
  rows!: IntakeRowDto[];
}
