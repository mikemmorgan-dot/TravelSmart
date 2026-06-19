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
function aviosEstimate(distanceMiles) {
  const bands = [
    { max: 650, points: 5000 }, { max: 1151, points: 6500 },
    { max: 2000, points: 9000 }, { max: 3000, points: 13000 },
  ];
  const b = bands.find((x) => distanceMiles <= x.max);
  return { points: b ? b.points : null, verified: false, note: "off-peak economy estimate; confirm on ba.com" };
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
