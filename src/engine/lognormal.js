// Lognormal percentile <-> dollar math (§14). Each spending category is
// lognormal with mean m and log-scale SD sigma, so mu = ln(m) - sigma^2/2.

const SQRT2PI = Math.sqrt(2 * Math.PI);

/** Standard normal CDF Φ(z) via Abramowitz & Stegun 7.1.26 erf approximation. */
export function normCdf(z) {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/** Inverse standard normal CDF Φ⁻¹(p), Acklam's rational approximation. */
export function normInv(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const plow = 0.02425;
  let q, r;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - plow) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  q = p - 0.5;
  r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export function muForMean(mean, sigma) {
  return Math.log(mean) - (sigma * sigma) / 2;
}

export function dollarAtPercentile(p, mean, sigma) {
  return Math.exp(muForMean(mean, sigma) + sigma * normInv(p));
}

export function percentileOfDollar(x, mean, sigma) {
  if (x <= 0) return 0;
  return normCdf((Math.log(x) - muForMean(mean, sigma)) / sigma);
}

export function lognormalPdf(x, mean, sigma) {
  if (x <= 0) return 0;
  const mu = muForMean(mean, sigma);
  const z = (Math.log(x) - mu) / sigma;
  return (1 / (x * sigma * SQRT2PI)) * Math.exp(-(z * z) / 2);
}
