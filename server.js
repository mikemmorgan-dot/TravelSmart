// server.js — thin backend the UI calls. Zero npm deps (built-in http).
//   export SEATS_AERO_KEY=... AMADEUS_CLIENT_ID=... AMADEUS_CLIENT_SECRET=... AMADEUS_ENV=production
//   node server.js                 # listens on :8787
const http = require("http");
const { optimizeTrip, genDates } = require("./orchestrator");
const { cashToCAD, offersToCAD } = require("./fx");
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
  getCash: async (...a) => { const r = await cashCached(...a); return cashToCAD({ ...r.value, _cacheAgeMs: r.cache.ageMs, _fresh: !r.cache.hit }); },
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
  if (req.url === "/watches" && req.method === "GET") {
    listWatches().then((l) => send(res, 200, l)).catch((e) => send(res, 500, { error: e.message }));
    return;
  }
  if (req.url === "/watches" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try { send(res, 200, await createWatch(JSON.parse(body || "{}"))); }
      catch (e) { send(res, 400, { error: e.message }); }
    });
    return;
  }
  if (req.url.startsWith("/watches/") && req.method === "DELETE") {
    const id = req.url.split("/")[2];
    deleteWatch(id).then((d) => send(res, 200, { deleted: d })).catch((e) => send(res, 500, { error: e.message }));
    return;
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
        const anchor = {
          origin: p.origin, destination: p.destination,
          departureDate: p.departureDate, returnDate: p.returnDate,
          adults: p.adults ?? 2, children: p.children ?? 0,
          travelClass: p.travelClass || "economy",
        };
        const r0 = await flightsCached(anchor);
        const r = { ...r0, value: await offersToCAD(r0.value) };

        // Optional flex sweep: cheapest CASH price per date pair around the anchor.
        // Light calls (cashBaseline) with bounded concurrency; duffelClient spaces/retries globally.
        // Failed pairs are dropped, not fatal — the anchor's full list already succeeded.
        let grid = null;
        let gridPartial = 0;
        const flex = Math.min(Math.max(Number(p.flexDays) || 0, 0), 3);
        if (flex > 0 && p.returnDate) {
          const party = { adults: anchor.adults, children: anchor.children };
          const pairs = [];
          for (const dep of genDates(p.departureDate, flex))
            for (const ret of genDates(p.returnDate, flex))
              if (ret >= dep) pairs.push({ dep, ret });
          // Anchor dates first, nearest neighbours next; budget keeps the response fast and
          // a background pass finishes the far corners into the cache.
          const dist = (x) => Math.abs(Date.parse(x.dep) - Date.parse(p.departureDate))
                            + Math.abs(Date.parse(x.ret) - Date.parse(p.returnDate));
          pairs.sort((a, b) => dist(a) - dist(b));
          const deadline = Date.now() + (Number(process.env.FLEX_BUDGET_MS) || 15000);
          const deferred = [];
          const out = new Array(pairs.length);
          let next = 0;
          const worker = async () => {
            while (next < pairs.length) {
              const i = next++;
              const { dep, ret } = pairs[i];
              if (Date.now() > deadline) { deferred.push(pairs[i]); out[i] = null; continue; }
              try {
                const c = await cashCached(anchor.origin, anchor.destination, dep, ret, anchor.travelClass, party);
                const cad = await cashToCAD(c.value);
                out[i] = { dep, ret, price: cad.price, currency: cad.currency };
              } catch (e) {
                console.warn(`cash flex pair ${dep}→${ret} failed: ${e.message}`);
                out[i] = null;
              }
            }
          };
          await Promise.all(Array.from({ length: Math.min(3, pairs.length) }, worker));
          grid = out.filter((g) => g && g.price != null);
          gridPartial = deferred.length;
          if (deferred.length && !globalThis.__tsBgFlex) {
            globalThis.__tsBgFlex = true;
            (async () => {
              try {
                for (const { dep, ret } of deferred) {
                  try { await cashCached(anchor.origin, anchor.destination, dep, ret, anchor.travelClass, party); } catch {}
                }
                console.log(`[bg-flex] finished ${deferred.length} deferred pairs`);
              } finally { globalThis.__tsBgFlex = false; }
            })();
          }
        }
        send(res, 200, { ...r.value, grid, flexDays: flex, gridPartial,
          _cacheAgeMs: r.cache.ageMs, _fresh: !r.cache.hit });
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
