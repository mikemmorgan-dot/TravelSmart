// cache.js — two-tier (memory + disk) TTL cache. Wrap the expensive data calls with it.
// Disk persistence means a nightly pre-fetch survives process restarts.
const fs = require("fs");
const path = require("path");

// Bounded, restart-friendly cache. Render free tier has 512MB total, so:
//  - entries carry an approximate byte size; total is capped (oldest-read evicted first)
//  - expired entries are purged on a timer, not just on lucky re-reads
//  - disk flushes are debounced and skip oversized entries (huge flight lists are cheap
//    to re-fetch; persistence exists so small cash baselines survive restarts)
const MAX_ENTRIES = Number(process.env.CACHE_MAX_ENTRIES || 150);
const MAX_BYTES = Number(process.env.CACHE_MAX_BYTES || 30e6);       // ~30MB of cached JSON
const PERSIST_ENTRY_MAX = 200e3;                                     // skip persisting >200KB entries
const FLUSH_DEBOUNCE_MS = 5000;

class Cache {
  constructor(file = path.join(__dirname, ".cache.json")) {
    this.file = file;
    this.mem = new Map();
    this.bytes = 0;
    this._flushTimer = null;
    try {
      const loaded = Object.entries(JSON.parse(fs.readFileSync(file, "utf8")));
      for (const [k, e] of loaded) {
        e.size = e.size || JSON.stringify(e.value).length;
        this.mem.set(k, e); this.bytes += e.size;
      }
    } catch { /* fresh cache */ }
    // Purge expired entries even if nobody re-reads them.
    this._sweeper = setInterval(() => this._purgeExpired(), 10 * 60 * 1000);
    if (this._sweeper.unref) this._sweeper.unref();
  }
  _purgeExpired() {
    const now = Date.now();
    for (const [k, e] of this.mem) if (now > e.expiresAt) this._drop(k);
  }
  _drop(key) {
    const e = this.mem.get(key);
    if (e) { this.bytes -= e.size || 0; this.mem.delete(key); }
  }
  _evictUntilFits(incoming) {
    // Map iteration order = insertion order; get() re-inserts on hit, so the front is
    // the least-recently-used. Evict from the front until the new entry fits.
    for (const k of this.mem.keys()) {
      if (this.mem.size < MAX_ENTRIES && this.bytes + incoming <= MAX_BYTES) break;
      this._drop(k);
    }
  }
  _flush() {
    clearTimeout(this._flushTimer);
    this._flushTimer = setTimeout(() => {
      try {
        const persistable = {};
        for (const [k, e] of this.mem) if ((e.size || 0) <= PERSIST_ENTRY_MAX) persistable[k] = e;
        fs.writeFileSync(this.file, JSON.stringify(persistable));
      } catch (e) { console.warn("cache write failed:", e.message); }
    }, FLUSH_DEBOUNCE_MS);
    if (this._flushTimer.unref) this._flushTimer.unref();
  }
  get(key) {
    const e = this.mem.get(key);
    if (!e) return { hit: false };
    if (Date.now() > e.expiresAt) { this._drop(key); return { hit: false, expired: true }; }
    this.mem.delete(key); this.mem.set(key, e); // refresh LRU position
    return { hit: true, value: e.value, ageMs: Date.now() - e.storedAt, expiresAt: e.expiresAt };
  }
  set(key, value, ttlMs) {
    const size = JSON.stringify(value).length;
    this._drop(key);
    this._evictUntilFits(size);
    this.mem.set(key, { value, storedAt: Date.now(), expiresAt: Date.now() + ttlMs, size });
    this.bytes += size;
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
