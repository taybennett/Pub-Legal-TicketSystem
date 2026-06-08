/**
 * Thin fetch wrapper. Sends cookies on every request so the session
 * JWT travels with us. Base URL is /api in dev (Vite proxies to localhost:8080)
 * and the full VITE_API_URL in production.
 */

const BASE = (import.meta.env.VITE_API_URL ?? '') + '/api/v1';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(method: string, path: string, body?: unknown, extraInit: RequestInit = {}): Promise<T> {
  const init: RequestInit = {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(extraInit.headers ?? {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...extraInit,
  };
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err = data.error ?? { code: 'unknown', message: res.statusText };
    throw new ApiError(res.status, err.code, err.message, err.details);
  }
  return data as T;
}

export const api = {
  get:    <T>(path: string)              => request<T>('GET',    path),
  post:   <T>(path: string, body?: any)  => request<T>('POST',   path, body),
  patch:  <T>(path: string, body?: any)  => request<T>('PATCH',  path, body),
  delete: <T>(path: string)              => request<T>('DELETE', path),

  /** multipart/form-data uploads — do not set Content-Type, browser picks boundary */
  async upload<T>(path: string, form: FormData): Promise<T> {
    const res = await fetch(`${BASE}${path}`, { method: 'POST', credentials: 'include', body: form });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const err = data.error ?? { code: 'unknown', message: res.statusText };
      throw new ApiError(res.status, err.code, err.message, err.details);
    }
    return data as T;
  },
};
