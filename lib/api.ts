export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

/** Use same-origin (Next.js proxy) for paths that have a proxy route, so Docker/browser can reach backend. */
function getFetchUrl(path: string): string {
  if (path.startsWith('/api/user/') && path.endsWith('/rewards')) {
    return path
  }
  /* Profile lives in Supabase via Next route — not the Render stub. */
  if (path.startsWith('/api/user/') && path.endsWith('/profile')) {
    return path
  }
  if (path.startsWith('/api/profiles/batch')) {
    return path
  }
  if (path.startsWith('/api/debug')) {
    return path
  }
  if (path.startsWith('/api/diagnostics')) {
    return path
  }
  return `${API_BASE}${path}`
}

export async function apiFetch<T>(path: string): Promise<T> {
  const url = getFetchUrl(path)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`)
  return res.json()
}

export async function apiMutate<T>(
  path: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body: unknown
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `API ${path}: ${res.status}` }));
    throw new Error(err.error || `API ${path}: ${res.status}`);
  }
  return res.json();
}
