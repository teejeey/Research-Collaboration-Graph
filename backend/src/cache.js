// Keep recent searches in memory so we do not ask PubMed for the same data again.
export function createCache({ ttl = 30 * 60 * 1000, maxEntries = 50, now = Date.now } = {}) {
  const entries = new Map();

  // Reuse a saved search, or let one request load it for everyone waiting.
  return async function remember(key, load) {
    for (const [oldKey, entry] of entries) {
      if (entry.expires <= now()) entries.delete(oldKey);
    }

    const existing = entries.get(key);
    if (existing) return { value: await existing.promise, cached: true };

    // Make room by removing an older completed search, not one still loading.
    if (entries.size >= maxEntries) {
      const oldest = [...entries].find(([, entry]) => entry.expires !== Infinity);
      if (oldest) entries.delete(oldest[0]);
      else throw new Error("Search queue is full.");
    }

    const entry = { expires: Infinity };

    // Start the expiry clock when the data arrives. Failed searches can be retried.
    entry.promise = Promise.resolve().then(load).then((value) => {
      entry.expires = now() + ttl;
      return value;
    }).catch((error) => {
      entries.delete(key);
      throw error;
    });

    entries.set(key, entry);

    return { value: await entry.promise, cached: false };
  };
}
