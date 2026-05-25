/**
 * @param {string} a - Start date YYYY-MM-DD
 * @param {string} b - End date YYYY-MM-DD
 * @returns {number}
 */
export function daysBetween(a, b) {
  if (!a || !b) return 1;
  const d1 = new Date(a);
  const d2 = new Date(b);
  return Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
}

/**
 * @param {number[]} values - Sorted array of numbers
 * @param {number} p - Percentile (0-1)
 * @returns {number}
 */
export function percentile(values, p) {
  if (values.length === 0) return 0;
  const index = Math.ceil(values.length * p) - 1;
  return values[Math.max(0, Math.min(index, values.length - 1))];
}

/**
 * @param {import('../contracts/request.mjs').Request[]} requests
 * @param {number} months
 */
export function calculateRequestStats(requests, months) {
  const inputTotals = requests.map(r => r.tokens.input + r.tokens.cacheRead + r.tokens.cacheCreateTotal)
    .sort((a, b) => a - b);
  const totalInput = inputTotals.reduce((sum, n) => sum + n, 0);
  const output = requests.reduce((sum, r) => sum + r.tokens.output, 0);
  const cacheRead = requests.reduce((sum, r) => sum + r.tokens.cacheRead, 0);
  const cacheWrite = requests.reduce((sum, r) => sum + r.tokens.cacheCreateTotal, 0);

  return {
    requestCount: requests.length,
    requestsPerMonth: requests.length / months,
    avgInputPerRequest: requests.length ? totalInput / requests.length : 0,
    avgOutputPerRequest: requests.length ? output / requests.length : 0,
    p50InputPerRequest: percentile(inputTotals, 0.50),
    p95InputPerRequest: percentile(inputTotals, 0.95),
    cacheReadRatio: totalInput ? cacheRead / totalInput : 0,
    cacheWriteRatio: totalInput ? cacheWrite / totalInput : 0,
  };
}
