import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  type OpenAPIObject,
  SwaggerModule,
} from '@nestjs/swagger';
import { AUTH, type Auth } from './auth/auth.provider.js';
import { AUTH_BASE_PATH } from './auth/better-auth.js';
import { ApiErrorDto } from './common/dto/api-error.dto.js';
import { SECURITY } from './common/swagger.js';

/**
 * Swagger UI pre-fills optional fields with "string", and Better Auth rejects
 * `callbackURL: "string"` (403 INVALID_CALLBACK_URL). Working examples avoid that trap.
 */
const AUTH_REQUEST_EXAMPLES: Record<string, object> = {
  '/sign-up/email': {
    name: 'Test Person',
    email: 'test@example.com',
    password: 'at-least-12-characters',
  },
  '/sign-in/email': {
    email: 'test@example.com',
    password: 'at-least-12-characters',
  },
};

/** Better Auth endpoints callable without a session. */
const PUBLIC_AUTH_PATHS = new Set([
  '/sign-up/email',
  '/sign-in/email',
  '/ok',
  '/error',
  // Called mid sign-in with Better Auth's short-lived two-factor cookie, not a session.
  '/two-factor/verify-totp',
  '/two-factor/verify-backup-code',
]);

const DESCRIPTION = `
API for web, admin and mobile clients. Every route is versioned under \`/v1\`.

**Authentication** (every route needs one unless marked public):

- *Registered users*: sign up / sign in through Better Auth under \`/v1/auth\` (see the
  \`auth\` tag). Browsers use the \`better-auth.session_token\` cookie; mobile apps send the
  session token as \`Authorization: Bearer <token>\` (returned in the \`set-auth-token\`
  response header on sign-in).
- *Anonymous use*: \`POST /v1/anonymous-sessions\` returns a secret once; send it as
  \`Authorization: Anonymous <secret>\`.
- *Staff* routes (\`/v1/admin\`) need a staff role and two-factor authentication.

**Consent:** saving cycles, daily logs or task notes requires a granted
\`health_data_processing\` consent (403 \`CONSENT_REQUIRED\` otherwise).

**Ownership:** records belong to the caller; another owner's id returns 404.

**Errors:** every non-2xx response except readiness 503 uses the \`ApiError\` schema. The
\`requestId\` field matches the \`x-request-id\` response header. Unknown routes and methods
return 404 \`NOT_FOUND\`; malformed JSON bodies 400 \`VALIDATION_ERROR\`; bodies over 100 kB
413 \`PAYLOAD_TOO_LARGE\`; requests over the rate limit 429 \`RATE_LIMITED\`; unexpected
failures 500 \`INTERNAL_ERROR\` with a generic message.

**Pagination:** list endpoints take \`limit\` (1-100, default 20) and \`offset\` and return
\`{ items, page: { limit, offset, total } }\`.

**Rate limiting:** 120 requests/minute per client IP by default; tighter on anonymous session
creation, linking, export and deletion. Health endpoints are exempt. Better Auth applies its
own limits to sign-in and sign-up.
`.trim();

/**
 * Single source for the served document and the exported docs/api/openapi.json: the Nest
 * routes plus the Better Auth routes that are enabled (DISABLED_AUTH_PATHS are left out).
 */
export async function buildOpenApiDocument(
  app: INestApplication,
): Promise<OpenAPIObject> {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Preconception Platform API')
      .setDescription(DESCRIPTION)
      .setVersion('1')
      .addTag('health', 'Liveness and readiness probes')
      .addTag('auth', 'Better Auth: sign-up, sign-in, sessions, two-factor')
      .addTag('identity', 'Anonymous sessions and the current caller')
      .addTag('profile')
      .addTag('consent')
      .addTag('pregnancy', 'Dating, current week, timeline and week guides')
      .addTag('cycles', 'Period history and next-period estimate')
      .addTag('daily-logs', 'Symptoms and notes per day')
      .addTag('readiness', 'Preparation plan')
      .addTag('content', 'Clinically reviewed articles')
      .addTag('reminders')
      .addTag('entitlements')
      .addTag('privacy', 'Export and account deletion')
      .addTag('admin', 'Staff portal: content workflow, users, audit')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          description: 'Better Auth session token',
        },
        SECURITY.bearer,
      )
      .addCookieAuth(
        'better-auth.session_token',
        {
          type: 'apiKey',
          in: 'cookie',
          description: 'Better Auth session cookie (web)',
        },
        SECURITY.cookie,
      )
      .addApiKey(
        {
          type: 'apiKey',
          in: 'header',
          name: 'Authorization',
          description: 'Anonymous session: `Anonymous <secret>`',
        },
        SECURITY.anonymous,
      )
      .build(),
    { extraModels: [ApiErrorDto] },
  );
  const authSchema = await app.get<Auth>(AUTH).api.generateOpenAPISchema();
  return mergeAuthSchema(document, authSchema as unknown as AuthOpenApi);
}

/**
 * Operations Better Auth's schema generator lists but the mounted handler does not serve:
 * get-session answers GET only (POST returns 405). A runtime e2e test probes every documented
 * auth operation, so a new mismatch fails CI.
 */
const UNSERVED_AUTH_OPERATIONS = new Set(['post /get-session']);

interface AuthOpenApi {
  paths: Record<string, Record<string, Record<string, unknown>>>;
  components?: { schemas?: Record<string, unknown> };
}

function mergeAuthSchema(
  document: OpenAPIObject,
  auth: AuthOpenApi,
): OpenAPIObject {
  const sessionSecurity = [
    { [SECURITY.bearer]: [] },
    { [SECURITY.cookie]: [] },
  ];
  for (const [path, ops] of Object.entries(auth.paths)) {
    const merged: Record<string, unknown> = {};
    for (const [method, op] of Object.entries(ops)) {
      if (UNSERVED_AUTH_OPERATIONS.has(`${method} ${path}`)) continue;
      merged[method] = {
        ...withExample(toOpenApi30(op), AUTH_REQUEST_EXAMPLES[path]),
        tags: ['auth'],
        operationId: `auth_${typeof op.operationId === 'string' ? op.operationId : `${method}${path}`}`,
        security: PUBLIC_AUTH_PATHS.has(path) ? [] : sessionSecurity,
      };
    }
    document.paths[`${AUTH_BASE_PATH}${path}`] = merged;
  }
  const schemas = (document.components ??= {}).schemas ?? {};
  for (const [name, schema] of Object.entries(auth.components?.schemas ?? {})) {
    if (schemas[name])
      throw new Error(`OpenAPI schema name collision: ${name}`);
    schemas[name] = toOpenApi30(schema) as never;
  }
  document.components.schemas = schemas;
  return document;
}

/** Better Auth emits OpenAPI 3.1; rewrite `type: [T, 'null']` to 3.0's `nullable: true`. */
function toOpenApi30<T>(value: T): T {
  if (Array.isArray(value)) return value.map(toOpenApi30) as T;
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = toOpenApi30(v);
  if (Array.isArray(out.type)) {
    const types = out.type as string[];
    const nonNull = types.filter((t) => t !== 'null');
    if (nonNull.length === 1) {
      out.type = nonNull[0];
      if (nonNull.length < types.length) out.nullable = true;
    }
  }
  return out as T;
}

function withExample(
  op: Record<string, unknown>,
  example: object | undefined,
): Record<string, unknown> {
  const json = (
    op.requestBody as
      { content?: { 'application/json'?: Record<string, unknown> } } | undefined
  )?.content?.['application/json'];
  if (example && json) json.example = example;
  return op;
}
