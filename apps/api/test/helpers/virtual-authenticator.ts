import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';

/**
 * A software passkey: a real P-256 key pair, real signatures, the same byte formats a phone or a
 * laptop produces. It lets the tests exercise the server's actual verification (challenge, origin,
 * relying-party id, signature, counter) instead of mocking it.
 */
const b64url = (b: Buffer): string => b.toString('base64url');
const sha256 = (b: Buffer | string): Buffer => createHash('sha256').update(b).digest();

/** Just enough CBOR for an attestation: ints, byte strings, text, and maps. */
function cbor(value: unknown): Buffer {
  const head = (major: number, n: number): Buffer => {
    if (n < 24) return Buffer.from([(major << 5) | n]);
    if (n < 256) return Buffer.from([(major << 5) | 24, n]);
    return Buffer.from([(major << 5) | 25, n >> 8, n & 0xff]);
  };
  if (typeof value === 'number') return value >= 0 ? head(0, value) : head(1, -1 - value);
  if (typeof value === 'string') {
    const t = Buffer.from(value, 'utf8');
    return Buffer.concat([head(3, t.length), t]);
  }
  if (Buffer.isBuffer(value)) return Buffer.concat([head(2, value.length), value]);
  if (value instanceof Map) {
    return Buffer.concat([head(5, value.size), ...[...value].flatMap(([k, v]) => [cbor(k), cbor(v)])]);
  }
  throw new Error(`cbor: unsupported ${typeof value}`);
}

export type Tamper = { origin?: string; rpId?: string; flags?: number; wrongKey?: boolean };

export class VirtualAuthenticator {
  readonly credentialId = randomBytes(32);
  private counter = 0;
  private readonly privateKey: KeyObject;
  private readonly x: Buffer;
  private readonly y: Buffer;

  constructor(
    private readonly rpId: string,
    private readonly origin: string,
  ) {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    this.privateKey = privateKey;
    const jwk = publicKey.export({ format: 'jwk' });
    this.x = Buffer.from(jwk.x as string, 'base64url');
    this.y = Buffer.from(jwk.y as string, 'base64url');
  }

  get id(): string {
    return b64url(this.credentialId);
  }

  register(options: PublicKeyCredentialCreationOptionsJSON, tamper: Tamper = {}): RegistrationResponseJSON {
    const clientDataJSON = Buffer.from(
      JSON.stringify({ type: 'webauthn.create', challenge: options.challenge, origin: tamper.origin ?? this.origin, crossOrigin: false }),
    );
    const cose = cbor(
      new Map<number, number | Buffer>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, this.x],
        [-3, this.y],
      ]),
    );
    const idLen = Buffer.alloc(2);
    idLen.writeUInt16BE(this.credentialId.length);
    const authData = Buffer.concat([
      sha256(tamper.rpId ?? this.rpId),
      Buffer.from([tamper.flags ?? 0x45]), // user present + user verified + attested credential data
      Buffer.alloc(4), // counter
      Buffer.alloc(16), // AAGUID
      idLen,
      this.credentialId,
      cose,
    ]);
    const attestationObject = cbor(new Map<string, unknown>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]));
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      response: { clientDataJSON: b64url(clientDataJSON), attestationObject: b64url(attestationObject), transports: ['internal'] },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    };
  }

  authenticate(options: PublicKeyCredentialRequestOptionsJSON, tamper: Tamper = {}): AuthenticationResponseJSON {
    this.counter += 1;
    const clientDataJSON = Buffer.from(
      JSON.stringify({ type: 'webauthn.get', challenge: options.challenge, origin: tamper.origin ?? this.origin, crossOrigin: false }),
    );
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(this.counter);
    const authData = Buffer.concat([sha256(tamper.rpId ?? this.rpId), Buffer.from([tamper.flags ?? 0x05]), counter]);
    const signer = tamper.wrongKey ? generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey : this.privateKey;
    const signature = sign('sha256', Buffer.concat([authData, sha256(clientDataJSON)]), signer);
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      response: {
        clientDataJSON: b64url(clientDataJSON),
        authenticatorData: b64url(authData),
        signature: b64url(signature),
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    };
  }
}
