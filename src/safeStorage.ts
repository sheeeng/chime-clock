/**
 * A storage that cannot throw.
 *
 * `window.localStorage` is not a safe property to touch. Reading it raises in
 * a blocked third party frame, reading a key raises when a browser refuses
 * storage to a private window, and writing raises once a quota is full. A
 * saved preference is never worth a blank page or a dead click handler, so
 * every failure here degrades to state that lives only as long as this page
 * session.
 */
export type SafeStorage = Pick<Storage, 'getItem' | 'setItem'>;

type StorageSource = () => Storage | null;

export function createSafeStorage(
  source: StorageSource = readLocalStorage,
): SafeStorage {
  // Holds only the keys whose write the browser refused. A key the browser
  // accepted is always read back from the browser, so what this page session
  // reports and what the next page load reports cannot drift apart.
  const sessionValues = new Map<string, string>();

  return {
    getItem(key) {
      const sessionValue = sessionValues.get(key);

      if (sessionValue !== undefined) {
        return sessionValue;
      }

      try {
        return source()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },

    setItem(key, value) {
      try {
        const storage = source();

        if (storage) {
          storage.setItem(key, value);
          sessionValues.delete(key);
          return;
        }
      } catch {
        // Fall through to session only state.
      }

      sessionValues.set(key, value);
    },
  };
}

function readLocalStorage(): Storage | null {
  return window.localStorage;
}
