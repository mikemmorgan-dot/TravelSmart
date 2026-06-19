// seatsAeroClient.js — Seats.aero Cached Search client + normalizer
// Node 18+ (uses built-in fetch). Run as a backend/CLI step — NEVER in the browser:
// the key must not ship to the client, and the API doesn't allow browser CORS.
//
// Usage:
//   export SEATS_AERO_KEY=pro_xxx        # rotate the one you pasted; read from env, never hardcoded
//   node demo.js                         # offline parser demo (no network)
//   node -e "require('./seatsAeroClient').search({origin:'YYZ',destination:'MCO',start:'2026-08-01',end:'2026-08-14',sources:['aeroplan','united','flyingblue'],cabins:['economy']}).then(r=>console.log(JSON.stringify(r,null,2)))"

const BASE = "https://seats.aero/partnerapi";

// Seats.aero per-cabin field prefixes -> cabin name
const CABINS = { Y: "economy", W: "premium", J: "business", F: "first" };

// Source program code -> display name (the program whose miles price the award).
// Only codes Seats.aero actually returns; note Avios / WestJet / RBC are NOT here.
const PROGRAM_NAMES = {
  aeroplan: "Aeroplan",
  flyingblue: "Flying Blue",
  united: "United",
  delta: "Delta",
  american: "American",
  alaska: "Alaska",
  aeromexico: "Aeromexico",
  copa: "Copa",
  jetblue: "JetBlue",
  qantas: "Qantas",
  qatar: "Qatar",
  singapore: "Singapore",
  turkish: "Turkish",
  virginatlantic: "Virgin Atlantic",
  emirates: "Emirates",
  etihad: "Etihad",
  finnair: "Finnair",
  lufthansa: "Lufthansa",
};

function key() {
  const k = process.env.SEATS_AERO_KEY;
  if (!k) throw new Error("Set SEATS_AERO_KEY in your environment (do not hardcode it).");
  return k;
}

// One page of cached search. Returns { data, count, hasMore, cursor, callsRemaining }.
async function searchPage(params, cursor) {
  const q = new URLSearchParams({
    origin_airport: params.origin,
    destination_airport: params.destination,
    take: String(params.take ?? 500),
    order_by: "lowest_mileage",
  });
  if (params.start) q.set("start_date", params.start);
  if (params.end) q.set("end_date", params.end);
  if (params.cabins?.length) q.set("cabins", params.cabins.join(","));
  if (params.sources?.length) q.set("sources", params.sources.join(","));
  if (params.onlyDirect) q.set("only_direct_flights", "true");
  if (cursor != null) q.set("cursor", String(cursor));

  const res = await fetch(`${BASE}/search?${q}`, {
    headers: { "Partner-Authorization": key(), accept: "application/json" },
  });
  const callsRemaining = res.headers.get("x-ratelimit-remaining") ?? null;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Seats.aero ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  return { ...json, callsRemaining };
}

// Flatten one availability row into per-cabin normalized options.
function normalizeRow(row) {
  const out = [];
  for (const [p, cabin] of Object.entries(CABINS)) {
    if (!row[`${p}Available`]) continue;
    const points = parseInt(row[`${p}MileageCost`] || "0", 10);
    if (!points) continue; // 0 == not really priced
    out.push({
      program: PROGRAM_NAMES[row.Source] || row.Source,
      sourceCode: row.Source,
      cabin,
      points,
      seats: row[`${p}RemainingSeats`] ?? null,
      direct: !!row[`${p}Direct`],
      airlines: (row[`${p}Airlines`] || "").split(",").map((s) => s.trim()).filter(Boolean),
      date: row.Date,
      origin: row.Route?.OriginAirport,
      destination: row.Route?.DestinationAirport,
      taxes: null, // Seats.aero cached search does not return cash taxes — fill from Amadeus
      updatedAt: row.UpdatedAt, // freshness — surface this, don't hide it
      stale: row.UpdatedAt ? Date.now() - Date.parse(row.UpdatedAt) > 36 * 3600e3 : null,
    });
  }
  return out;
}

function normalize(data) {
  return data.flatMap(normalizeRow).sort((a, b) => a.points - b.points);
}

// Full paginated search -> normalized, engine-ready award options.
async function search(params) {
  let cursor = undefined,
    all = [],
    remaining = null,
    guard = 0;
  do {
    const page = await searchPage(params, cursor);
    all = all.concat(page.data || []);
    remaining = page.callsRemaining;
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor != null && ++guard < 20);
  return { options: normalize(all), rawCount: all.length, callsRemaining: remaining };
}

module.exports = { search, normalize, normalizeRow, PROGRAM_NAMES, CABINS };
