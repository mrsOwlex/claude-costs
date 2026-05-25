import type { ClaudePricingRates, ComparisonModel } from '../pricing-model.js';

export interface PricingDataSource {
  getClaudePricing(): Record<string, ClaudePricingRates>;
  getComparisonModels(): ComparisonModel[];
  fetchLivePricing?(): Promise<unknown[] | null>;
  updateFromLive?(models: ComparisonModel[], liveData: unknown[]): void;
}
