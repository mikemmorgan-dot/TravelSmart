// cache.js — two-tier (memory + disk) TTL cache. Wrap the expensive data calls with it.
// Disk persistence means a nightly pre-fetch survives process restarts.
const fs = require("fs");
const path = require("path");

class Cache {
  constructor(file = path.join(__dirname, ".cache.json")) {
    this.file = file;
    this.mem = new Map();
    try { this.mem = new Map(Object.entries(JSON.parse(fs.readFileSync(file, "utf8")))); }
    catch { /* fresh cache */ }
  }
  _flush() {
    try { fs.writeFileSync(this.file, JSON.stringify(Object.fromEntries(this.mem))); }
    catch (e) { console.warn("cache write failed:", e.message); }
  }
  get(key) {
    const e = this.mem.get(key);
    if (!e) return { hit: false };
    if (Date.now() > e.expiresAt) { this.mem.delete(key); return { hit: false, expired: true }; }
    return { hit: true, value: e.value, ageMs: Date.now() - e.storedAt, expiresAt: e.expiresAt };
  }
  set(key, value, ttlMs) {
    this.mem.set(key, { value, storedAt: Date.now(), expiresAt: Date.now() + ttlMs });
    this._flush();
  }
}

// Wrap an async fn so identical calls hit cache. keyFn builds a stable key from args.
// Returns { value, cache: { hit, ageMs } } so callers can surface freshness honestly.
function wrap(fn, { cache, keyFn, ttlMs, label = "" }) {
  return async (...args) => {
    const key = `${label}:${keyFn(...args)}`;
    const c = cache.get(key);
    if (c.hit) return { value: c.value, cache: { hit: true, ageMs: c.ageMs } };
    const value = await fn(...args);
    cache.set(key, value, ttlMs);
    return { value, cache: { hit: false, ageMs: 0 } };
  };
}

// Sensible TTLs: cash fares move fast; award availability is already cached upstream.
const TTL = { cash: 8 * 3600e3, awards: 6 * 3600e3 };

module.exports = { Cache, wrap, TTL };
