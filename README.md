# claude-costs

`claude-costs` is a small Node.js CLI for analyzing local Claude Code usage logs. It scans Claude session JSONL files, deduplicates streamed request entries, aggregates token usage, estimates Anthropic API-equivalent cost, and compares the same trace against other models.

The tool is intentionally local-first. It reads Claude Code session files from your machine and only contacts OpenRouter to refresh comparison model prices. If OpenRouter is unavailable, embedded fallback prices are used.

## Requirements

- Node.js 20+ recommended
- Local Claude Code session files
- No package install step is required for the current codebase

## Usage

Run the CLI directly with Node:

```sh
node ./claude-costs.mjs
```

Show help:

```sh
node ./claude-costs.mjs --help
```

Analyze a specific month:

```sh
node ./claude-costs.mjs --month 2026-05
```

Analyze an explicit date range:

```sh
node ./claude-costs.mjs --from 2026-05-01 --to 2026-05-24
```

Compare models against a monthly budget:

```sh
node ./claude-costs.mjs --budget 200
```

Emit machine-readable JSON:

```sh
node ./claude-costs.mjs --json
```

## Options

| Option | Description |
| --- | --- |
| `--month YYYY-MM` | Analyze a full calendar month. |
| `--from YYYY-MM-DD` | Start date, inclusive. |
| `--to YYYY-MM-DD` | End date, inclusive. |
| `--budget N` | Monthly budget used for comparison status. Default: `100`. |
| `--comparison MODE` | `trace`, `agentic`, or `both`. Default: `both`. |
| `--agentic-multiplier MIN:MAX` | Multiplier range for the agentic scenario. Default: `1:3`. |
| `--json` | Print JSON instead of formatted tables. |
| `--no-color` | Disable terminal colors. |
| `--help`, `-h` | Show CLI help. |

If no date range is provided, the tool analyzes the last 30 days. Claude Code may delete older local session files, so available history depends on what still exists locally.

## Data Sources

The scanner looks for Claude project session files in these locations:

| Source | Behavior |
| --- | --- |
| `CLAUDE_CONFIG_DIR` | Optional comma-separated list of Claude config directories. For each entry, `projects` is appended. |
| `~/.config/claude/projects` | Default Claude config location. |
| `~/.claude/projects` | Legacy/default Claude directory. |

Only `.jsonl` files are scanned. The scanner only uses assistant entries that contain a `message.usage` object.

## Output Overview

The default text output contains:

| Section | Meaning |
| --- | --- |
| Token Usage by Model | Aggregated input, output, cache read, cache write, and total tokens per normalized model. |
| Estimated Cost | Anthropic API-equivalent cost for the observed Claude trace. |
| Model Comparison | Same observed trace priced against comparison models, including cache and no-cache scenarios. |
| Summary | Monthly Claude API-equivalent cost and the comparison assumptions. |

The JSON output includes the same underlying data plus per-request details, totals, warnings, and comparison rows.

## How Calculations Work

This section describes the calculations implemented in `lib/scanner.mjs`, `lib/pricing.mjs`, and `claude-costs.mjs`.

### 1. Session Scanning

The scanner recursively reads `.jsonl` files from all discovered Claude project directories.

For each line, it keeps only entries where:

- `type` is `assistant`
- `message.usage` exists and is an object
- the line contains assistant usage data

Each valid usage entry becomes a request-like record containing:

- `messageId`
- `requestId`
- `timestamp`
- `date`
- normalized `model`
- parsed token buckets

If a date filter is active, dated requests outside the range are skipped. Undated entries are also skipped when a date filter is active, because they cannot be assigned safely to the requested period.

### 2. Model Normalization

Raw model names are normalized before aggregation.

The scanner:

- removes an `anthropic.` prefix
- removes Bedrock-style suffixes such as `-v1:0`
- maps known dated Claude model IDs to canonical names
- strips trailing date suffixes like `-20250929`
- returns `unknown` for missing or non-string model values

This keeps pricing lookup and per-model totals stable across provider-specific model ID formats.

### 3. Request Deduplication

Claude Code session logs can contain multiple lines for the same request, especially for streaming checkpoints. The scanner deduplicates in two passes.

First, it deduplicates within each file by request key. If both `message.id` and `requestId` are available, the key is:

