// distances.js — great-circle distances + BA routing model for the Avios estimator.
// Coordinates are approximate (2dp ≈ ±1km) — plenty for distance-band pricing.

const AIRPORT_COORDS = {
  // Canada
  YYZ:[43.68,-79.63], YTZ:[43.63,-79.40], YUL:[45.47,-73.74], YOW:[45.32,-75.67],
  YHZ:[44.88,-63.51], YVR:[49.19,-123.18], YYC:[51.13,-114.01], YEG:[53.31,-113.58], YWG:[49.91,-97.24],
  // US
  JFK:[40.64,-73.78], LGA:[40.78,-73.87], EWR:[40.69,-74.17], BOS:[42.36,-71.01],
  ORD:[41.97,-87.91], MDW:[41.79,-87.75], IAD:[38.95,-77.46], DCA:[38.85,-77.04], BWI:[39.18,-76.67],
  ATL:[33.64,-84.43], MIA:[25.79,-80.29], FLL:[26.07,-80.15], MCO:[28.43,-81.31], TPA:[27.98,-82.53],
  LAX:[33.94,-118.41], SFO:[37.62,-122.38], SAN:[32.73,-117.19], SEA:[47.45,-122.31], PDX:[45.59,-122.60],
  LAS:[36.08,-115.15], PHX:[33.43,-112.01], DEN:[39.86,-104.67], DFW:[32.90,-97.04], IAH:[29.98,-95.34],
  HOU:[29.65,-95.28], AUS:[30.19,-97.67], MSP:[44.88,-93.22], DTW:[42.21,-83.35], PHL:[39.87,-75.24],
  CLT:[35.21,-80.94], BNA:[36.12,-86.68], STL:[38.75,-90.37], SLC:[40.79,-111.98], HNL:[21.32,-157.92], SJU:[18.44,-66.00],
  // Europe
  LHR:[51.47,-0.45], LGW:[51.15,-0.19], STN:[51.89,0.24], LTN:[51.87,-0.37], LCY:[51.51,0.06],
  CDG:[49.01,2.55], ORY:[48.72,2.38], AMS:[52.31,4.76], FRA:[50.03,8.54], MUC:[48.35,11.79],
  ZRH:[47.46,8.55], GVA:[46.24,6.11], VIE:[48.11,16.57], BRU:[50.90,4.48], DUB:[53.42,-6.27],
  MAD:[40.47,-3.57], BCN:[41.30,2.08], LIS:[38.77,-9.13], OPO:[41.24,-8.68],
  FCO:[41.80,12.24], CIA:[41.80,12.60], MXP:[45.63,8.72], LIN:[45.45,9.28], BGY:[45.67,9.70],
  VCE:[45.51,12.35], NAP:[40.88,14.29], ATH:[37.94,23.94], IST:[41.26,28.74],
  CPH:[55.62,12.66], OSL:[60.19,11.10], ARN:[59.65,17.92], BMA:[59.35,17.94], NYO:[58.79,16.91], HEL:[60.32,24.95],
  BER:[52.36,13.50], HAM:[53.63,9.99], DUS:[51.29,6.77], PRG:[50.10,14.26], BUD:[47.44,19.26],
  WAW:[52.17,20.97], KRK:[50.08,19.78], EDI:[55.95,-3.36], GLA:[55.87,-4.43], MAN:[53.35,-2.28],
  // Middle East / Africa / Asia / Oceania
  DXB:[25.25,55.36], AUH:[24.43,54.65], DOH:[25.27,51.61], TLV:[32.01,34.89], CAI:[30.12,31.41],
  JNB:[-26.14,28.25], CPT:[-33.97,18.60], NBO:[-1.32,36.93],
  NRT:[35.77,140.39], HND:[35.55,139.78], KIX:[34.43,135.24], ITM:[34.79,135.44],
  ICN:[37.46,126.44], GMP:[37.56,126.79], PEK:[40.08,116.58], PVG:[31.14,121.81],
  HKG:[22.31,113.91], TPE:[25.08,121.23], SIN:[1.36,103.99], KUL:[2.75,101.71], BKK:[13.69,100.75],
  DEL:[28.57,77.10], BOM:[19.09,72.87], SYD:[-33.95,151.18], MEL:[-37.67,144.84], AKL:[-37.01,174.79],
  // Latin America / Caribbean
  MEX:[19.44,-99.07], CUN:[21.04,-86.87], GRU:[-23.43,-46.47], CGH:[-23.63,-46.66],
  GIG:[-22.81,-43.25], SDU:[-22.91,-43.16], EZE:[-34.82,-58.54], AEP:[-34.56,-58.42],
  SCL:[-33.39,-70.79], LIM:[-12.02,-77.11], BOG:[4.70,-74.15], PTY:[9.07,-79.38],
  SJO:[9.99,-84.20], PUJ:[18.57,-68.36], MBJ:[18.50,-77.91], BGI:[13.07,-59.49], NAS:[25.04,-77.47],
};

// Metro codes resolve to a representative member for distance purposes.
const METRO_REP = { NYC:"JFK", YTO:"YYZ", LON:"LHR", PAR:"CDG", CHI:"ORD", WAS:"IAD",
  ROM:"FCO", MIL:"MXP", TYO:"NRT", OSA:"KIX", SEL:"ICN", STO:"ARN", SAO:"GRU",
  RIO:"GIG", BUE:"EZE", HOU:"IAH" };

const coords = (code) => {
  const c = String(code || "").toUpperCase();
  return AIRPORT_COORDS[METRO_REP[c] || c] || null;
};

function milesBetween(a, b) {
  const ca = coords(a), cb = coords(b);
  if (!ca || !cb) return null;
  const R = 3958.8, rad = Math.PI / 180;
  const dLat = (cb[0] - ca[0]) * rad, dLon = (cb[1] - ca[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(ca[0] * rad) * Math.cos(cb[0] * rad) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

const LONDON = new Set(["LHR", "LGW", "STN", "LTN", "LCY", "LON"]);

// BA itineraries route through London unless an endpoint IS London; Avios price
// per SEGMENT, so return segment distances. If the LHR detour is absurd relative
// to the direct path (e.g. Toronto->Orlando via London), BA isn't a sane option:
// return { viable:false } so the estimator can bow out.
function baRouting(origin, destination) {
  const o = String(origin || "").toUpperCase(), d = String(destination || "").toUpperCase();
  if (LONDON.has(o) || LONDON.has(d)) {
    const m = milesBetween(o === "LON" ? "LHR" : o, d === "LON" ? "LHR" : d);
    return m == null ? { viable: false, unknown: true } : { viable: true, segments: [m] };
  }
  const leg1 = milesBetween(o, "LHR"), leg2 = milesBetween("LHR", d), direct = milesBetween(o, d);
  if (leg1 == null || leg2 == null || direct == null) return { viable: false, unknown: true };
  if (leg1 + leg2 > direct * 1.8) return { viable: false, detour: true };
  return { viable: true, segments: [leg1, leg2] };
}

module.exports = { milesBetween, baRouting, coords };
