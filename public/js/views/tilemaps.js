// Tile-grid cartograms: one equal-size tile per area, placed roughly where it
// sits geographically. Keyed by node `code`. Areas without a layout fall back
// to an auto grid. Swap for real GeoJSON boundaries in a later step.
export const LAYOUTS = {
  // US states (standard 12×8 tile grid)
  USA: { AK: [0, 0], ME: [11, 0], VT: [10, 1], NH: [11, 1], WA: [1, 2], ID: [2, 2], MT: [3, 2], ND: [4, 2], MN: [5, 2], IL: [6, 2], WI: [7, 2], MI: [8, 2], NY: [9, 2], RI: [10, 2], MA: [11, 2],
    OR: [1, 3], NV: [2, 3], WY: [3, 3], SD: [4, 3], IA: [5, 3], IN: [6, 3], OH: [7, 3], PA: [8, 3], NJ: [9, 3], CT: [10, 3],
    CA: [1, 4], UT: [2, 4], CO: [3, 4], NE: [4, 4], MO: [5, 4], KY: [6, 4], WV: [7, 4], VA: [8, 4], MD: [9, 4], DE: [10, 4],
    AZ: [2, 5], NM: [3, 5], KS: [4, 5], AR: [5, 5], TN: [6, 5], NC: [7, 5], SC: [8, 5], DC: [9, 5],
    OK: [4, 6], LA: [5, 6], MS: [6, 6], AL: [7, 6], GA: [8, 6], HI: [0, 7], TX: [4, 7], FL: [9, 7] },
  // Nigeria 36 states + FCT (approximate geography, 7×7)
  NGA: { SO: [0, 0], ZA: [1, 0], KT: [2, 0], KN: [3, 0], JI: [4, 0], YO: [5, 0], BO: [6, 0],
    KE: [0, 1], NI: [1, 1], KD: [2, 1], BA: [3, 1], GO: [4, 1], AD: [5, 1],
    KW: [0, 2], FC: [1, 2], NA: [2, 2], PL: [3, 2], TA: [4, 2],
    OY: [0, 3], OS: [1, 3], EK: [2, 3], KO: [3, 3], BE: [4, 3],
    OG: [0, 4], ON: [1, 4], ED: [2, 4], EN: [3, 4], EB: [4, 4], CR: [5, 4],
    LA: [0, 5], DE: [1, 5], AN: [2, 5], IM: [3, 5], AB: [4, 5], AK: [5, 5], BY: [1, 6], RI: [2, 6] },
  AUS: { WA: [0, 1], NT: [1, 0], QLD: [2, 0], SA: [1, 1], NSW: [2, 1], ACT: [3, 1], VIC: [2, 2], TAS: [2, 3] },
  CAN: { YT: [0, 0], NT: [1, 0], NU: [2, 0], BC: [0, 1], AB: [1, 1], SK: [2, 1], MB: [3, 1], ON: [4, 1], QC: [5, 1], NL: [6, 1], NB: [5, 2], PE: [6, 2], NS: [7, 2] },
  GBR: { SCT: [1, 0], NIR: [0, 1], ENG: [1, 1], WLS: [0, 2] },
};

// returns [{item, x, y}] and grid dims
export function layout(country, items, useCountryLayout) {
  const L = useCountryLayout ? LAYOUTS[country] : null;
  if (L && items.every((it) => L[it.code])) {
    const pts = items.map((it) => ({ item: it, x: L[it.code][0], y: L[it.code][1] }));
    return { pts, cols: Math.max(...pts.map((p) => p.x)) + 1, rows: Math.max(...pts.map((p) => p.y)) + 1 };
  }
  const n = items.length; const cols = Math.max(2, Math.ceil(Math.sqrt(n * 1.6)));
  const pts = items.map((it, i) => ({ item: it, x: i % cols, y: Math.floor(i / cols) }));
  return { pts, cols, rows: Math.ceil(n / cols) };
}
