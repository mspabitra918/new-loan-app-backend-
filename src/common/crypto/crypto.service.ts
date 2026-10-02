import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Field-level encryption for SSN, driver's licence number, routing number and
 * account number (GLBA Safeguards Rule).
 *
 * Design notes:
 *  - AES-256-GCM, random 12-byte IV per value, auth tag stored with the payload.
 *  - Ciphertext is prefixed with the key id so keys can be rotated without a
 *    bulk re-encrypt: `v1:<iv b64>:<tag b64>:<ciphertext b64>`.
 *  - Keys come from env in dev and from KMS/Secrets Manager in production.
 *    They are deliberately NOT stored in the application database.
 *  - Blind indexes (HMAC-SHA256 with a separate key) let us do equality
 *    lookups - SSN dedupe - without ever decrypting or storing cleartext.
 */
@Injectable()
export class CryptoService implements OnModuleInit {
  private readonly logger = new Logger(CryptoService.name);
  private keys = new Map<string, Buffer>();
  private activeKeyId: string;
  private blindIndexKey: Buffer;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const raw = this.config.get<Record<string, string>>('crypto.keys') || {};
    this.activeKeyId = this.config.get<string>('crypto.activeKeyId') || 'v1';

    for (const [id, value] of Object.entries(raw)) {
      const key = this.decodeKey(value);
      if (key) this.keys.set(id, key);
    }

    if (!this.keys.has(this.activeKeyId)) {
      if (this.config.get('env') === 'production') {
        throw new Error(
          `Encryption key "${this.activeKeyId}" is missing. Refusing to start in production.`,
        );
      }
      // Dev convenience only: an ephemeral key so the app boots before keygen.
      this.logger.warn(
        `No valid ENCRYPTION_KEY_${this.activeKeyId.toUpperCase()} found - generating an ` +
          `EPHEMERAL dev key. Encrypted data will be unreadable after restart.`,
      );
      this.keys.set(this.activeKeyId, crypto.randomBytes(32));
    }

    const bi = this.decodeKey(this.config.get<string>('crypto.blindIndexKey'));
    if (!bi) {
      if (this.config.get('env') === 'production') {
        throw new Error('BLIND_INDEX_KEY is missing. Refusing to start in production.');
      }
      this.logger.warn('No valid BLIND_INDEX_KEY - using an ephemeral dev key.');
      this.blindIndexKey = crypto.randomBytes(32);
    } else {
      this.blindIndexKey = bi;
    }
  }

  private decodeKey(value?: string): Buffer | null {
    if (!value || value.startsWith('CHANGE_ME')) return null;
    try {
      const buf = Buffer.from(value, 'base64');
      return buf.length === 32 ? buf : null;
    } catch {
      return null;
    }
  }

  /** Encrypt a sensitive value. Returns null for empty input. */
  encrypt(plaintext: string | null | undefined): string | null {
    if (plaintext == null || plaintext === '') return null;
    const key = this.keys.get(this.activeKeyId);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [this.activeKeyId, iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
  }

  /** Decrypt. Only ever called at the moment of a bureau pull or ACH origination. */
  decrypt(payload: string | null | undefined): string | null {
    if (!payload) return null;
    const parts = payload.split(':');
    if (parts.length !== 4) return null;
    const [keyId, ivB64, tagB64, dataB64] = parts;
    const key = this.keys.get(keyId);
    if (!key) {
      this.logger.error(`Ciphertext references unknown key id "${keyId}".`);
      return null;
    }
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
      decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(dataB64, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch (err) {
      this.logger.error('Decryption failed (auth tag mismatch or corrupt payload).');
      return null;
    }
  }

  /**
   * Deterministic HMAC used purely as a lookup key (SSN dedupe at Step 2).
   * Not reversible, and keyed so a database leak alone cannot be brute-forced
   * against the 10^9 SSN space.
   */
  blindIndex(value: string | null | undefined): string | null {
    if (!value) return null;
    const normalised = String(value).replace(/\D/g, '');
    if (!normalised) return null;
    return crypto.createHmac('sha256', this.blindIndexKey).update(normalised).digest('hex');
  }

  /** Non-keyed hash for consent text versioning (no secrecy requirement). */
  sha256(value: string): string {
    return crypto.createHash('sha256').update(value ?? '').digest('hex');
  }

  /**
   * Opaque surrogate for SSN / account number. The token is what the rest of
   * the system passes around; cleartext is retrieved only at point of use.
   */
  newToken(prefix: string): string {
    return `${prefix}_${crypto.randomBytes(16).toString('hex')}`;
  }

  /** URL-safe random token for resume links. */
  randomToken(bytes = 32): string {
    return crypto.randomBytes(bytes).toString('base64url');
  }

  timingSafeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a ?? '');
    const bufB = Buffer.from(b ?? '');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }
}
