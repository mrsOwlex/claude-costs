import type { Request } from './request.js';
import type { TokenBucket } from './tokens.js';

export interface ScanResult {
  requests: Request[];
  byModel: Record<string, TokenBucket>;
  byDate: Record<string, Record<string, TokenBucket>>;
  totals: TokenBucket;
  meta: ScanMeta;
}

export interface ScanMeta {
  totalFiles: number;
  totalBytes: number;
  totalEntries: number;
  totalRawEntries: number;
  totalFileEntries: number;
  duplicateRequests: number;
  conflictRequests: number;
  invalidEntries: number;
  undatedSkipped: number;
  minDate: string | null;
  maxDate: string | null;
  projectDirs: string[];
  messageCount: number;
  source?: 'claude' | 'opencode' | 'all';
}
