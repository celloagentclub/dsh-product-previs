import type { PrevisProject, RenderJob } from '../core/types';

export const BASE = '/product-previs';
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...init?.headers },
  });
  let data: Record<string, unknown>;
  try { data = await response.json(); }
  catch { throw new ApiError(`服务返回了无法读取的内容（${response.status}）。请重试。`, response.status); }
  if (!response.ok || data.ok === false) throw new ApiError(String(data.error || `请求失败（${response.status}）`), response.status);
  return data as T;
}
export function post<T>(path: string, body: unknown) {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) });
}
export const assetUrl = (id: string, file: string) => `${BASE}/asset?id=${encodeURIComponent(id)}&file=${encodeURIComponent(file)}`;
export const outputUrl = (project: string, job: string) => `${BASE}/output?project=${encodeURIComponent(project)}&job=${encodeURIComponent(job)}`;
export type ProjectResponse = { project: PrevisProject };
export type RenderResponse = { job: RenderJob };
