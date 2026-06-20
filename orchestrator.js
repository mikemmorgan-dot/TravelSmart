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

  // ONE award call per direction across the whole window (Seats.aero returns all dates in range).
  const outAll = await getAwards(origin, destination, lo(deps_dates), hi(deps_dates), sources, [cabin]);
  const retAll = await getAwards(destination, origin, lo(ret_dates), hi(ret_dates), sources, [cabin]);

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

  const grid = [];
  let cashCalls = 0;
  for (const dep of deps_dates) {
    for (const ret of ret_dates) {
      if (ret < dep) continue;
      const cash = await getCash(origin, destination, dep, ret, cabin, party); cashCalls++;
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
      grid.push({ dep, ret, cash, award, winner, bestEcon: Math.min(cashEcon, award ? award.econ : Infinity) });
    }
  }

  grid.sort((a, b) => a.bestEcon - b.bestEcon);
  return { best: grid[0], grid, cashCalls, aviosNote: avios.note };
}

function groupByDate(arr) {
  return arr.reduce((m, o) => { (m[o.date] ||= []).push(o); return m; }, {});
}

module.exports = { optimizeTrip, genDates };
