// Kleine fetch-Hülle mit Timeout und Wiederholungen.

const USER_AGENT =
  'Mozilla/5.0 (compatible; kinoprogramm-leipzig/1.0; +https://github.com/xx-anonym/kinoprogramm-leipzig)';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(
  url,
  { accept, retries = 2, retryDelayMs = 2000, timeoutMs = 30_000, method = 'GET', headers = {}, body } = {},
) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(retryDelayMs * 2 ** (attempt - 1));
    try {
      const res = await fetch(url, {
        method,
        body,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: accept,
          'Accept-Language': 'de-DE,de;q=0.9',
          ...headers,
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} für ${url}`);
      return await res.text();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

export function fetchText(url, options = {}) {
  return request(url, { accept: 'text/html,application/xhtml+xml,*/*;q=0.8', ...options });
}

export async function fetchJson(url, options = {}) {
  const text = await request(url, { accept: 'application/json', ...options });
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Ungültiges JSON von ${url}`);
  }
}
