import { INestApplication, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import { toNodeHandler } from 'better-auth/node';
import type { Express, NextFunction, Request, Response } from 'express';
import { AUTH, type Auth } from './auth/auth.provider.js';
import { AUTH_BASE_PATH, BLOCKED_AUTH_PREFIXES } from './auth/better-auth.js';
import { clientIpMiddleware } from './auth/client-ip.js';
import { jsonOnlyMiddleware } from './common/middleware/content-type.middleware.js';
import { csrfMiddleware } from './common/middleware/csrf.middleware.js';
import { requestIdMiddleware } from './common/middleware/request-id.middleware.js';
import { createValidationPipe } from './common/validation.js';
import type { Env } from './config/env.js';
import { buildOpenApiDocument } from './openapi.js';

/** Shared by main.ts and e2e tests so both run the same global behaviour. */
export async function setupApp(app: INestApplication): Promise<void> {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  const express = app.getHttpAdapter().getInstance() as Express;
  express.disable('x-powered-by');
  // Which proxy hops may set X-Forwarded-For (never "any"). req.ip, the Nest throttler and
  // Better Auth's limits all use the address this resolves.
  express.set('trust proxy', config.get('TRUST_PROXY', { infer: true }));
  // Registered before init() adds the body parser, so parser errors get a request id too.
  app.use(requestIdMiddleware);
  app.use(clientIpMiddleware);
  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
    credentials: true,
    exposedHeaders: ['x-request-id', 'set-auth-token'],
  });
  app.use(csrfMiddleware(config.get('CORS_ORIGINS', { infer: true })));
  app.use(jsonOnlyMiddleware);
  // Parameterised Better Auth routes that disabledPaths cannot match exactly.
  express.use(
    AUTH_BASE_PATH,
    (req: Request, res: Response, next: NextFunction) => {
      if (!BLOCKED_AUTH_PREFIXES.some((p) => req.path.startsWith(p)))
        return next();
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Not found.',
          requestId: req.requestId ?? 'unknown',
        },
      });
    },
  );
  // Better Auth reads the raw body itself, so it must run before Nest's JSON parser.
  express.all(`${AUTH_BASE_PATH}/*splat`, toNodeHandler(app.get<Auth>(AUTH)));
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(createValidationPipe());
  app.enableShutdownHooks();

  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    SwaggerModule.setup('docs', app, await buildOpenApiDocument(app), {
      jsonDocumentUrl: 'docs/openapi.json',
    });
  }
}
