export type ApiResponse = Record<string, unknown>;

export function getSession(): unknown;
export function setSession<T>(session: T): void;
export function clearSession(): void;
export function apiRequest<T extends ApiResponse = ApiResponse>(
  path: string,
  options?: { method?: string; body?: unknown; retry?: boolean },
): Promise<T>;
export function apiDownload(path: string, options?: { retry?: boolean }): Promise<Blob>;
