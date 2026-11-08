/** Parses `id:base64key,id2:base64key`. Each key must be exactly 32 bytes. */
export function parseKeys(raw: string): Map<string, Buffer> {
  const keys = new Map<string, Buffer>();
  for (const entry of raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const [id, value, ...rest] = entry.split(':');
    if (rest.length || !id || !/^[a-z0-9]{1,16}$/.test(id) || !value) {
      throw new Error(
        'FIELD_ENCRYPTION_KEYS entries must be "<id>:<base64 key>"',
      );
    }
    const key = Buffer.from(value, 'base64');
    if (key.length !== 32)
      throw new Error(`FIELD_ENCRYPTION_KEYS key ${id} is not 32 bytes`);
    if (keys.has(id))
      throw new Error(`FIELD_ENCRYPTION_KEYS repeats key ${id}`);
    keys.set(id, key);
  }
  return keys;
}
