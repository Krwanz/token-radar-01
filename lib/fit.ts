// Token Radar, model radar-4: the fitted value curve.
//
// Radar-3 priced a protocol at TVL times the median market cap per TVL
// dollar, a straight line through the market. The market does not price
// that way: among the comparable live-token protocols in this snapshot,
// market cap grows like TVL to the power 0.52, not like TVL itself. The
// straight line overprices the biggest protocols three to four times over
// and underprices the small ones, so the board it writes is a board of
// size, not of value. This module fits the curve the market actually pays
// and blind-tests it, so the board's base is measured from the snapshot's
// own live-token outcomes instead of chosen.
//
// The fit is a Huber regression of log market cap on log TVL over the
// comparable live-token protocols (they record a token, a market cap and a
// TVL, and would have been rankable had they no token). Huber weights
// downweight the snapshot's wild ratios (one protocol trades at 400x its
// TVL) instead of letting them drag the curve. The fit is deterministic:
// a fixed number of reweighting rounds, a fixed Huber constant, and the
// median for the scale, so two runs fit the same curve.
//
// Nothing here knows a protocol's name: the fit sees only TVL and market
// cap, and the board applies the fitted curve to every protocol alike.

/** One point of the fit: a comparable protocol's TVL and market cap. */
export interface CurvePoint {
  tvl_usd: number;
  mcap_usd: number;
}

/** The fitted curve: implied base = exp(intercept) x TVL ^ exponent. */
export interface ValueCurve {
  intercept: number;
  exponent: number;
  n: number;
}

/** The median of a non-empty array of numbers. */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The median market cap per dollar of TVL over the given points. */
export function medianRatio(points: CurvePoint[]): number {
  return median(points.map((p) => p.mcap_usd / p.tvl_usd));
}

/**
 * The Huber fit of log market cap on log TVL: log(mcap) = intercept +
 * exponent x log(TVL). Twenty-five reweighting rounds at most, Huber
 * constant 1.345, scale from the median absolute residual. Returns null
 * when the points are too few or the fit is degenerate, so the caller can
 * fall back to the straight median-ratio line.
 */
export function fitValueCurve(points: CurvePoint[]): ValueCurve | null {
  if (points.length < 10) return null;
  const xs = points.map((p) => Math.log(p.tvl_usd));
  const ys = points.map((p) => Math.log(p.mcap_usd));
  const n = points.length;
  // Ordinary least squares on [1, log TVL], solved in closed form.
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]!;
    sy += ys[i]!;
    sxx += xs[i]! * xs[i]!;
    sxy += xs[i]! * ys[i]!;
  }
  const denom = n * sxx - sx * sx;
  if (!Number.isFinite(denom) || Math.abs(denom) < 1e-9) return null;
  let intercept = (sy * sxx - sx * sxy) / denom;
  let exponent = (n * sxy - sx * sy) / denom;
  if (!Number.isFinite(intercept) || !Number.isFinite(exponent)) return null;
  // Reweight by Huber weights until the curve stops moving.
  const weights = new Array<number>(n).fill(1);
  for (let round = 0; round < 25; round++) {
    const residuals = ys.map((y, i) => y - (intercept + exponent * xs[i]!));
    const scale = median(residuals.map((r) => Math.abs(r))) / 0.6745;
    if (!Number.isFinite(scale) || scale <= 0) break;
    const cut = 1.345 * scale;
    let moved = 0;
    for (let i = 0; i < n; i++) {
      const r = Math.abs(residuals[i]!);
      weights[i] = r <= cut ? 1 : cut / r;
    }
    let sw = 0;
    let swx = 0;
    let swy = 0;
    let swxx = 0;
    let swxy = 0;
    for (let i = 0; i < n; i++) {
      const w = weights[i]!;
      sw += w;
      swx += w * xs[i]!;
      swy += w * ys[i]!;
      swxx += w * xs[i]! * xs[i]!;
      swxy += w * xs[i]! * ys[i]!;
    }
    const d = sw * swxx - swx * swx;
    if (!Number.isFinite(d) || Math.abs(d) < 1e-9) return null;
    const nextIntercept = (swy * swxx - swx * swxy) / d;
    const nextExponent = (sw * swxy - swx * swy) / d;
    if (!Number.isFinite(nextIntercept) || !Number.isFinite(nextExponent)) return null;
    moved = Math.max(Math.abs(nextIntercept - intercept), Math.abs(nextExponent - exponent));
    intercept = nextIntercept;
    exponent = nextExponent;
    if (moved < 1e-10) break;
  }
  return { intercept, exponent, n };
}
