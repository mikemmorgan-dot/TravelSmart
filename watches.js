// watches.js — price watches with email alerts. Zero npm deps (fs + global fetch).
//
// A watch = a saved cash search + target price + email. The runner re-prices each
// watch and emails when the cheapest offer is at or under target.
//
// Env:
//   RESEND_API_KEY  — from resend.com (free tier: 100 emails/day). No key = dry-run (logs only).
//   ALERT_FROM      — sender, default "TravelSmart <onboarding@resend.dev>"
//                     (Resend's test sender only delivers to YOUR Resend account email
//                      until you verify a domain — fine for personal alerts.)
//   WATCHES_FILE    — storage path, default ./data/watches.json
//                     NOTE: Render free tier disk is ephemeral — watches survive sleeps
//                     but NOT deploys/restarts. Re-create after a deploy, or move to a
//                     persistent disk / KV if that gets old.
//   WATCH_SECRET    — if set, POST /watches/run requires header x-watch-secret to match.
const fs = require("fs");
const path = require("path");

const FILE = process.env.WATCHES_FILE || path.join(__dirname, "data", "watches.json");
const COOLDOWN_MS = 12 * 60 * 60 * 1000; // don't re-email the same watch within 12h

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return []; }
}
function save(list) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(list, null, 1));
}

function listWatches() { return load(); }

function createWatch(w) {
  for (const k of ["origin", "destination", "depart", "email", "targetPrice"])
    if (!w[k]) throw new Error(`missing ${k}`);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(w.email)) throw new Error("invalid email");
  const target = Number(w.targetPrice);
  if (!(target > 0)) throw new Error("targetPrice must be a positive number");
  const watch = {
    id: Math.random().toString(36).slice(2, 10),
    origin: String(w.origin).toUpperCase(), destination: String(w.destination).toUpperCase(),
    depart: w.depart, return: w.return || null,
    adults: Number(w.adults) || 2, children: Number(w.children) || 0,
    cabin: w.cabin || "economy",
    targetPrice: target, email: w.email,
    createdAt: new Date().toISOString(),
    lastPrice: null, lastCheckedAt: null, lastNotifiedAt: null, lastNotifiedPrice: null,
    lastError: null,
  };
  const list = load();
  list.push(watch);
  save(list);
  return watch;
}

function deleteWatch(id) {
  const list = load();
  const keep = list.filter((w) => w.id !== id);
  save(keep);
  return keep.length < list.length;
}

async function sendEmail({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[watch] DRY-RUN email (set RESEND_API_KEY to send) -> ${to}: ${subject}`);
    return { dryRun: true };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.ALERT_FROM || "TravelSmart <onboarding@resend.dev>",
      to: [to], subject, html,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return res.json();
}

function alertHtml(w, offer, appUrl) {
  const money = (n) => `$${Math.round(n).toLocaleString()}`;
  return `
  <div style="font-family:ui-monospace,Menlo,monospace;font-size:14px;line-height:1.6">
    <h2 style="margin:0 0 8px">✈ ${w.origin} → ${w.destination}: ${money(offer.price)}</h2>
    <p style="margin:0 0 12px">At or under your ${money(w.targetPrice)} target.</p>
    <p style="margin:0">
      ${w.depart}${w.return ? ` → ${w.return}` : " (one-way)"} · ${w.adults} adult${w.adults > 1 ? "s" : ""}${w.children ? ` + ${w.children} child${w.children > 1 ? "ren" : ""}` : ""} · ${w.cabin}<br/>
      Cheapest offer: ${offer.airline || "—"} · ${money(offer.price)} all-in for the party${offer.taxes ? ` (taxes ${money(offer.taxes)})` : ""}
    </p>
    <p><a href="${appUrl}">Open TravelSmart</a> — prices move; verify before booking.</p>
    <p style="color:#888;font-size:12px">Watch ${w.id} · next alert only if the price is still at/under target after a 12h cooldown.</p>
  </div>`;
}

// Re-price every watch. getFlights(params) must return { offers: [{price, taxes, validatingAirlines}, ...] }.
async function runWatches(getFlights, appUrl) {
  const list = load();
  const summary = [];
  for (const w of list) {
    const item = { id: w.id, route: `${w.origin}→${w.destination}`, status: "checked" };
    try {
      // Skip departed watches — nothing to alert on.
      if (w.depart < new Date().toISOString().slice(0, 10)) {
        item.status = "expired"; summary.push(item); continue;
      }
      const r = await getFlights({
        origin: w.origin, destination: w.destination,
        departureDate: w.depart, returnDate: w.return || undefined,
        adults: w.adults, children: w.children, travelClass: w.cabin,
      });
      const best = (r.offers || [])[0];
      w.lastCheckedAt = new Date().toISOString();
      w.lastError = null;
      if (!best) { item.status = "no offers"; summary.push(item); continue; }
      w.lastPrice = best.price;
      item.price = best.price;

      const underTarget = best.price <= w.targetPrice;
      const cooled = !w.lastNotifiedAt || Date.now() - new Date(w.lastNotifiedAt).getTime() > COOLDOWN_MS;
      if (underTarget && cooled) {
        await sendEmail({
          to: w.email,
          subject: `✈ ${w.origin}→${w.destination} $${Math.round(best.price)} — under your $${Math.round(w.targetPrice)} target`,
          html: alertHtml(w, { price: best.price, taxes: best.taxes, airline: best.validatingAirlines?.[0] }, appUrl),
        });
        w.lastNotifiedAt = new Date().toISOString();
        w.lastNotifiedPrice = best.price;
        item.status = "ALERTED";
      } else if (underTarget) {
        item.status = "under target (cooldown)";
      }
    } catch (e) {
      w.lastError = e.message;
      item.status = `error: ${e.message}`;
    }
    summary.push(item);
  }
  save(list);
  return summary;
}

module.exports = { listWatches, createWatch, deleteWatch, runWatches };
