// orchestrator.js — the glue. Turns a trip + balances into one ranked recommendation,
// swept across a ±flex departure/return window.
//
// Data sources are injected (deps) so this runs live with the real clients OR offline with mocks:
//   getCash(origin,dest,depDate,retDate,cabin,party) -> { price, taxes, currency, stops }
//   getAwards(origin,dest,startDate,endDate,sources,cabins) -> [ normalized award options ]
//   cheapestFunding, aviosEstimate  (from transferGraph.js)
//
// Award round trips are priced as two independent one-way legs (how these programs actually
// price), so the outbound and return can use different programs — whatever's cheapest per leg.

function genDates(target, flex) {
  const out = [], base = new Date(target + "T00:00:00Z");
  for (let d = -flex; d <= flex; d++) {
    const x = new Date(base); x.setUTCDate(base.getUTCDate() + d);
    out.push(x.toISOString().slice(0, 10));
  }
  return out;
}

// All viable funding options for ONE leg (each award option x each source that can cover it).
// Award prices are PER PERSON; scale to the whole party so they compare to party cash.
function legCandidates(options, { balances, valuations, awardTax, cheapestFunding, asOf, pax }) {
  const out = [];
  for (const o of options) {
    if (o.seats != null && o.seats < pax) continue; // not enough award seats for the family
    const partyPoints = o.points * pax;             // 4 seats, not 1
    const f = cheapestFunding(o.program, partyPoints, balances, asOf);
    for (const c of f.candidates) {
      if (balances[c.source] == null || balances[c.source] < c.sourcePts) continue;
      const val = valuations[c.source] ?? 1.5;
      const taxes = ((o.taxes ?? awardTax[o.program] ?? 40)) * pax; // per-person taxes x party
      out.push({
        program: o.program, points: partyPoints, source: c.source, sourcePts: c.sourcePts,
        via: c.via, taxes, econ: taxes + (c.sourcePts * val) / 100,
        estimated: o.estimated || false, seats: o.seats, direct: o.direct, covered: f.seatsAeroCovered,
        airlines: o.airlines || [],
      });
    }
  }
  return out.sort((a, b) => a.econ - b.econ).slice(0, 12); // bound enumeration
}

// Joint solve: pick outbound + return funding that minimizes total econ cost WHILE respecting
// a single shared balance per currency (the cross-leg contention fix).
function solveRoundTrip(outCands, inCands, balances) {
  let best = null;
  for (const a of outCands) {
    for (const b of inCands) {
      const draw = {};
      draw[a.source] = (draw[a.source] || 0) + a.sourcePts;
      draw[b.source] = (draw[b.source] || 0) + b.sourcePts;
      let ok = true;
      for (const s in draw) if (draw[s] > (balances[s] ?? 0)) { ok = false; break; } // shared-budget check
      if (!ok) continue;
      const econ = a.econ + b.econ;
      if (!best || econ < best.econ) best = { econ, outLeg: a, inLeg: b, draws: draw };
    }
  }
  return best;
}

