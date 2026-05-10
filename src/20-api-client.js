//  CLAUDE FETCH
// ─────────────────────────────────────────────────────────
//
// In-memory cache for deterministic API calls (e.g., JD analysis).
// Cleared on page reload. Same prompt+model+temperature → cached response.
// Reduces API cost ~20-30% in typical usage where users re-analyze the same JD.
const _promptCache = new Map();
const _PROMPT_CACHE_MAX = 50;  // Cap cache size to prevent memory bloat

// Simple hash function for cache keys (djb2)
function _hashPrompt(prompt, model, temperature) {
  const str = `${model||'default'}:${temperature??'default'}:${prompt}`;
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

// Add result to cache, evicting oldest if full (FIFO)
function _cachePut(key, value) {
  if (_promptCache.size >= _PROMPT_CACHE_MAX) {
    const firstKey = _promptCache.keys().next().value;
    _promptCache.delete(firstKey);
  }
  _promptCache.set(key, value);
}

async function claudeFetch(prompt, maxTokens, att, temperature, model, cacheable) {
  // Cache check (only when explicitly opted-in)
  if (cacheable) {
    const cacheKey = _hashPrompt(prompt, model, temperature);
    if (_promptCache.has(cacheKey)) {
      // Cache hit — return immediately, no API call
      return _promptCache.get(cacheKey);
    }
  }
  const key = getKey();
  const attempt = att||1;
  const useModel = model || CONFIG.models.opus;
  const reqBody = {model:useModel,max_tokens:maxTokens||3000,messages:[{role:'user',content:prompt}]};
  if (temperature !== undefined) reqBody.temperature = temperature;
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
    body:JSON.stringify(reqBody)
  });
  if (resp.status===429) {
    if (attempt<6) {
      const w = Math.min(attempt * 15000, 60000);
      if (attempt === 1) toast(`Rate limit — waiting ${w/1000}s...`);
      await new Promise(r=>setTimeout(r,w));
      return claudeFetch(prompt,maxTokens,attempt+1,temperature,model,cacheable);
    }
    // All retries exhausted — throw a clean error without the API URL
    throw new Error('RATE_LIMIT');
  }
  if (resp.status===529||resp.status===503||resp.status===500) {
    if (attempt<4) { const w=attempt*8000; if (attempt===1) toast(`Retrying in ${w/1000}s...`); await new Promise(r=>setTimeout(r,w)); return claudeFetch(prompt,maxTokens,attempt+1,temperature,model,cacheable); }
    throw new Error('API_UNAVAILABLE');
  }
  if (!resp.ok) {
    const e = await resp.json().catch(()=>({}));
    // Sanitize the error message — strip API URLs and long technical details
    const raw = e?.error?.message || `HTTP ${resp.status}`;
    const clean = raw.split('.')[0].slice(0, 100);
    throw new Error(clean);
  }
  const d=await resp.json();
  
  // Track actual token usage from API response - always update counter so user sees real usage
  if (d.usage && window._atsUser) {
    const totalTokens = (d.usage.input_tokens || 0) + (d.usage.output_tokens || 0);
    if (totalTokens > 0) {
      TokenTracker.addTokens(window._atsUser.id, totalTokens);
    }
  }
  
  const result = d.content?.map(b=>b.text||'').join('')||'';
  
  // Cache the result if cacheable
  if (cacheable && result) {
    const cacheKey = _hashPrompt(prompt, model, temperature);
    _cachePut(cacheKey, result);
  }
  
  return result;
}

function parseJson(raw) {
  if(!raw || typeof raw !== 'string') throw new Error('Input is not a string');
  // Remove markdown code blocks
  raw = raw.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'').trim();
  // Find JSON object in the string
  const jsonMatch = raw.match(/\{[\s\S]*\}$/);
  if(!jsonMatch) {
    // Try to find JSON anywhere in the string
    const innerMatch = raw.match(/\{[\s\S]*\}/);
    if(!innerMatch) throw new Error('No JSON object found in response');
    return JSON.parse(innerMatch[0]);
  }
  return JSON.parse(jsonMatch[0]);
}

