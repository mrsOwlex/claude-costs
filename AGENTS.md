# AGENTS.md

This file provides guidance for coding agents working in this repository.

## Project Overview

`claude-costs` is a Node.js CLI that analyzes local Claude Code JSONL session files. It deduplicates usage entries, aggregates tokens, estimates Anthropic API-equivalent cost, and compares the observed trace against other models.

The codebase is intentionally small and dependency-free. Prefer small, direct changes over adding abstractions or packages.

## Repository Structure

| Path | Purpose |
| --- | --- |
| `claude-costs.mjs` | CLI entrypoint, text output, JSON output, comparison table construction. |
| `lib/args.mjs` | CLI argument parsing and validation. |
| `lib/scanner.mjs` | Claude project discovery, JSONL scanning, request dedupe, token aggregation. |
| `lib/pricing.mjs` | Claude pricing, comparison model pricing, cache scenarios, agentic range. |
| `lib/openrouter.mjs` | Best-effort OpenRouter model metadata fetch. |
| `lib/format.mjs` | Terminal formatting, currency/token display, table rendering. |
| `test/*.mjs` | Node test runner coverage for parsing, scanner behavior, pricing, and comparisons. |

## Development Commands

Run the full test suite:

```sh
node --test
```

Run the CLI manually:

```sh
node ./claude-costs.mjs --help
```

Run JSON output for inspection:

```sh
node ./claude-costs.mjs --json
```

## Coding Guidelines

- Use ESM `.mjs` modules.
- Prefer Node.js standard library APIs.
- Do not add dependencies unless there is a clear need.
- Keep pricing arithmetic in USD per token internally.
- Only convert to USD per million tokens for display or embedded human-readable price definitions.
- Preserve the current local-first behavior.
- Treat OpenRouter as optional and best-effort.
- Keep tests deterministic and independent of real Claude data.
- Use temporary JSONL fixtures for scanner tests.

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

When changing scanner or pricing behavior, add or update tests in `test/*.mjs`.

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
