import { IsBoolean } from 'class-validator';

export class SetEnlistedDto {
  @IsBoolean() enlisted!: boolean;
}
