// Writes the OpenAPI document to docs/api/openapi.json from the built app (run `pnpm build`
// first). The http-contract e2e test fails if the served document and this file drift.
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { buildOpenApiDocument } from '../dist/openapi.js';
import { setupApp } from '../dist/setup-app.js';

process.env.NODE_ENV ??= 'development';
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
