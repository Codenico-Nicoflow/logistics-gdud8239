import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** A unit in repair that came back as a different one. */
export class ReplaceRepairedDto {
  /** The מסד that went out. Optional for a bulk unit that never had one. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  oldSerial?: string;

  /** The מסד of the unit that came back instead. */
  @IsString()
  @MinLength(1, { message: 'נדרש מסד חדש' })
  @MaxLength(60)
  newSerial!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}
