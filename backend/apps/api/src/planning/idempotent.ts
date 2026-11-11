/**
 * Returns the existing row, or creates it. If a concurrent request created it first (unique
 * violation), returns that row instead, so repeated requests never duplicate or fail.
 */
export async function findOrCreate<T>(
  find: () => Promise<T | null>,
  create: () => Promise<T>,
): Promise<T> {
  const existing = await find();
  if (existing) return existing;
  try {
    return await create();
  } catch (error) {
    if ((error as { code?: unknown }).code === 'P2002') {
      const raced = await find();
      if (raced) return raced;
    }
    throw error;
  }
}