async function optimizeTrip(cfg, deps) {
  const { origin, destination, target, flexDays = 3, party = { adults: 2 },
    cabin = "economy", sources, balances, valuations,
    aviosDistance, awardTax = {} } = cfg;
  const { getCash, getAwards, cheapestFunding, aviosEstimate } = deps;
  const asOf = cfg.asOf || new Date();
  const pax = (party.adults || 0) + (party.children || 0) || 1; // award seats needed

  const deps_dates = genDates(target.depart, flexDays);
  const ret_dates = genDates(target.return, flexDays);
  const lo = (a) => a[0], hi = (a) => a[a.length - 1];

  // ONE award call per direction across the whole window (Seats.aero returns all dates in range) — in parallel.
  const [outAll, retAll] = await Promise.all([
    getAwards(origin, destination, lo(deps_dates), hi(deps_dates), sources, [cabin]),
    getAwards(destination, origin, lo(ret_dates), hi(ret_dates), sources, [cabin]),
  ]);

  // Inject the Avios fallback Seats.aero is blind to — but ONLY where Avios is actually viable
  // (a oneworld nonstop or sane connection exists). For routes like YYZ-MCO it isn't, so skip it.
  const avios = aviosEstimate(aviosDistance);
  const aviosOK = cfg.aviosViable !== false && avios.points != null;
  const withAvios = (arr, dates) => {
    if (!aviosOK) return arr;
    const extra = dates.map((d) => ({
      program: "BA Avios", points: avios.points, date: d, seats: null,
      direct: true, estimated: true, taxes: awardTax["BA Avios"],
    }));
    return arr.concat(extra);
  };
  const outboundByDate = groupByDate(withAvios(outAll, deps_dates));
  const returnByDate = groupByDate(withAvios(retAll, ret_dates));

  // Cash sweep: one call per date pair. Serially this is 25 × ~5-15s and blows past
  // browser (~60s) and proxy (~100s) timeouts — so run with bounded concurrency instead.
  const pairs = [];
  for (const dep of deps_dates) for (const ret of ret_dates) if (ret >= dep) pairs.push({ dep, ret });

  const CONCURRENCY = 3; // duffelClient spaces request starts globally; this just overlaps supplier wait
  const cashResults = new Array(pairs.length);
  let next = 0;
  let lastErr = null;
  async function worker() {
    while (next < pairs.length) {
      const i = next++;
      const { dep, ret } = pairs[i];
      try {
        cashResults[i] = await getCash(origin, destination, dep, ret, cabin, party);
      } catch (e) {
        lastErr = e;
        console.warn(`cash sweep pair ${dep}→${ret} failed: ${e.message}`);
        cashResults[i] = null; // drop this pair, keep the sweep alive
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pairs.length) }, worker));
  if (cashResults.every((c) => c == null)) throw lastErr || new Error("cash sweep returned nothing");
  const cashCalls = pairs.length;

  const grid = [];
  pairs.forEach(({ dep, ret }, i) => {
    const cash = cashResults[i];
    if (!cash) return; // pair's cash call failed after retries — omit from grid
    const outC = legCandidates(outboundByDate[dep] || [], { balances, valuations, awardTax, cheapestFunding, asOf, pax });
    const inC = legCandidates(returnByDate[ret] || [], { balances, valuations, awardTax, cheapestFunding, asOf, pax });
    const sol = solveRoundTrip(outC, inC, balances);

    let award = null;
    if (sol) {
      const totalPts = sol.outLeg.sourcePts + sol.inLeg.sourcePts;
      const oop = sol.outLeg.taxes + sol.inLeg.taxes;
      const valueCaptured = (cash.price - (cash.taxes ?? 0)) - oop;
      award = { econ: sol.econ, outLeg: sol.outLeg, inLeg: sol.inLeg, totalPts,
        outOfPocket: oop, draws: sol.draws,
        cppCaptured: totalPts ? (valueCaptured / totalPts) * 100 : 0 };
    }
    const cashEcon = cash.price;
    const winner = award && award.econ < cashEcon ? "award" : "cash";
    const byProgram = programSummary(outboundByDate[dep] || [], returnByDate[ret] || [],
      { pax, awardTax, balances, cheapestFunding, asOf });
    grid.push({ dep, ret, cash, award, winner, byProgram, bestEcon: Math.min(cashEcon, award ? award.econ : Infinity) });
  });

  grid.sort((a, b) => a.bestEcon - b.bestEcon);
  return { best: grid[0], grid, cashCalls, aviosNote: avios.note };
}

// "What would this trip cost in each program?" — unfiltered by balances, so the user sees
// every program's price plus the cheapest way to fund it and any shortfall.
function programSummary(outOpts, inOpts, { pax, awardTax, balances, cheapestFunding, asOf }) {
  const cheapestBy = (opts) => {
    const m = {};
    for (const o of opts) {
      if (o.seats != null && o.seats < pax) continue;
      if (!m[o.program] || o.points < m[o.program].points) m[o.program] = o;
    }
    return m;
  };
  const O = cheapestBy(outOpts), I = cheapestBy(inOpts);
  const progs = [...new Set([...Object.keys(O), ...Object.keys(I)])];
  return progs.map((p) => {
    const a = O[p], b = I[p];
    const legs = [a, b].filter(Boolean);
    const totalPts = legs.reduce((t, l) => t + l.points, 0) * pax;
    const taxes = legs.reduce((t, l) => t + (l.taxes ?? awardTax[p] ?? 40), 0) * pax;
    let funding = null;
    if (a && b) {
      const f = cheapestFunding(p, totalPts, balances, asOf).candidates[0];
      if (f) funding = { source: f.source, sourcePts: f.sourcePts, via: f.via || null,
        short: Math.max(0, f.sourcePts - (balances[f.source] ?? 0)) };
    }
    return { program: p, outPts: a ? a.points * pax : null, retPts: b ? b.points * pax : null,
      totalPts: a && b ? totalPts : null, taxes: a && b ? taxes : null,
      estimated: legs.some((l) => l.estimated), roundTrip: !!(a && b), funding };
  }).sort((x, y) => (x.totalPts ?? Infinity) - (y.totalPts ?? Infinity));
}

function groupByDate(arr) {
  return arr.reduce((m, o) => { (m[o.date] ||= []).push(o); return m; }, {});
}

module.exports = { optimizeTrip, genDates };
