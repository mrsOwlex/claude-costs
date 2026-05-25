/**
 * SessionDataSource Port
 *
 * Scans Claude Code session data and returns deduplicated, aggregated results.
 *
 * @typedef {Object} SessionDataSource
 * @property {function(SessionScanOptions): import('../scan-result.mjs').ScanResult} scan
 */

/**
 * @typedef {Object} SessionScanOptions
 * @property {string} [from] - Start date filter (YYYY-MM-DD, inclusive)
 * @property {string} [to] - End date filter (YYYY-MM-DD, inclusive)
 * @property {string[]} [projectDirs] - Override project directories to scan
 */
