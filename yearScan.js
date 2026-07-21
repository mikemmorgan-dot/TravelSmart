// yearScan.js — "cheapest month to fly this route" across the next 12 months.
// Samples 2 date pairs per month, prices each all-in (cash vs points) with the
// SAME engine the optimizer uses, under bounded concurrency + a time budget.

const { optimizeTrip: defaultOptimize } = require("./orchestrator");

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };

// Two anchor departures per month: ~8th and ~22nd. Skips any pair whose departure
// is already in the past. Trip length is copied from the user's current search.
function sampleDates(tripLenDays, startFrom = new Date()) {
  const start = new Date(Date.UTC(startFrom.getUTCFullYear(), startFrom.getUTCMonth(), 1));
  const samples = [];
  for (let m = 0; m < 12; m++) {
    const monthStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + m, 1));
    for (const dom of [8, 22]) {
      const dep = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), dom));
      if (dep <= addDays(new Date(), 2)) continue; // need lead time
      const ret = addDays(dep, tripLenDays);
      samples.push({
        monthKey: `${dep.getUTCFullYear()}-${String(dep.getUTCMonth() + 1).padStart(2, "0")}`,
        dep: iso(dep), ret: iso(ret),
      });
    }
  }
  return samples;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  });
  await Promise.all(workers);
  return out;
}

// cfg carries origin/destination/party/cabin/sources/balances/valuations/awardTax + tripLenDays.
// Returns { months: [{ monthKey, best, dep, ret, winner, points, cash }], partial, budgetHit }.
async function yearScan(cfg, deps, opts = {}) {
  const budgetMs = opts.budgetMs ?? 110000;   // stay under proxy ceiling
  const concurrency = opts.concurrency ?? 3;
  const deadline = Date.now() + budgetMs;
  const tripLen = Math.max(1, cfg.tripLenDays || 7);
  const samples = sampleDates(tripLen);

  const priced = await mapLimit(samples, concurrency, async (s) => {
    if (Date.now() > deadline) return { ...s, skipped: true };
    try {
      const optimize = deps.optimize || defaultOptimize;
      const r = await optimize({
        origin: cfg.origin, destination: cfg.destination,
        target: { depart: s.dep, return: s.ret },
        flexDays: 0, party: cfg.party, cabin: cfg.cabin,
        sources: cfg.sources || [], balances: cfg.balances || {},
        valuations: cfg.valuations || {}, awardTax: cfg.awardTax || {},
        aviosViable: cfg.aviosViable,
      }, deps);
      const g = r.best || (r.grid && r.grid[0]);
      if (!g) return { ...s, skipped: true };
      return {
        ...s, bestEcon: g.bestEcon, winner: g.winner,
        points: g.bestPoints ?? null, cash: g.cash ? g.cash.price : null,
        currency: g.cash ? g.cash.currency : "CAD",
      };
    } catch { return { ...s, skipped: true }; }
  });

  // Collapse to one row per month: keep the cheaper of the two samples.
  const byMonth = {};
  let skipped = 0;
  for (const p of priced) {
    if (p.skipped || p.bestEcon == null) { skipped++; continue; }
    const cur = byMonth[p.monthKey];
    if (!cur || p.bestEcon < cur.bestEcon) byMonth[p.monthKey] = p;
  }
  const months = Object.values(byMonth).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  return { months, sampled: priced.length, skipped, budgetHit: Date.now() > deadline };
}

module.exports = { yearScan, sampleDates };
