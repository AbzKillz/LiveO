export class UpstreamError extends Error {
  constructor(public source: string, public status: number, message: string) {
    super(`${source} ${status}: ${message}`);
  }
}

export async function getJson<T>(source: string, url: string, init: RequestInit = {}, timeoutMs = 15000): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json', ...(init.headers ?? {}) } });
  if (!res.ok) throw new UpstreamError(source, res.status, (await res.text()).slice(0, 300));
  return (await res.json()) as T;
}
