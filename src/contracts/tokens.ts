export interface TokenBucket {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate5m: number;
  cacheCreate1h: number;
  cacheCreateUnknown: number;
  cacheCreate: number;
  cacheCreateTotal: number;
}

export function createTokenBucket(): TokenBucket {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheCreate5m: 0,
    cacheCreate1h: 0,
    cacheCreateUnknown: 0,
    cacheCreate: 0,
    cacheCreateTotal: 0,
  };
}

export function addTokens(target: TokenBucket, tokens: TokenBucket): void {
  target.input += tokens.input;
  target.output += tokens.output;
  target.cacheRead += tokens.cacheRead;
  target.cacheCreate5m += tokens.cacheCreate5m;
  target.cacheCreate1h += tokens.cacheCreate1h;
  target.cacheCreateUnknown += tokens.cacheCreateUnknown;
  target.cacheCreate += tokens.cacheCreateTotal;
  target.cacheCreateTotal += tokens.cacheCreateTotal;
}
