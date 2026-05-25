import type { ScanResult } from '../scan-result.js';

export interface SessionScanOptions {
  from?: string;
  to?: string;
  projectDirs?: string[];
}

export interface SessionDataSource {
  scan(options: SessionScanOptions): ScanResult;
}
