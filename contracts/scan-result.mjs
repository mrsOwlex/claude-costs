/**
 * @typedef {Object} ScanResult
 * @property {import('./request.mjs').Request[]} requests - Deduplicated, sorted requests
 * @property {Object<string, import('./tokens.mjs').TokenBucket>} byModel - Aggregated tokens per model
 * @property {Object<string, Object<string, import('./tokens.mjs').TokenBucket>>} byDate - Aggregated tokens per date per model
 * @property {import('./tokens.mjs').TokenBucket} totals - Grand total token bucket
 * @property {ScanMeta} meta - Scan metadata
 */

/**
 * @typedef {Object} ScanMeta
 * @property {number} totalFiles - Number of JSONL files scanned
 * @property {number} totalBytes - Total bytes read
 * @property {number} totalEntries - Deduplicated request count
 * @property {number} totalRawEntries - Raw assistant entries parsed
 * @property {number} totalFileEntries - Per-file deduped entry count
 * @property {number} duplicateRequests - Cross-file duplicate count
 * @property {number} conflictRequests - Duplicates with differing token counts
 * @property {number} invalidEntries - Unparseable entries
 * @property {number} undatedSkipped - Entries skipped due to missing date during date-filtered scan
 * @property {string|null} minDate - Earliest request date
 * @property {string|null} maxDate - Latest request date
 * @property {string[]} projectDirs - Directories scanned
 * @property {number} messageCount - Unique message IDs
 */
