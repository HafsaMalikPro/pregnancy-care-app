// Writes the OpenAPI document to docs/api/openapi.json from the built app (run `pnpm build`
// first). The http-contract e2e test fails if the served document and this file drift.
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';

process.env.NODE_ENV ??= 'development';
// Document the full API: password reset and email verification are served only with an email
// provider. `log` sends nothing anywhere; it only enables those routes for the export.
if (!process.env.EMAIL_PROVIDER || process.env.EMAIL_PROVIDER === 'none') {
  process.env.EMAIL_PROVIDER = 'log';
}
// Imported after the env above is set: the app reads its config when first loaded.
const { AppModule } = await import('../dist/app.module.js');
const { buildOpenApiDocument } = await import('../dist/openapi.js');
const { setupApp } = await import('../dist/setup-app.js');
const out = new URL('../../../docs/api/openapi.json', import.meta.url);

const app = await NestFactory.create(AppModule, { logger: false });
await setupApp(app);
await app.init();
const document = await buildOpenApiDocument(app);
await app.close();

mkdirSync(new URL('.', out), { recursive: true });
writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`);
console.log(
  `Wrote ${out.pathname} (${Object.keys(document.paths).length} paths)`,
);
