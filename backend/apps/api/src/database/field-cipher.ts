import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { parseKeys } from './field-keys.js';

export { parseKeys } from './field-keys.js';

/**
 * Application-level encryption for the most sensitive free text (journal notes and questions,
 * checklist notes, appointment notes and questions, birth-preference notes), on top of
 * encrypted storage. A database dump, a backup or a read-only SQL account shows ciphertext.
 *
 * AES-256-GCM, 96-bit random IV, 128-bit tag. The column name is authenticated data, so a
 * value copied into another column fails to decrypt.
 *
 * Stored form: `enc1.<keyId>.<iv base64url>.<ciphertext+tag base64url>`. Every value carries
 * its key id: rotation adds a key, makes it active, and runs `scripts/reencrypt-fields.mjs`.
 * Values written before encryption was enabled have no prefix and are read as plaintext until
 * that script rewrites them.
 */
export const ENCRYPTED_PREFIX = 'enc1.';

/** Column names used as authenticated data. Changing one makes existing values unreadable. */
export const ENCRYPTED_COLUMNS = {
  dailyLogNote: 'daily_logs.note',
  dailyLogQuestions: 'daily_logs.questions',
  taskNote: 'user_task_progress.note',
  appointmentNotes: 'appointments.notes',
  appointmentQuestions: 'appointments.questions',
  birthNotes: 'birth_preferences.notes',
} as const;
export type EncryptedColumn =
  (typeof ENCRYPTED_COLUMNS)[keyof typeof ENCRYPTED_COLUMNS];

export class FieldDecryptionError extends Error {
  constructor(column: string) {
    super(`Could not decrypt a value in ${column}`);
  }
}

export class FieldCipher {
  constructor(
    private readonly keys: Map<string, Buffer>,
    /** Null: encryption off (development/test without keys). Reads still decrypt. */
    readonly activeKeyId: string | null,
  ) {
    if (activeKeyId !== null && !keys.has(activeKeyId)) {
      throw new Error(
        'FIELD_ENCRYPTION_ACTIVE_KEY is not in FIELD_ENCRYPTION_KEYS',
      );
    }
  }

  get enabled(): boolean {
    return this.activeKeyId !== null;
  }

  encrypt<T extends string | null | undefined>(
    value: T,
    column: EncryptedColumn,
  ): T {
    if (value === null || value === undefined || !this.activeKeyId)
      return value;
    const key = this.keys.get(this.activeKeyId)!;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(column));
    const body = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
    return `${ENCRYPTED_PREFIX}${this.activeKeyId}.${iv.toString('base64url')}.${body.toString('base64url')}` as T;
  }

  decrypt<T extends string | null | undefined>(
    value: T,
    column: EncryptedColumn,
  ): T {
    if (
      value === null ||
      value === undefined ||
      !value.startsWith(ENCRYPTED_PREFIX)
    )
      return value;
    const [, keyId, iv64, body64, ...rest] = value.split('.');
    const key = this.keys.get(keyId);
    if (!key || rest.length || !iv64 || !body64)
      throw new FieldDecryptionError(column);
    try {
      const body = Buffer.from(body64, 'base64url');
      const decipher = createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(iv64, 'base64url'),
      );
      decipher.setAAD(Buffer.from(column));
      decipher.setAuthTag(body.subarray(body.length - 16));
      return Buffer.concat([
        decipher.update(body.subarray(0, body.length - 16)),
        decipher.final(),
      ]).toString('utf8') as T;
    } catch {
      throw new FieldDecryptionError(column);
    }
  }

  encryptList(values: string[], column: EncryptedColumn): string[] {
    return values.map((v) => this.encrypt(v, column));
  }

  decryptList(values: string[], column: EncryptedColumn): string[] {
    return values.map((v) => this.decrypt(v, column));
  }

  /** True when the value is plaintext or under a key other than the active one. */
  needsRewrite(value: string | null): boolean {
    if (value === null || !this.activeKeyId) return false;
    return !value.startsWith(`${ENCRYPTED_PREFIX}${this.activeKeyId}.`);
  }
}

/** The Nest provider: keys from FIELD_ENCRYPTION_KEYS, active key FIELD_ENCRYPTION_ACTIVE_KEY. */
@Injectable()
export class FieldCipherService extends FieldCipher {
  constructor(config: ConfigService<Env, true>) {
    const raw = config.get('FIELD_ENCRYPTION_KEYS', { infer: true }) ?? '';
    const active =
      config.get('FIELD_ENCRYPTION_ACTIVE_KEY', { infer: true }) ?? null;
    super(parseKeys(raw), active);
    if (!active) {
      new Logger('FieldCipher').warn(
        'Field encryption is off (no FIELD_ENCRYPTION_ACTIVE_KEY). Production refuses this.',
      );
    }
  }
}