```text
message.id:requestId
```

If either ID is missing, the fallback key includes the file path and line number, so the entry remains unique.

For duplicate keys, the scanner keeps the entry with the highest total request token count. If token totals tie, the later entry wins. This preserves the most complete streaming checkpoint.

Second, it deduplicates globally across files using the same key. Duplicate global entries are counted in metadata. If duplicate keys have different token buckets, `conflictRequests` is incremented and the highest-token entry is kept.

### 4. Token Buckets

Each request stores these token buckets:

| Bucket | Source field | Meaning |
| --- | --- | --- |
| `input` | `usage.input_tokens` | Normal uncached input tokens. |
| `output` | `usage.output_tokens` | Generated output tokens. |
| `cacheRead` | `usage.cache_read_input_tokens` | Tokens read from prompt cache. |
| `cacheCreate5m` | `usage.cache_creation.ephemeral_5m_input_tokens` | Cache write tokens with 5 minute TTL. |
| `cacheCreate1h` | `usage.cache_creation.ephemeral_1h_input_tokens` | Cache write tokens with 1 hour TTL. |
| `cacheCreateUnknown` | derived | Cache write tokens without a known TTL split. |
| `cacheCreateTotal` | `usage.cache_creation_input_tokens` and TTL split | Total cache write tokens. |

Token values are sanitized before use. Missing, non-numeric, negative, or non-finite values become `0`. Numeric values are floored to integers.

`cacheCreateUnknown` is calculated as:

```text
max(cache_creation_input_tokens - cacheCreate5m - cacheCreate1h, 0)
```

`cacheCreateTotal` is calculated as:

```text
max(cache_creation_input_tokens, cacheCreate5m + cacheCreate1h)
```

This keeps total cache creation tokens consistent even if one of the fields is missing or incomplete.

### 5. Aggregate Token Totals

After deduplication, requests are aggregated by model, by date, and overall.

Total input-like tokens for request sizing are calculated as:

```text
input + cacheRead + cacheCreateTotal
```

Total request tokens for dedupe and display are calculated as:

```text
input + output + cacheRead + cacheCreateTotal
```

The displayed `Total` column uses all token buckets, including output tokens.

### 6. Claude API-Equivalent Cost

Claude costs are calculated per request, then summed per model and overall.

Pricing is stored internally as USD per token. The code defines model prices in USD per million tokens and converts them with:

```text
price_per_token = price_per_million_tokens / 1,000,000
```

For each request, the cost is:

```text
inputCost = input * inputRate
outputCost = output * outputRate
cacheReadCost = cacheRead * cacheReadRate
cacheCreate5mCost = cacheCreate5m * cacheCreate5mRate
cacheCreate1hCost = cacheCreate1h * cacheCreate1hRate
cacheCreateUnknownCost = cacheCreateUnknown * cacheCreate5mRate
total = inputCost + outputCost + cacheReadCost + cacheCreate5mCost + cacheCreate1hCost + cacheCreateUnknownCost
```

Claude cache pricing is derived from the base input rate:

| Cache bucket | Rate |
| --- | --- |
| Cache read | `10%` of normal input price. |
| 5 minute cache write | `125%` of normal input price. |
| 1 hour cache write | `200%` of normal input price. |
| Unknown TTL cache write | Priced as a 5 minute cache write. |

If a local Claude model has no known price, its requests are excluded from the Claude total and the `unknown-model-pricing` warning is emitted.

### 7. Long-Context Pricing

Long-context pricing is evaluated per request, not on aggregated monthly totals.

For Claude Sonnet models that define a long-context threshold, the tool calculates request input size as:

```text
input + cacheRead + cacheCreateTotal
```

If that value exceeds the configured threshold, the request uses the long-context rate table and emits `long-context-pricing`.

In the current pricing table, `claude-sonnet-4` and `claude-sonnet-4-5` have a `200,000` input-token threshold. `claude-sonnet-4-6` does not receive this long-context premium in the current code.

### 8. Monthly Normalization

Date ranges are converted to a month factor for monthly averages and monthly comparison rows.

The number of days is inclusive:

```text
days = round(to - from in days) + 1
```

The month factor is:

```text
months = max(1, days / 30)
```

Monthly cost is then:

```text
monthlyCost = totalCost / months
```

