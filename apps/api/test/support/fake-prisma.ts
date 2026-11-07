import { vi } from 'vitest';

type Fn = ReturnType<typeof vi.fn>;
type Model = Record<string, Fn>;

/**
 * A minimal stand-in for PrismaService in unit tests of services: every model method is a
 * vi.fn() returning an empty result unless a test overrides it. Business logic under test is
 * never mocked; only the database is.
 */
export function fakePrisma(overrides: Record<string, Partial<Model>> = {}) {
  const models = new Map<string, Model>();
  const model = (name: string): Model => {
    if (!models.has(name)) {
      models.set(name, {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(null),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn((args: { data: object }) =>
          Promise.resolve({ id: `${name}-1`, ...args.data }),
        ),
        update: vi.fn((args: { data: object }) =>
          Promise.resolve({ id: `${name}-1`, ...args.data }),
        ),
        ...(overrides[name] as Model | undefined),
      });
    }
    return models.get(name)!;
  };
  const prisma: Record<string | symbol, unknown> = {
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(proxy)),
  };
  const proxy: unknown = new Proxy(prisma, {
    get: (target, prop) =>
      prop in target ? target[prop] : model(String(prop)),
  });
  return { prisma: proxy as never, model };
}
