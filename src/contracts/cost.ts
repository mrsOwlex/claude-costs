export interface CostBreakdown {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate5m: number;
  cacheCreate1h: number;
  cacheCreateUnknown: number;
  cacheCreate: number;
  total: number;
}

export interface TraceCostResult {
  costsByModel: Record<string, CostBreakdown>;
  total: CostBreakdown;
  grandTotal: number;
  warnings: string[];
  unknownModels: Record<string, number>;
}

export function emptyCost(): CostBreakdown {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheCreate5m: 0,
    cacheCreate1h: 0,
    cacheCreateUnknown: 0,
    cacheCreate: 0,
    total: 0,
  };
}

export function addCost(target: CostBreakdown, cost: CostBreakdown): void {
  target.input += cost.input || 0;
  target.output += cost.output || 0;
  target.cacheRead += cost.cacheRead || 0;
  target.cacheCreate5m += cost.cacheCreate5m || 0;
  target.cacheCreate1h += cost.cacheCreate1h || 0;
  target.cacheCreateUnknown += cost.cacheCreateUnknown || 0;
  target.cacheCreate += cost.cacheCreate || 0;
  target.total += cost.total || 0;
}

export function addWarning(warnings: string[], warning: string): void {
  if (!warnings.includes(warning)) warnings.push(warning);
}
