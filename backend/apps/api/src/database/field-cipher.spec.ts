import { randomBytes } from 'node:crypto';
import {
  ENCRYPTED_COLUMNS as C,
  FieldCipher,
  FieldDecryptionError,
  parseKeys,
} from './field-cipher.js';

const k = (id: string) => `${id}:${randomBytes(32).toString('base64')}`;

describe('FieldCipher', () => {
  const keys = parseKeys(`${k('k1')},${k('k2')}`);
  const v1 = new FieldCipher(keys, 'k1');
  const v2 = new FieldCipher(keys, 'k2');

  it('encrypts with a fresh IV and the key id, and decrypts back', () => {
    const a = v1.encrypt('Ask about iron levels', C.dailyLogNote);
    const b = v1.encrypt('Ask about iron levels', C.dailyLogNote);
    expect(a).toMatch(/^enc1\.k1\.[\w-]{16}\.[\w-]+$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain('iron');
    expect(v1.decrypt(a, C.dailyLogNote)).toBe('Ask about iron levels');
    expect(v1.encrypt(null, C.dailyLogNote)).toBeNull();
    expect(v1.encrypt(undefined, C.dailyLogNote)).toBeUndefined();
  });

  it('decrypts values under an older key after rotation and flags them for rewrite', () => {
    const old = v1.encrypt('before rotation', C.appointmentNotes);
    expect(v2.decrypt(old, C.appointmentNotes)).toBe('before rotation');
    expect(v2.needsRewrite(old)).toBe(true);
    expect(v2.needsRewrite(v2.encrypt('new', C.appointmentNotes))).toBe(false);
    expect(v2.needsRewrite('legacy plaintext')).toBe(true);
    expect(v2.decrypt('legacy plaintext', C.appointmentNotes)).toBe(
      'legacy plaintext',
    );
  });

  it('refuses tampered values, values from another column and unknown keys', () => {
    const value = v1.encrypt('private', C.dailyLogNote);
    const [prefix, id, iv, body] = value.split('.');
    const flipped = `${prefix}.${id}.${iv}.${body.slice(0, -2)}${body.at(-2) === 'A' ? 'B' : 'A'}${body.at(-1)}`;
    expect(() => v1.decrypt(flipped, C.dailyLogNote)).toThrow(
      FieldDecryptionError,
    );
    expect(() => v1.decrypt(value, C.appointmentNotes)).toThrow(
      FieldDecryptionError,
    );
    const stranger = new FieldCipher(parseKeys(k('k1')), 'k1');
    expect(() => stranger.decrypt(value, C.dailyLogNote)).toThrow(
      FieldDecryptionError,
    );
    expect(() => new FieldCipher(keys, 'k9')).toThrow();
  });

  it('validates the key list', () => {
    expect(() => parseKeys('k1:short')).toThrow(/32 bytes/);
    expect(() => parseKeys(`${k('k1')},${k('k1')}`)).toThrow(/repeats/);
    expect(() => parseKeys('no-colon')).toThrow();
    expect(parseKeys('').size).toBe(0);
  });

  it('is a no-op for writes when off, but still reads encrypted values it has keys for', () => {
    const off = new FieldCipher(keys, null);
    expect(off.enabled).toBe(false);
    expect(off.encrypt('plain', C.taskNote)).toBe('plain');
    expect(off.decrypt(v1.encrypt('x', C.taskNote), C.taskNote)).toBe('x');
  });
});
