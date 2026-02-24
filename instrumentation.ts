export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const g = globalThis as Record<string, unknown>;

    const isBroken = (key: string) =>
      typeof g[key] !== 'undefined' &&
      typeof (g[key] as Record<string, unknown>)['getItem'] !== 'function';

    const makeStorage = () => {
      const store = new Map<string, string>();
      return {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, String(value)),
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear(),
        get length() { return store.size; },
        key: (index: number) => [...store.keys()][index] ?? null,
      };
    };

    if (isBroken('localStorage')) g['localStorage'] = makeStorage();
    if (isBroken('sessionStorage')) g['sessionStorage'] = makeStorage();
  }
}
