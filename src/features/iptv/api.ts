import { CACHE } from "./constants";

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry<T>(url: string, required: boolean): Promise<T | []> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= CACHE.fetchRetries; attempt += 1) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      return (await res.json()) as T;
    } catch (error) {
      lastError = error;
      if (attempt < CACHE.fetchRetries) {
        await delay(CACHE.fetchBaseBackoffMs * attempt);
      }
    }
  }

  if (required) {
    throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`);
  }

  return [];
}

export async function fetchIptvDataWithRetry() {
  const [channels, streams, categories, countries] = await Promise.all([
    fetchJsonWithRetry<any[]>("https://iptv-org.github.io/api/channels.json", true),
    fetchJsonWithRetry<any[]>("https://iptv-org.github.io/api/streams.json", true),
    fetchJsonWithRetry<any[]>("https://iptv-org.github.io/api/categories.json", false),
    fetchJsonWithRetry<any[]>("https://iptv-org.github.io/api/countries.json", false),
  ]);

  return { channels, streams, categories, countries };
}

