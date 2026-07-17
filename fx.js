// fx.js — convert foreign fares to CAD using Bank of Canada daily reference rates.
// Valet API is official, free, keyless: /valet/observations/FX{CUR}CAD/json?recent=1
// Rates publish ~16:30 ET on business days; ?recent=1 returns the latest available.
// If the fetch fails we fall back to static approximations and FLAG them (approx: true)
// so the UI can be honest about it.

const FALLBACK = { USD: 1.37, EUR: 1.49, GBP: 1.73, MXN: 0.075, JPY: 0.0093 };
const TTL_MS = 12 * 3600e3;
const rates = new Map(); // cur -> { rate, asOf, approx, fetchedAt }

async function getRate(cur) {
  cur = String(cur || "CAD").toUpperCase();
  if (cur === "CAD") return { rate: 1, asOf: null, approx: false };
  const hit = rates.get(cur);
  if (hit && Date.now() - hit.fetchedAt < TTL_MS) return hit;
  try {
    const res = await fetch(
      `https://www.bankofcanada.ca/valet/observations/FX${cur}CAD/json?recent=1`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) throw new Error(`BoC ${res.status}`);
    const j = await res.json();
    const obs = j.observations?.[0];
    const v = Number(obs?.[`FX${cur}CAD`]?.v);
    if (!v) throw new Error("no observation");
    const entry = { rate: v, asOf: obs.d, approx: false, fetchedAt: Date.now() };
    rates.set(cur, entry);
    return entry;
  } catch (e) {
    console.warn(`fx: BoC lookup failed for ${cur} (${e.message}) — using fallback`);
    const entry = { rate: FALLBACK[cur] ?? 1, asOf: null, approx: true, fetchedAt: Date.now() };
    if (!(cur in FALLBACK)) entry.unknown = true; // rate 1: pass through, but say so
    rates.set(cur, entry);
    return entry;
  }
}

// Convert a cash result ({ price, taxes?, currency, ... }) to CAD, preserving originals.
async function cashToCAD(c) {
  if (!c || !c.currency || c.currency === "CAD") return c;
  const { rate, asOf, approx, unknown } = await getRate(c.currency);
  return {
    ...c,
    price: Math.round(c.price * rate * 100) / 100,
    taxes: c.taxes != null ? Math.round(c.taxes * rate * 100) / 100 : c.taxes,
    currency: "CAD",
    fx: { from: c.currency, rate, asOf, approx: !!approx, unknown: !!unknown,
          originalPrice: c.price },
  };
}

// Convert a full offers payload ({ offers: [{price, taxes, currency}...], currency }).
async function offersToCAD(r) {
  if (!r || !r.currency || r.currency === "CAD") return r;
  const { rate, asOf, approx, unknown } = await getRate(r.currency);
  return {
    ...r,
    currency: "CAD",
    fx: { from: r.currency, rate, asOf, approx: !!approx, unknown: !!unknown },
    offers: (r.offers || []).map((o) => ({
      ...o,
      price: Math.round(o.price * rate * 100) / 100,
      taxes: o.taxes != null ? Math.round(o.taxes * rate * 100) / 100 : o.taxes,
      base: o.base != null ? Math.round(o.base * rate * 100) / 100 : o.base,
      currency: "CAD",
    })),
  };
}

module.exports = { getRate, cashToCAD, offersToCAD };