For ranges shorter than 30 days, `months` is clamped to `1`. This prevents a short partial range from being scaled up automatically.

### 9. Same-Trace Model Comparison

The same-trace comparison prices the exact deduplicated Claude Code request trace against each comparison model.

This means:

- same request count
- same input tokens
- same output tokens
- same cache read tokens
- same cache write tokens
- same request shapes and per-request context sizes

For comparison models, pricing is also stored as USD per token. Embedded fallback prices are refreshed from OpenRouter at runtime when available.

If a comparison model supports cache reads and cache writes, cache tokens are priced with the provider cache rates. If a model does not expose cache pricing, those cache tokens are billed as regular input tokens.

### 10. Partial Cache Pricing

Some providers expose cache read pricing but no cache write pricing.

In that case:

- `cacheRead` is billed with the model's cache read price
- `cacheCreateTotal` is billed as regular input
- `partial-cache-pricing` is emitted when cache write tokens exist

This is different from the no-cache scenario because cache reads still use cache pricing.

### 11. No-Cache Scenario

The no-cache scenario is a stress case for providers or agents that cannot reproduce Claude Code cache behavior.

It ignores provider cache prices completely and bills all cache tokens as regular input:

```text
effectiveInput = input + cacheRead + cacheCreateTotal
total = effectiveInput * inputRate + output * outputRate
```

The scenario emits `cache-disabled-scenario`.

### 12. Agentic Range

The agentic range is not a bill. It is a scenario multiplier for model-dependent agent loop overhead.

The calculation uses the provider same-trace total:

```text
agenticMin = sameTraceTotal * minMultiplier
agenticMax = sameTraceTotal * maxMultiplier
```

The default multiplier is `1:3`, so the displayed range is `1x` to `3x` the same-trace cost. You can change it with:

```sh
node ./claude-costs.mjs --agentic-multiplier 1.5:2.5
```

Changing the agentic multiplier does not change same-trace cost. It only changes the scenario range and budget status when `--comparison agentic` or `--comparison both` is used.

### 13. Context and Output Limit Warnings

Comparison models can include context and max output limits from OpenRouter or embedded metadata.

For each request:

```text
contextCheck = input + cacheRead + cacheCreateTotal + output
outputCheck = output
```

If `contextCheck` exceeds the model context length, the request gets `context-limit-exceeded`. If `outputCheck` exceeds the model output limit, the request gets `output-limit-exceeded`.

These warnings do not remove the model from the comparison table and do not zero the cost. They indicate that the observed trace may not actually be runnable on that model without changing request shape.

### 14. Budget Status

Budget status compares monthly model cost to `--budget`.

For `--comparison trace`:

```text
fits if monthlySameTraceCost <= budget
otherwise over
```

For `--comparison agentic` or `--comparison both`:

```text
fits if monthlyAgenticMax <= budget
maybe if monthlyAgenticMin <= budget < monthlyAgenticMax
over otherwise
```

This makes `maybe` mean that the lower end of the agentic scenario fits, but the upper end does not.

## Warnings

| Warning | Meaning |
| --- | --- |
| `unknown-model-pricing` | At least one observed Claude model has no known Claude API price and is excluded from the Claude total. |
| `cache-write-ttl-unknown` | Cache write tokens did not include a 5 minute or 1 hour TTL split and were priced as 5 minute cache writes. |
| `long-context-pricing` | At least one request exceeded a long-context threshold and used long-context rates. |
| `context-limit-exceeded` | An observed request exceeds a comparison model's context window. |
| `output-limit-exceeded` | An observed request exceeds a comparison model's max output limit. |
| `partial-cache-pricing` | Provider exposes cache read pricing but no cache write price, so cache writes are billed as regular input. |
| `cache-disabled-scenario` | No-cache scenario is active and all cache tokens are billed as regular input. |

## Development

Run tests with:

```sh
node --test
```

The tests use temporary fixture JSONL files and do not require real Claude session data.

## Privacy Notes

The scanner reads local Claude Code session files. Those files may contain conversation metadata and usage data. The default formatted output reports aggregate token and cost data, while `--json` includes per-request metadata such as message IDs, request IDs, timestamps, model names, and token buckets.

OpenRouter is only used to fetch public model metadata and prices. Local session contents are not sent to OpenRouter by this code.
