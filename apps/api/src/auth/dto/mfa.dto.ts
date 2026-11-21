import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';

/** The short-lived proof that the password step just passed. */
export class StepDto {
  @IsString()
  @MaxLength(2000)
  mfaToken!: string;
}

/** Six digits from the app, or a backup code ("ABCDE-FGHJK"). */
export class CodeDto {
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  code!: string;
}

export class StepCodeDto extends CodeDto {
  @IsString()
  @MaxLength(2000)
  mfaToken!: string;
}

export class PasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}

export class EnforcementDto {
  @IsBoolean()
  enforced!: boolean;
}
