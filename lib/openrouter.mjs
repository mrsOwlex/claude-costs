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
