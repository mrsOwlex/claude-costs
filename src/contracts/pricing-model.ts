export interface ClaudePricingRates {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate5m: number;
  cacheCreate1h: number;
  longContext?: ClaudePricingRates;
  longContextThreshold?: number;
}

export interface ComparisonModel {
  id: string;
  name: string;
  input: number;
  output: number;
  cacheRead: number | null;
  cacheCreate: number | null;
  contextLength?: number;
  maxOutputTokens?: number;
  fromOpenRouter?: boolean;
}
