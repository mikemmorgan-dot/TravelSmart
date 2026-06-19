# Award Optimizer

Cross-program flight award optimizer. One Node service serves both the React UI and the
optimization API, so your API keys stay server-side.

## Repo layout
```
server.js            # Node backend: /optimize API + serves the built UI
orchestrator.js      # ranking engine + flex-date sweep
seatsAeroClient.js   # award availability (Seats.aero)
amadeusClient.js     # cash fares (Amadeus)
transferGraph.js     # transfer ratios + live bonuses + funding resolver
cache.js             # disk+memory TTL cache
index.html           # Vite entry
src/main.jsx         # mounts the UI
src/TripOptimizer.jsx# the UI (calls same-origin /optimize)
```

## Deploy on Render (same as the cooking app, but as a Web Service)
1. Push this folder to a GitHub repo.
2. Render dashboard → **New → Web Service** → connect the repo.
3. Settings:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Instance type:** Free is fine (note: free instances cold-start after idle).
4. **Environment** tab → add these variables (never commit them):
   - `SEATS_AERO_KEY` — your *rotated* Seats.aero Pro key
   - `DUFFEL_TOKEN` — your Duffel token (`duffel_test_…` to trial, `duffel_live_…` for real fares)
   - *(optional)* `CASH_PROVIDER=amadeus` + `AMADEUS_CLIENT_ID/SECRET/ENV` — only if you still have Amadeus access; default is Duffel.
5. Deploy. Render gives you a public URL; the UI and API both live there.

## Run locally
```bash
npm install
npm run build
SEATS_AERO_KEY=... DUFFEL_TOKEN=duffel_test_... npm start
# open http://localhost:8787
```

## Notes
- Cash fares come from **Duffel** by default (`duffelClient.js`). Amadeus self-service is
  decommissioned 2026-07-17; `amadeusClient.js` stays in the repo as a fallback you can re-enable
  with `CASH_PROVIDER=amadeus` if you ever get enterprise access.
- Duffel searches are effectively free — you only pay a per-order fee on a *booking*, which this
  app never does (you book directly with the airline). Free-signup content covers a few airlines
  until you request more, and ULCCs (Flair) won't appear.
