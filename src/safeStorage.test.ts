import { describe, expect, it, vi } from 'vitest';
import { createSafeStorage } from './safeStorage';

function createMemoryStorage() {
  const values = new Map<string, string>();

  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  } as unknown as Storage;
}

function createThrowingStorage() {
  return {
    getItem: vi.fn(() => {
      throw new Error('Storage is blocked.');
    }),
    setItem: vi.fn(() => {
      throw new Error('The quota is full.');
    }),
  } as unknown as Storage;
}

describe('createSafeStorage', () => {
  it('reads and writes through to the browser storage', () => {
    const browserStorage = createMemoryStorage();
    const storage = createSafeStorage(() => browserStorage);

    storage.setItem('key', 'value');

    expect(storage.getItem('key')).toBe('value');
    expect(browserStorage.setItem).toHaveBeenCalledWith('key', 'value');
  });

  it('returns null rather than raising when the read fails', () => {
    const storage = createSafeStorage(createThrowingStorage);

    expect(() => storage.getItem('key')).not.toThrow();
    expect(storage.getItem('key')).toBeNull();
  });

  it('returns null rather than raising when the storage is unreachable', () => {
    const storage = createSafeStorage(() => {
      throw new Error('Storage is blocked.');
    });

    expect(storage.getItem('key')).toBeNull();
    expect(() => storage.setItem('key', 'value')).not.toThrow();
  });

  it('keeps a refused write for the rest of the page session', () => {
    const storage = createSafeStorage(createThrowingStorage);

    expect(() => storage.setItem('key', 'value')).not.toThrow();
    expect(storage.getItem('key')).toBe('value');
  });

  it('keeps a value the browser cannot hold at all', () => {
    const storage = createSafeStorage(() => null);

    storage.setItem('key', 'value');

    expect(storage.getItem('key')).toBe('value');
  });

  it('hands a key back to the browser once a write succeeds', () => {
    const browserStorage = createMemoryStorage();
    let refuseWrites = true;

    const storage = createSafeStorage(() =>
      refuseWrites ? createThrowingStorage() : browserStorage,
    );

    storage.setItem('key', 'session');
    expect(storage.getItem('key')).toBe('session');

    refuseWrites = false;
    storage.setItem('key', 'stored');

    expect(storage.getItem('key')).toBe('stored');
    expect(browserStorage.getItem).toHaveBeenCalledWith('key');
  });
});
