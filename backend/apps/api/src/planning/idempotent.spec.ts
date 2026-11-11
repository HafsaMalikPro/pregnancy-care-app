import { findOrCreate } from './idempotent.js';

const unique = () => Object.assign(new Error('unique'), { code: 'P2002' });

describe('findOrCreate', () => {
  it('returns an existing row without creating', async () => {
    const create = vi.fn();
    await expect(
      findOrCreate(() => Promise.resolve('row'), create),
    ).resolves.toBe('row');
    expect(create).not.toHaveBeenCalled();
  });

  it('creates when nothing exists', async () => {
    await expect(
      findOrCreate(
        () => Promise.resolve(null),
        () => Promise.resolve('new'),
      ),
    ).resolves.toBe('new');
  });

  it('returns the row a concurrent request created first', async () => {
    const find = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('theirs');
    await expect(
      findOrCreate(find, () => Promise.reject(unique())),
    ).resolves.toBe('theirs');
    expect(find).toHaveBeenCalledTimes(2);
  });

  it('rethrows a unique violation when the row still cannot be found', async () => {
    const err = unique();
    await expect(
      findOrCreate(
        () => Promise.resolve(null),
        () => Promise.reject(err),
      ),
    ).rejects.toBe(err);
  });

  it('rethrows other errors without retrying the lookup', async () => {
    const find = vi.fn().mockResolvedValue(null);
    const err = new Error('db down');
    await expect(findOrCreate(find, () => Promise.reject(err))).rejects.toBe(
      err,
    );
    expect(find).toHaveBeenCalledTimes(1);
  });
});
