import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class IssueFormLineDto {
  @IsString()
  itemId!: string;

  /** Required for an item that takes a מסד; rejected for one that does not. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  serial?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'כמות חייבת להיות לפחות 1' })
  quantity!: number;

  /** The `הערות` column the paper form keeps per line. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  lineNotes?: string;
}

export class CreateIssueFormDto {
  @IsString()
  soldierId!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'יש לבחור לפחות פריט אחד' })
  @ValidateNested({ each: true })
  @Type(() => IssueFormLineDto)
  lines!: IssueFormLineDto[];

  /**
   * The signature drawn on screen, as a PNG data URL. Checked for shape here
   * so a malformed or oversized value is refused before it reaches the row
   * that is supposed to be evidence.
   */
  @IsString()
  @Matches(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, {
    message: 'חתימה לא תקינה',
  })
  @MaxLength(400_000, { message: 'החתימה גדולה מדי' })
  signatureImage!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  /** `מס קבלה` in the form's header box. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  receiptNo?: string;
}
