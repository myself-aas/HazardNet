// Minimal in-memory AsyncStorage mock for jsdom tests.
const store = new Map();
module.exports = {
  __INTERNAL_STORE__: store,
  default: {
    getItem: jest.fn((k) => Promise.resolve(store.has(k) ? store.get(k) : null)),
    setItem: jest.fn((k, v) => { store.set(k, String(v)); return Promise.resolve(); }),
    removeItem: jest.fn((k) => { store.delete(k); return Promise.resolve(); }),
    multiGet: jest.fn((keys) => Promise.resolve(keys.map((k) => [k, store.has(k) ? store.get(k) : null]))),
    multiSet: jest.fn((pairs) => { pairs.forEach(([k, v]) => store.set(k, String(v))); return Promise.resolve(); }),
    multiRemove: jest.fn((keys) => { keys.forEach((k) => store.delete(k)); return Promise.resolve(); }),
    getAllKeys: jest.fn(() => Promise.resolve(Array.from(store.keys()))),
    clear: jest.fn(() => { store.clear(); return Promise.resolve(); }),
  },
};
