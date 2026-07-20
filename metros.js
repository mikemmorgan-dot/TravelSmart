// metros.js — IATA metropolitan area codes -> member airports.
// Duffel understands the metro code natively; Seats.aero needs the airport list
// (its cached-search API accepts comma-separated airport codes).
const METRO_AIRPORTS = {
  NYC: ["JFK", "LGA", "EWR"],
  YTO: ["YYZ", "YTZ"],
  LON: ["LHR", "LGW", "STN", "LTN", "LCY"],
  PAR: ["CDG", "ORY"],
  CHI: ["ORD", "MDW"],
  WAS: ["IAD", "DCA", "BWI"],
  ROM: ["FCO", "CIA"],
  MIL: ["MXP", "LIN", "BGY"],
  TYO: ["NRT", "HND"],
  OSA: ["KIX", "ITM"],
  SEL: ["ICN", "GMP"],
  STO: ["ARN", "BMA", "NYO"],
  SAO: ["GRU", "CGH"],
  RIO: ["GIG", "SDU"],
  BUE: ["EZE", "AEP"],
  HOU: ["IAH", "HOU"],
};
// "NYC" -> "JFK,LGA,EWR"; plain airport codes pass through untouched.
const expandMetro = (code) =>
  METRO_AIRPORTS[String(code || "").toUpperCase()]?.join(",") || code;
module.exports = { METRO_AIRPORTS, expandMetro };
