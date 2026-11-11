// Encrypts legacy plaintext and moves every encrypted column to FIELD_ENCRYPTION_ACTIVE_KEY.
// Run after enabling field encryption or adding a new active key (keep the old key listed in
// FIELD_ENCRYPTION_KEYS until this finishes). Idempotent; safe to re-run. Build first
// (`pnpm build`). Prints counts only, never values.
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';

const { AppModule } = await import('../dist/app.module.js');
const { FieldCipherService } = await import('../dist/database/field-cipher.js');
const { PrismaService } = await import('../dist/database/prisma.service.js');
const { reencryptAll } = await import('../dist/database/field-reencrypt.js');

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error'],
});
try {
  const result = await reencryptAll(
    app.get(PrismaService),
    app.get(FieldCipherService),
  );
  console.log('Re-encrypted rows:', JSON.stringify(result));
} finally {
  await app.close();
}
