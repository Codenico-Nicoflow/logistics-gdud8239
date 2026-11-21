import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const PNG = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

export class StoreDto {
  @IsUUID()
  signatureId!: string;

  /** Non-serialized items only; omitted stores everything the signature still covers. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  quantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  /** The depositor's drawn signature. */
  @IsString()
  @Matches(PNG, { message: 'חתימה לא תקינה' })
  @MaxLength(400_000, { message: 'החתימה גדולה מדי' })
  signatureImage!: string;

  /** Only when someone other than the soldier hands it in. */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  signerName?: string;
}

export class CloseIfsunDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CollectDto extends CloseIfsunDto {
  /** Whoever takes the item out signs — the soldier, or the person collecting for him. */
  @IsString()
  @Matches(PNG, { message: 'חתימה לא תקינה' })
  @MaxLength(400_000, { message: 'החתימה גדולה מדי' })
  signatureImage!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  signerName?: string;
}
