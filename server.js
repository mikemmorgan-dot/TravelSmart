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
const { cashBaseline } = require(
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

const deps = {
  getCash: async (...a) => { const r = await cashCached(...a); return { ...r.value, _cacheAgeMs: r.cache.ageMs, _fresh: !r.cache.hit }; },
  getAwards: async (...a) => (await awardsCached(...a)).value,
  cheapestFunding, aviosEstimate,
};

function send(res, code, body) {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true });
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
