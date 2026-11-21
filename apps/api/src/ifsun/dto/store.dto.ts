import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class StoreDto {
  @IsUUID()
  signatureId!: string;

  /** Non-serialized items only; omitted stores everything the signature still covers. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CloseIfsunDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
