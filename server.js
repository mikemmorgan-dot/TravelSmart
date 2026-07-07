// server.js — thin backend the UI calls. Zero npm deps (built-in http).
//   export SEATS_AERO_KEY=... AMADEUS_CLIENT_ID=... AMADEUS_CLIENT_SECRET=... AMADEUS_ENV=production
//   node server.js                 # listens on :8787
const http = require("http");
const { optimizeTrip } = require("./orchestrator");
const { cheapestFunding, aviosEstimate } = require("./transferGraph");
const { Cache, wrap, TTL } = require("./cache");
const { search } = require("./seatsAeroClient");
// Cash provider is swappable: CASH_PROVIDER=amadeus falls back to Amadeus while it lasts;
// default is Duffel (Amadeus self-service is decommissioned 2026-07-17).
const { cashBaseline, searchOffers } = require(
  process.env.CASH_PROVIDER === "amadeus" ? "./amadeusClient" : "./duffelClient"
);

const cache = new Cache();

// Cache-wrapped real data sources, unwrapped to the shape the orchestrator expects,
// with cache age stapled on so the UI can show freshness.
const cashCached = wrap(
  (o, d, dep, ret, cabin, party) =>
    cashBaseline({ origin: o, destination: d, departureDate: dep, returnDate: ret,
      adults: party.adults ?? 2, children: party.children, travelClass: cabin.toUpperCase() }),
  { cache, ttlMs: TTL.cash, label: "cash",
    keyFn: (o, d, dep, ret, cabin, p) => `${o}${d}${dep}${ret}${cabin}${p.adults}-${p.children || 0}` }
);
const awardsCached = wrap(
  (o, d, s, e, sources, cabins) => search({ origin: o, destination: d, start: s, end: e, sources, cabins }).then((r) => r.options),
  { cache, ttlMs: TTL.awards, label: "awards",
    keyFn: (o, d, s, e, src, cab) => `${o}${d}${s}${e}${(src || []).join(",")}${(cab || []).join(",")}` }
);

// Full offer list (cash mode) — same cache tier as cash baselines.
const flightsCached = wrap(
  (p) => searchOffers(p),
  { cache, ttlMs: TTL.cash, label: "flights",
    keyFn: (p) => `${p.origin}${p.destination}${p.departureDate}${p.returnDate || ""}${p.travelClass}${p.adults}-${p.children || 0}` }
);

const deps = {
  getCash: async (...a) => { const r = await cashCached(...a); return { ...r.value, _cacheAgeMs: r.cache.ageMs, _fresh: !r.cache.hit }; },
  getAwards: async (...a) => (await awardsCached(...a)).value,
  cheapestFunding, aviosEstimate,
};

function send(res, code, body) {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-watch-secret",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  });
  res.end(JSON.stringify(body));
}

// ---- Price watches: saved searches re-priced on a schedule, email on target hit ----
const { listWatches, createWatch, deleteWatch, runWatches } = require("./watches");
const APP_URL = process.env.APP_URL || "https://travelsmart-iclz.onrender.com";
const watchFlights = async (p) => (await flightsCached(p)).value;
async function runAllWatches() {
  const summary = await runWatches(watchFlights, APP_URL);
  console.log("[watch] run:", JSON.stringify(summary));
  return summary;
}
// Best-effort in-process timer. On Render free tier the service sleeps when idle, so
// this only fires while awake — the GitHub Actions cron hitting /watches/run is the
// reliable trigger; this just catches extra checks while the app is in use.
const intervalMin = Number(process.env.WATCH_INTERVAL_MIN || 360);
if (intervalMin > 0) setInterval(() => runAllWatches().catch((e) => console.error("[watch]", e.message)), intervalMin * 60 * 1000).unref();

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true });

  // ---- watches ----
  if (req.url === "/watches" && req.method === "GET") return send(res, 200, listWatches());
  if (req.url === "/watches" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try { send(res, 200, createWatch(JSON.parse(body || "{}"))); }
      catch (e) { send(res, 400, { error: e.message }); }
    });
    return;
  }
  if (req.url.startsWith("/watches/") && req.method === "DELETE") {
    const id = req.url.split("/")[2];
    return send(res, 200, { deleted: deleteWatch(id) });
  }
  if (req.url === "/watches/run" && req.method === "POST") {
    const secret = process.env.WATCH_SECRET;
    if (secret && req.headers["x-watch-secret"] !== secret)
      return send(res, 401, { error: "bad or missing x-watch-secret" });
    runAllWatches()
      .then((summary) => send(res, 200, { ran: summary.length, summary }))
      .catch((e) => { console.error("WATCH RUN ERROR:", e.stack || e.message); send(res, 500, { error: e.message }); });
    return;
  }

  if (req.method === "POST" && req.url === "/optimize") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const cfg = JSON.parse(body || "{}");
        const result = await optimizeTrip(cfg, deps);
        send(res, 200, result);
      } catch (e) {
        console.error("OPTIMIZE ERROR:", e.stack || e.message);
        send(res, 500, { error: e.message });
      }
    });
    return;
  }
  // Cash mode: every available offer with its all-in party price. No points logic.
  if (req.method === "POST" && req.url === "/flights") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const p = JSON.parse(body || "{}");
        for (const k of ["origin", "destination", "departureDate"])
          if (!p[k]) throw new Error(`missing ${k}`);
        const r = await flightsCached({
          origin: p.origin, destination: p.destination,
          departureDate: p.departureDate, returnDate: p.returnDate,
          adults: p.adults ?? 2, children: p.children ?? 0,
          travelClass: p.travelClass || "economy",
        });
        send(res, 200, { ...r.value, _cacheAgeMs: r.cache.ageMs, _fresh: !r.cache.hit });
      } catch (e) {
        console.error("FLIGHTS ERROR:", e.stack || e.message);
        send(res, 500, { error: e.message });
      }
    });
    return;
  }
  // Serve the built React UI (Vite output in ./dist) for everything else, SPA-style.
  if (req.method === "GET") return serveStatic(req, res);
  send(res, 404, { error: "not found" });
});

const fs = require("fs");
const path = require("path");
const DIST = path.join(__dirname, "dist");
const MIME = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css",
  ".svg":"image/svg+xml", ".ico":"image/x-icon", ".json":"application/json" };
function serveStatic(req, res) {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel === "/") rel = "/index.html";
  let file = path.join(DIST, rel);
  if (!file.startsWith(DIST) || !fs.existsSync(file)) file = path.join(DIST, "index.html"); // SPA fallback
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end("not built — run `npm run build`"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(buf);
  });
}

const PORT = process.env.PORT || 8787; // Render injects PORT
server.listen(PORT, () => console.log(`optimizer engine on :${PORT}`));
