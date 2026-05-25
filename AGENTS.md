# AGENTS.md

This file provides guidance for coding agents working in this repository.

## Project Overview

`claude-costs` is a Node.js CLI that analyzes local Claude Code JSONL session files. It deduplicates usage entries, aggregates tokens, estimates Anthropic API-equivalent cost, and compares the observed trace against other models.

The codebase is written in TypeScript, uses a hexagonal architecture (ports & adapters), and compiles to `dist/` via `tsc`. Start in `src/contracts/` to understand all data shapes and port interfaces.

## Architecture

The project follows a hexagonal architecture with strict one-way dependencies:

```
contracts/  ←  domain/  ←  application/  ←  adapters/driving/
                   ↑                              ↓
              adapters/driven/  ─────────→  contracts/
```

- **Contracts** import nothing — they define all shared types, factory functions, and port interfaces
- **Domain** imports only from contracts — pure business logic with no I/O
- **Application** imports from domain + contracts — use case orchestration
- **Adapters** import from contracts + domain — I/O and infrastructure

## Repository Structure

| Path | Purpose |
| --- | --- |
| `bin/claude-costs.js` | Shebang wrapper that imports `dist/cli.js`. |
| `src/cli.ts` | Thin CLI entrypoint: wires adapters → use case. |
| **src/contracts/** | All type definitions, factory functions, and port interfaces. |
| `src/contracts/tokens.ts` | TokenBucket interface, `createTokenBucket()`, `addTokens()`. |
| `src/contracts/request.ts` | Request interface, `makeRequest()`, `parseUsageTokens()`, `safeNonNegInt()`. |
| `src/contracts/cost.ts` | CostBreakdown interface, `emptyCost()`, `addCost()`, `addWarning()`. |
| `src/contracts/pricing-model.ts` | ClaudePricingRates, ComparisonModel interfaces. |
| `src/contracts/scan-result.ts` | ScanResult, ScanMeta interfaces. |
| `src/contracts/model-normalization.ts` | `normalizeModel()` and `MODEL_ALIASES`. |
| `src/contracts/ports/session-source.ts` | SessionDataSource port interface. |
| `src/contracts/ports/pricing-source.ts` | PricingDataSource port interface. |
| `src/contracts/ports/output-renderer.ts` | OutputRenderer port interface. |
| `src/contracts/index.ts` | Re-exports all contract functions and types. |
| **src/domain/** | Pure business logic (no I/O, no side effects). |
| `src/domain/scanner.ts` | Dedup logic, aggregation: `chooseRequestEntry()`, `deduplicateAndAggregate()`. |
| `src/domain/claude-pricing.ts` | Claude API cost calculation per request and trace. |
| `src/domain/comparison-pricing.ts` | Comparison model pricing, cache modes, agentic range. |
| `src/domain/model-normalization.ts` | Re-export from contracts (for backwards-compatible imports). |
| `src/domain/stats.ts` | `daysBetween()`, `percentile()`, `calculateRequestStats()`. |
| **src/application/** | Use case orchestration. |
| `src/application/analyze-usage.ts` | Main use case: scan → price → compare → render. |
| `src/application/build-comparisons.ts` | `buildComparisons()` orchestration. |
| **src/adapters/** | Infrastructure adapters (I/O, external APIs, rendering). |
| `src/adapters/driving/cli.ts` | CLI argument parsing: `parseArgs()`, `HELP`, `CLIArgs` interface. |
| `src/adapters/driven/filesystem-session-source.ts` | Session scanning via node:fs: `scanSessions()`. |
| `src/adapters/driven/embedded-pricing.ts` | `CLAUDE_PRICING`, `COMPARISON_MODELS` constants. |
| `src/adapters/driven/openrouter-pricing-source.ts` | OpenRouter API fetch and model merging. |
| `src/adapters/driven/terminal-renderer.ts` | Text table output: `printTokenUsage()`, `printClaudeCosts()`, etc. |
| `src/adapters/driven/json-renderer.ts` | JSON output: `outputJson()`. |
| `src/adapters/driven/format.ts` | Terminal formatting: colors, `formatTokens()`, `formatUSD()`, `table()`. |
| **test/** | Node test runner coverage (TypeScript via tsx). |
| `test/scanner-pricing.test.ts` | Integration tests: scanner + pricing + comparisons. |
| `test/validation.test.ts` | Input validation and scanner edge cases. |
| `test/domain/*.test.ts` | Unit tests for domain layer (scanner, pricing, stats, normalization). |
| `test/contracts/*.test.ts` | Unit tests for contract factories and utilities. |

## Extending the Project

To add a new feature, start by reading `src/contracts/` to understand available data shapes and ports:

1. **New data source**: Implement the `SessionDataSource` port in `src/contracts/ports/session-source.ts`
2. **New pricing provider**: Implement the `PricingDataSource` port in `src/contracts/ports/pricing-source.ts`
3. **New output format**: Implement the `OutputRenderer` port in `src/contracts/ports/output-renderer.ts`
4. **New domain logic**: Add pure functions in `src/domain/`, importing only from `src/contracts/`
5. **New use case**: Add orchestration in `src/application/`, wiring domain + ports

## Development Commands

Install dependencies:

```sh
npm install
```

Build the project:

```sh
npm run build
```

Type-check without emitting:

```sh
npm run typecheck
```

Run the full test suite:

```sh
npm test
```

Run only domain or contract tests:

```sh
node --import tsx --test test/domain/
node --import tsx --test test/contracts/
```

Run the CLI manually:

```sh
node bin/claude-costs.js --help
```

Run JSON output for inspection:

```sh
node bin/claude-costs.js --json
```

## Coding Guidelines

- Use TypeScript with strict mode enabled.
- Use `.js` extensions in import paths (NodeNext module resolution).
- Prefer Node.js standard library APIs.
- Keep pricing arithmetic in USD per token internally.
- Only convert to USD per million tokens for display or embedded human-readable price definitions.
- Preserve the current local-first behavior.
- Treat OpenRouter as optional and best-effort.
- Keep tests deterministic and independent of real Claude data.
- Use temporary JSONL fixtures for scanner tests.
- Respect the one-way dependency graph: contracts → domain → application → adapters.

## Calculation Invariants

Be careful when changing scanner or pricing code. The README documents the intended behavior, and tests cover many of these invariants.

### Token Buckets

Each request token object should preserve these buckets:

- `input`
- `output`
- `cacheRead`
- `cacheCreate5m`
- `cacheCreate1h`
- `cacheCreateUnknown`
- `cacheCreateTotal`

Invalid token values must not poison totals. Missing, non-numeric, negative, or non-finite token values should be treated as `0`.

### Cache Creation Split

`cacheCreateUnknown` should represent cache write tokens that are included in `cache_creation_input_tokens` but not identified as 5 minute or 1 hour TTL tokens.

`cacheCreateTotal` should be at least the sum of known TTL buckets:

```text
max(cache_creation_input_tokens, cacheCreate5m + cacheCreate1h)
```

### Dedupe Behavior

Claude Code can write multiple streaming checkpoints for the same request. Deduplication should keep the highest-token entry. If totals tie, the later entry should win.

Do not change this behavior unless tests and documentation are updated together.

### Claude Pricing

Claude costs are calculated per request and then summed. This matters for long-context pricing, because long-context thresholds apply per request rather than to aggregate model totals.

Cache write pricing is split by TTL:

- 5 minute cache writes use `125%` of input price.
- 1 hour cache writes use `200%` of input price.
- Unknown TTL cache writes use the 5 minute cache write price and emit a warning.

### Long-Context Pricing

Long-context checks use input-like tokens:

```text
input + cacheRead + cacheCreateTotal
```

If a model defines a long-context threshold and a request exceeds it, only that request should use long-context rates.

### Comparison Pricing

Same-trace comparison must price the observed deduplicated request trace without changing request count or token shape.

Provider cache mode should:

- use cache read pricing when available
- use cache write pricing only when both cache read and cache write prices are available
- bill unsupported cache buckets as regular input
- emit `partial-cache-pricing` when cache reads are priced but cache writes are not

No-cache mode should ignore all cache prices and bill all cache tokens as regular input.

### Agentic Range

The agentic range is a scenario multiplier, not an observed cost. It must not mutate same-trace totals.

```text
min = sameTraceTotal * minMultiplier
max = sameTraceTotal * maxMultiplier
```

### Monthly Normalization

The CLI computes an inclusive day count and converts it to months with:

```text
months = max(1, days / 30)
```

Monthly cost is total cost divided by this month factor. Do not silently change this to extrapolate short ranges unless that behavior is explicitly requested.

## Testing Expectations

When changing scanner or pricing behavior, add or update tests in `test/`.

Important areas to test:

- duplicate request handling
- cache creation TTL splits
- unknown or invalid token values
- Claude request pricing
- long-context pricing
- comparison models with no cache pricing
- comparison models with partial cache pricing
- no-cache scenario
- context and output limit warnings
- agentic multiplier behavior

Do not make tests depend on OpenRouter availability. Mock or bypass network-dependent behavior when needed.

## Documentation Expectations

If calculation behavior changes, update `README.md` in the same change. The README's calculation section is part of the public contract for this tool.

If agent workflow, commands, or repo structure changes, update this file.
