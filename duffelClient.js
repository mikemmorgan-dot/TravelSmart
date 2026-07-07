// duffelClient.js — Duffel flight-search client. Drop-in for amadeusClient.js:
// exposes the same searchOffers() / cashBaseline() / normalizeOffer() interface,
// so orchestrator.js and server.js need no changes.
//
//   export DUFFEL_TOKEN=duffel_test_xxx   # test token; swap for duffel_live_xxx in production
//
// Duffel uses a static Bearer token (no OAuth). Searches are effectively free; you only pay
// the per-order fee if you BOOK — which this app never does (you book with the airline).
// Caveat: free-signup content is limited to a few airlines until you request more, and like
// any GDS/NDC feed it omits most ULCCs (Flair), so cash = cheapest mainstream fare.

const BASE = "https://api.duffel.com";
const VERSION = "v2";

function token() {
  const t = process.env.DUFFEL_TOKEN;
  if (!t) throw new Error("Set DUFFEL_TOKEN in your environment (do not hardcode it).");
  return t.trim(); // strip stray whitespace/newlines from env paste
}

function passengers(adults = 2, children = 0, childAge = 8) {
  const p = [];
  for (let i = 0; i < adults; i++) p.push({ type: "adult" });
  for (let i = 0; i < children; i++) p.push({ age: childAge }); // Duffel prices children by age
  return p;
}

// Cabin off the booked segment, not the request, so it reflects what was actually offered.
function offerCabin(o) {
  return o.slices?.[0]?.segments?.[0]?.passengers?.[0]?.cabin_class || null;
}

function normalizeOffer(o) {
  const price = Number(o.total_amount);
  const base = Number(o.base_amount || 0);
  // Baggage allowance off the first segment's first passenger (Duffel repeats it per segment).
  const bags = o.slices?.[0]?.segments?.[0]?.passengers?.[0]?.baggages || [];
  const bag = (t) => bags.filter((b) => b.type === t).reduce((n, b) => n + (b.quantity || 0), 0);
  const cond = (c) => (c ? { allowed: c.allowed, penalty: c.penalty_amount ? Number(c.penalty_amount) : null } : null);
  return {
    price,                                   // all-in, whole party, all slices
    currency: o.total_currency,
    base,
    taxes: Number(o.tax_amount || +(price - base).toFixed(2)),
    cabin: offerCabin(o),
    validatingAirlines: o.owner?.iata_code ? [o.owner.iata_code] : [],
    ownerName: o.owner?.name || null,
    baggage: { carryOn: bag("carry_on"), checked: bag("checked") },
    conditions: {
      change: cond(o.conditions?.change_before_departure),
      refund: cond(o.conditions?.refund_before_departure),
    },
    itineraries: (o.slices || []).map((s) => ({
      duration: s.duration,
      fareBrand: s.fare_brand_name || null,
      stops: Math.max(0, (s.segments?.length || 1) - 1),
      segments: (s.segments || []).map((seg) => ({
        from: seg.origin?.iata_code, depart: seg.departing_at,
        to: seg.destination?.iata_code, arrive: seg.arriving_at,
        carrier: seg.operating_carrier?.iata_code,
        number: seg.operating_carrier_flight_number,
        carrierName: seg.operating_carrier?.name || null,
        marketing: seg.marketing_carrier?.iata_code || null,
        marketingNumber: seg.marketing_carrier_flight_number || null,
        aircraft: seg.aircraft?.name || null,
        duration: seg.duration || null,
      })),
    })),
  };
}

// Round-trip = two slices. Returns offers sorted cheapest-first.
async function searchOffers(p) {
  const slices = [{ origin: p.origin, destination: p.destination, departure_date: p.departureDate }];
  if (p.returnDate) slices.push({ origin: p.destination, destination: p.origin, departure_date: p.returnDate });

  const body = {
    data: {
      cabin_class: (p.travelClass || "economy").toLowerCase(), // accepts ECONOMY or economy
      slices,
      passengers: passengers(p.adults ?? 2, p.children ?? 0),
      ...(p.nonStop ? { max_connections: 0 } : { max_connections: 2 }), // default is 1 — too strict for e.g. YYZ→FCO
    },
  };

  const res = await fetch(`${BASE}/air/offer_requests?return_offers=true&supplier_timeout=15000`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json", Accept: "application/json",
      "Duffel-Version": VERSION, Authorization: `Bearer ${token()}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Duffel ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const json = await res.json();
  const offers = (json.data?.offers || []).map(normalizeOffer).sort((a, b) => a.price - b.price);
  return { currency: offers[0]?.currency || p.currencyCode || "CAD", offers, count: offers.length };
}

// Same shape amadeusClient.cashBaseline returned, so the orchestrator is unchanged.
async function cashBaseline(p) {
  const { offers, currency } = await searchOffers(p);
  if (!offers.length) return { price: null, currency, note: "no Duffel offers — check airline content access / ULCCs directly" };
  const c = offers[0];
  return {
    price: c.price, currency, taxes: c.taxes, cabin: c.cabin,
    stops: Math.max(...c.itineraries.map((i) => i.stops)),
    carriers: c.validatingAirlines,
    nonStop: c.itineraries.every((i) => i.stops === 0),
    itineraries: c.itineraries, // full segment detail: carrier, flight #, depart/arrive times, stops
  };
}

module.exports = { searchOffers, cashBaseline, normalizeOffer };
