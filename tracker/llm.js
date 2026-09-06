// Minimal, provider-agnostic LLM client for backlog refinement. No SDK
// dependency — Node's built-in fetch is enough for both providers' plain
// HTTP APIs, matching this repo's preference for a small dependency footprint.
//
// Provider is chosen via LLM_PROVIDER ("anthropic" | "openrouter", default
// "anthropic"). Each provider reads its own API key from the environment and
// falls back to a sensible default model, overridable via LLM_MODEL.

// Indirection so tests can swap out only *this module's* outbound calls
// (see __setFetchForTests) without touching the global fetch used elsewhere
// — e.g. by a test's own requests to its local test server.
let fetchImpl = (...args) => fetch(...args);
function __setFetchForTests(fn) {
  fetchImpl = fn || ((...args) => fetch(...args));
}

const PROVIDERS = {
  anthropic: {
    envKey: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-sonnet-5',
    async call({ apiKey, model, system, prompt }) {
      const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1800,
          system,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) {
        throw new Error(`Anthropic API error ${res.status}: ${(await res.text()).slice(0, 500)}`);
      }
      const data = await res.json();
      return (data.content || []).map(block => block.text || '').join('');
    },
  },

  openrouter: {
    envKey: 'OPENROUTER_API_KEY',
    defaultModel: 'anthropic/claude-sonnet-4.5',
    async call({ apiKey, model, system, prompt }) {
      const res = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt },
          ],
        }),
      });
      if (!res.ok) {
        throw new Error(`OpenRouter API error ${res.status}: ${(await res.text()).slice(0, 500)}`);
      }
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    },
  },
};

function getProviderName() {
  return process.env.LLM_PROVIDER || 'anthropic';
}

function getProvider() {
  const name = getProviderName();
  const provider = PROVIDERS[name];
  if (!provider) throw new Error(`Unknown LLM_PROVIDER "${name}" (expected "anthropic" or "openrouter")`);
  return { name, provider };
}

function isConfigured() {
  try {
    const { provider } = getProvider();
    return Boolean(process.env[provider.envKey]);
  } catch {
    return false;
  }
}

// Calls the configured provider with a system + user prompt and returns the
// raw text reply, plus which provider/model answered (surfaced in the UI so
// refinement results are traceable). Throws with `.code === 'LLM_NOT_CONFIGURED'`
// when no API key is set, so callers can show a clear setup message.
async function callLLM({ system, prompt }) {
  const { name, provider } = getProvider();
  const apiKey = process.env[provider.envKey];
  if (!apiKey) {
    const err = new Error(`${provider.envKey} is not set — add it to the environment to enable AI refinement.`);
    err.code = 'LLM_NOT_CONFIGURED';
    throw err;
  }
  const model = process.env.LLM_MODEL || provider.defaultModel;
  const text = await provider.call({ apiKey, model, system, prompt });
  return { text, provider: name, model };
}

// Pulls the first {...} object out of a text reply. LLMs asked for "only
// JSON" sometimes still wrap it in a sentence or a code fence — this is more
// forgiving than JSON.parse(text) directly.
function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in the LLM response.');
  return JSON.parse(match[0]);
}

module.exports = { callLLM, isConfigured, getProviderName, extractJson, __setFetchForTests };
