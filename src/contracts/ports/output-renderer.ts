import type { ScanResult } from '../scan-result.js';
import type { TraceCostResult } from '../cost.js';

export interface OutputRenderer {
  renderTokenUsage(data: ScanResult): void;
  renderClaudeCosts(data: ScanResult, traceCost: TraceCostResult, months: number): void;
  renderComparison(data: ScanResult, comparisons: unknown, months: number, options: unknown): void;
  renderSummary(traceCost: TraceCostResult, options: unknown, months: number): void;
}
