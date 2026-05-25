export async function fetchOpenRouterModels() {
  try {
    const resp = await fetch('https://openrouter.ai/api/v1/models', {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    return json.data || [];
  } catch {
    return null;
  }
}

export function updateComparisonFromOpenRouter(models, orModels) {
  for (const m of models) {
    const orMatch = orModels.find(or => or.id === m.id);
    if (orMatch?.pricing) {
      applyOpenRouterModel(m, orMatch);
    }
  }

  const existingIds = new Set(models.map(m => m.id));
  for (const or of orModels) {
    if (existingIds.has(or.id)) continue;
    if (!isPositivePrice(or.pricing?.prompt) || !isPositivePrice(or.pricing?.completion)) continue;
    if (or.architecture?.modality && !or.architecture.modality.includes('text')) continue;

    const model = {
      id: or.id,
      name: or.name || or.id,
      input: Number(or.pricing.prompt),
      output: Number(or.pricing.completion || 0),
      cacheRead: or.pricing.input_cache_read ? Number(or.pricing.input_cache_read) : null,
      cacheCreate: or.pricing.input_cache_write ? Number(or.pricing.input_cache_write) : null,
      fromOpenRouter: true,
    };
    applyOpenRouterLimits(model, or);
    models.push(model);
  }
}

function applyOpenRouterModel(model, orModel) {
  const p = orModel.pricing;
  if (isPositivePrice(p.prompt)) model.input = Number(p.prompt);
  if (isPositivePrice(p.completion)) model.output = Number(p.completion);
  if (isPositivePrice(p.input_cache_read)) model.cacheRead = Number(p.input_cache_read);
  if (isPositivePrice(p.input_cache_write)) model.cacheCreate = Number(p.input_cache_write);
  applyOpenRouterLimits(model, orModel);
}

function isPositivePrice(value) {
  return value != null && Number(value) > 0;
}

function applyOpenRouterLimits(model, orModel) {
  if (orModel.context_length) model.contextLength = Number(orModel.context_length);
  if (orModel.top_provider?.context_length) model.contextLength = Number(orModel.top_provider.context_length);
  if (orModel.top_provider?.max_completion_tokens) model.maxOutputTokens = Number(orModel.top_provider.max_completion_tokens);
  if (orModel.max_completion_tokens) model.maxOutputTokens = Number(orModel.max_completion_tokens);
}
