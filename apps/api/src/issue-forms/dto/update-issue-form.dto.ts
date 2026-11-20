import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Header-only edit — see the WHY in IssueFormsService#update. */
export class UpdateIssueFormDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  receiptNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
