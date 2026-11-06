// An in-memory stand-in for Netlify Blobs (same calls the people store makes). Test code only.
export function fakeStore() {
  const m = new Map();
  return {
    m,
    async get(key, opts) { if (!m.has(key)) return null; const v = m.get(key); return opts && opts.type === 'json' ? JSON.parse(v) : v; },
    async set(key, value, opts) { if (opts && opts.onlyIfNew && m.has(key)) return { modified: false }; m.set(key, String(value)); return { modified: true }; },
    async setJSON(key, value) { m.set(key, JSON.stringify(value)); return { modified: true }; },
    async delete(key) { m.delete(key); },
    async list({ prefix = '' } = {}) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}
