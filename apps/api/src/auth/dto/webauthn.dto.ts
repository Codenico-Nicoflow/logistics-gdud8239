import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/** The short-lived proof that the password step just passed. */
export class StepDto {
  @IsString()
  @MaxLength(2000)
  mfaToken!: string;
}

export class RegisterVerifyDto {
  /** Produced by the browser's `navigator.credentials.create()`; the library validates its shape. */
  @IsObject()
  response!: RegistrationResponseJSON;

  /** What the person calls the device ("הטלפון שלי"). */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  deviceName?: string;
}

export class RegisterVerifyWithStepDto extends RegisterVerifyDto {
  @IsString()
  @MaxLength(2000)
  mfaToken!: string;
}

export class AuthenticateVerifyDto extends StepDto {
  /** Produced by the browser's `navigator.credentials.get()`. */
  @IsObject()
  response!: AuthenticationResponseJSON;
}
