// amadeusClient.js — Amadeus Self-Service cash-fare client (Node 18+, built-in fetch)
// Backend/CLI only: secrets must never reach the browser.
//
//   export AMADEUS_CLIENT_ID=...        # from My Self-Service Workspace
//   export AMADEUS_CLIENT_SECRET=...
//   export AMADEUS_ENV=test             # 'test' (cached, limited) or 'production' (real-time, free w/ quota)
//   node amadeusDemo.js                 # offline parser demo (no network)
//
// Note on data quality (so the numbers aren't trusted blindly):
//  - TEST returns cached/limited inventory and is NOT real pricing — flip to production for real CAD fares.
//  - Amadeus is GDS-sourced: it excludes most ultra-low-cost carriers (e.g. Flair on YYZ-MCO),
//    so the "cheapest cash" here is the cheapest GDS fare, which a ULCC booked direct may beat.
//  - Search prices are indicative; the exact bookable price comes from Flight Offers Price.

const HOSTS = { test: "https://test.api.amadeus.com", production: "https://api.amadeus.com" };
const host = () => HOSTS[process.env.AMADEUS_ENV || "test"];

let _token = null; // { value, expiresAt }

async function token() {
  if (_token && Date.now() < _token.expiresAt - 30_000) return _token.value;
  const id = process.env.AMADEUS_CLIENT_ID, secret = process.env.AMADEUS_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Set AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET (env, not hardcoded).");
  const res = await fetch(`${host()}/v1/security/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }),
  });
  if (!res.ok) throw new Error(`Amadeus auth ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  _token = { value: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 };
  return _token.value;
}

// Pull the real cabin off the fare detail rather than trusting the request param.
function offerCabin(offer) {
  return offer.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.cabin || null;
}

function normalizeOffer(offer) {
  const grand = Number(offer.price.grandTotal);
  const base = Number(offer.price.base || 0);
  return {
    price: grand,                       // all-in, for the WHOLE party in this offer
    currency: offer.price.currency,
    base,
    taxes: +(grand - base).toFixed(2),  // approx surcharges+taxes (excludes some optional fees)
    cabin: offerCabin(offer),
    seats: offer.numberOfBookableSeats ?? null,
    validatingAirlines: offer.validatingAirlineCodes || [],
    itineraries: (offer.itineraries || []).map((it) => ({
      duration: it.duration, // ISO-8601, e.g. PT6H35M
      stops: Math.max(0, (it.segments?.length || 1) - 1),
      segments: (it.segments || []).map((s) => ({
        from: s.departure?.iataCode, depart: s.departure?.at,
        to: s.arrival?.iataCode, arrive: s.arrival?.at,
        carrier: s.carrierCode, number: s.number,
      })),
    })),
  };
}

// Round-trip (or one-way if returnDate omitted) party search. travelClass is per-cabin
// so you can value an economy award vs economy cash, a business award vs business cash, etc.
async function searchOffers(p) {
  const q = new URLSearchParams({
    originLocationCode: p.origin,
    destinationLocationCode: p.destination,
    departureDate: p.departureDate,
    adults: String(p.adults ?? 2),
    currencyCode: p.currencyCode || "CAD",
    max: String(p.max ?? 30),
  });
  if (p.returnDate) q.set("returnDate", p.returnDate);
  if (p.children) q.set("children", String(p.children));
  if (p.infants) q.set("infants", String(p.infants));
  if (p.travelClass) q.set("travelClass", p.travelClass); // ECONOMY|PREMIUM_ECONOMY|BUSINESS|FIRST
  if (p.nonStop) q.set("nonStop", "true");

  const res = await fetch(`${host()}/v2/shopping/flight-offers?${q}`, {
    headers: { Authorization: `Bearer ${await token()}` },
  });
  if (!res.ok) throw new Error(`Amadeus search ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const j = await res.json();
  const offers = (j.data || []).map(normalizeOffer).sort((a, b) => a.price - b.price);
  return { currency: offers[0]?.currency || p.currencyCode || "CAD", offers, count: offers.length };
}

// The single number the engine wants: cheapest all-in party fare for this cabin,
// with enough context to show the user why.
async function cashBaseline(p) {
  const { offers, currency } = await searchOffers(p);
  if (!offers.length) return { price: null, currency, note: "no GDS offers — check ULCCs directly" };
  const c = offers[0];
  return {
    price: c.price, currency, taxes: c.taxes, cabin: c.cabin,
    stops: Math.max(...c.itineraries.map((i) => i.stops)),
    carriers: c.validatingAirlines,
    nonStop: c.itineraries.every((i) => i.stops === 0),
  };
}

module.exports = { searchOffers, cashBaseline, normalizeOffer, token };
