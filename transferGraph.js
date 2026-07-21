// transferGraph.js — connects the points you HOLD to the programs that PRICE awards.
// Hand-maintained (no API exists). Every edge carries a `verified` date and a source note;
// re-check against the program's live transfer page before relying on a number.
// Ratios verified 2026-06-18 from program guides (Milesopedia / Prince of Travel / NerdWallet CA).

// --- What you hold (illustrative balances; replace with yours) ---
const HOLDINGS = {
  "Amex MR (CA)": 95000,
  Aeroplan: 42000,
  "RBC Avion": 80000, // assumes Avion ELITE tier (Visa Infinite etc.) — Premium/ION only reach WestJet
  "BA Avios": 30000,
  WestJet: 12000,
};

// --- Transfer edges: from -> to, base ratio (miles received per point sent) ---
// seatsAero: true means the TARGET program's awards show up in Seats.aero cached search.
const EDGES = [
  { from: "Amex MR (CA)", to: "Aeroplan",    ratio: 1.0, seatsAero: true,  verified: "2026-06-18" },
  { from: "Amex MR (CA)", to: "Flying Blue", ratio: 1.0, seatsAero: true,  verified: "2026-06-18", note: "base moved 0.75->1.0 on 2026-01-03" },
  { from: "Amex MR (CA)", to: "BA Avios",    ratio: 1.0, seatsAero: false, verified: "2026-06-18", note: "Avios = distance-based; not in Seats.aero" },
  { from: "RBC Avion",    to: "BA Avios",    ratio: 1.0, seatsAero: false, verified: "2026-06-18", note: "Elite tier only" },
  { from: "RBC Avion",    to: "American",    ratio: 0.7, seatsAero: true,  verified: "2026-06-18", note: "Elite only; 10:7 — weak ratio" },
  { from: "RBC Avion",    to: "WestJet",     ratio: 1.0, seatsAero: false, verified: "2026-06-18", note: "revenue-based ~1cpp" },
  // Aeroplan / BA Avios / WestJet held directly are terminal currencies (redeem as-is).
];

// --- Live transfer bonuses (self-expire by date). Confirm before transferring. ---
const BONUSES = [
  { from: "RBC Avion",    to: "BA Avios",    bonus: 0.30, start: "2026-05-01", end: "2026-06-19", source: "Prince of Travel / Flytrippers" },
  { from: "Amex MR (CA)", to: "Flying Blue", bonus: 0.25, start: "2026-06-01", end: "2026-06-30", source: "point.me tracker (verify end date)" },
];

// Avios is distance-based, so we price it ourselves (Seats.aero can't).
// BA Club partner economy off-peak bands — ESTIMATE, verify on ba.com (pricing shifts peak/off-peak).
const { baRouting } = require("./distances");

// BA prices Avios per SEGMENT by distance band. Post-Dec-2025 chart, one-way economy,
// anchored to published from-London rates (Paris/Milan 10k, Rome/Barcelona 13k,
// Athens/Istanbul 15k, NYC/Boston/Toronto 27.5k, LA/Miami 33k, Tokyo/HK 38.5k,
// Singapore 44k, Sydney 55k). Estimates blend off-peak/peak toward off-peak.
const AVIOS_BANDS = [
  { max: 650, points: 10000 }, { max: 1150, points: 13000 }, { max: 2000, points: 15000 },
  { max: 3000, points: 20000 }, { max: 4000, points: 27500 }, { max: 5500, points: 33000 },
  { max: 6500, points: 38500 }, { max: 7500, points: 44000 }, { max: Infinity, points: 55000 },
];
const bandPoints = (mi) => AVIOS_BANDS.find((b) => mi <= b.max).points;

// aviosEstimate(origin, destination) -> one-way, per person:
//   points     — summed per-segment Avios via BA's London routing
//   surcharge  — CAD taxes/YQ estimate per direction (BA loads heavy fuel surcharges on
//                long-haul: ~C$180-220/direction economy post-May-2026; intra-Europe ~C$40)
// Returns { points: null } when BA routing isn't sane for the city pair (huge LHR detour)
// or an airport is unknown — the engine then simply skips the Avios fallback.
function aviosEstimate(origin, destination) {
  const r = baRouting(origin, destination);
  if (!r.viable) {
    return { points: null, verified: false,
      note: r.detour ? "BA routing via London is impractical for this pair" : "route unknown to estimator" };
  }
  const points = r.segments.reduce((sum, mi) => sum + bandPoints(mi), 0);
  const longHaul = r.segments.some((mi) => mi > 2000);
  const surcharge = longHaul ? 200 : 40;
  return { points, surcharge, verified: false,
    note: `economy estimate via ${r.segments.length > 1 ? "LHR connection" : "nonstop"} · incl. ~C$${surcharge}/direction BA surcharges · confirm on ba.com` };
}

function activeBonus(from, to, asOf = new Date()) {
  const d = asOf instanceof Date ? asOf : new Date(asOf);
  const hit = BONUSES.find(
    (b) => b.from === from && b.to === to && new Date(b.start) <= d && d <= new Date(b.end)
  );
  return hit ? hit.bonus : 0;
}

// Cheapest way to put `pointsNeeded` into `targetProgram`, given balances.
// Returns ranked candidates; value ranking (¢/pt) is applied by the engine.
function cheapestFunding(targetProgram, pointsNeeded, balances = HOLDINGS, asOf = new Date()) {
  const cands = [];

  if (balances[targetProgram] != null) {
    cands.push({
      via: "direct hold", source: targetProgram, ratio: 1, bonus: 0,
      sourcePts: pointsNeeded, feasible: balances[targetProgram] >= pointsNeeded,
      have: balances[targetProgram],
    });
  }
  for (const e of EDGES) {
    if (e.to !== targetProgram) continue;
    if (balances[e.from] == null) continue;
    const bonus = activeBonus(e.from, e.to, asOf);
    const eff = e.ratio * (1 + bonus);
    const sourcePts = Math.ceil(pointsNeeded / eff);
    cands.push({
      via: bonus ? `transfer +${Math.round(bonus * 100)}%` : "transfer",
      source: e.from, ratio: e.ratio, bonus, sourcePts,
      feasible: balances[e.from] >= sourcePts, have: balances[e.from], note: e.note,
    });
  }
  cands.sort((a, b) => Number(b.feasible) - Number(a.feasible) || a.sourcePts - b.sourcePts);
  const covered = EDGES.some((e) => e.to === targetProgram && e.seatsAero) ||
    ["Aeroplan", "Flying Blue", "American"].includes(targetProgram);
  return {
    target: targetProgram, pointsNeeded, candidates: cands,
    seatsAeroCovered: covered,
    coverageNote: covered ? null : "Not in Seats.aero — price via fallback (e.g. aviosEstimate).",
  };
}

module.exports = { HOLDINGS, EDGES, BONUSES, aviosEstimate, activeBonus, cheapestFunding };
