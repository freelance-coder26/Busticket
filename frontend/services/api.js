const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/\/+$/, "");
const SESSION_KEY = "busticket-admin-session";
// Le jeton d'accès ne vit qu'en mémoire : jamais persisté, pour limiter l'impact d'une XSS.
// Le jeton de renouvellement n'est plus connu du JavaScript : il voyage en cookie HttpOnly.
let memoryAccessToken = null;
let refreshPromise = null;

export function getSession() {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(SESSION_KEY);
  if (!value) return null;
  try {
    const cached = JSON.parse(value);
    return { ...cached, accessToken: memoryAccessToken };
  } catch (error) {
    window.localStorage.removeItem(SESSION_KEY);
    throw new Error("La session enregistrée est illisible. Veuillez vous reconnecter.", { cause: error });
  }
}

export function setSession(session) {
  memoryAccessToken = session.accessToken ?? null;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify({ utilisateur: session.utilisateur }));
}

export function clearSession() {
  memoryAccessToken = null;
  window.localStorage.removeItem(SESSION_KEY);
}

async function renewSession() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (response.status === 401) return null;
    const renewed = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(renewed.erreur || `Erreur HTTP ${response.status}`);
      error.code = renewed.code;
      error.status = response.status;
      throw error;
    }
    setSession(renewed);
    return getSession();
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function apiRequest(path, { method = "GET", body, retry = true } = {}) {
  let session = getSession();
  const headers = {
    ...(body === undefined ? {} : { "content-type": "application/json" }),
    ...(session?.accessToken ? { authorization: `Bearer ${session.accessToken}` } : {}),
  };
  let response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: "include",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  if (response.status === 401 && retry && session?.utilisateur && !path.startsWith("/auth/")) {
    session = await renewSession();
    if (session) {
      response = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
          ...headers,
          authorization: `Bearer ${session.accessToken}`,
        },
        credentials: "include",
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } else {
      clearSession();
    }
  }

  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.erreur || `Erreur HTTP ${response.status}`);
    error.code = payload.code;
    error.status = response.status;
    throw error;
  }
  return payload;
}

export async function apiDownload(path, { retry = true } = {}) {
  let session = getSession();
  let response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: session?.accessToken ? { authorization: `Bearer ${session.accessToken}` } : {},
  });

  if (response.status === 401 && retry && session?.utilisateur && !path.startsWith("/auth/")) {
    session = await renewSession();
    if (session) {
      response = await fetch(`${API_BASE}${path}`, {
        credentials: "include",
        headers: { authorization: `Bearer ${session.accessToken}` },
      });
    } else {
      clearSession();
    }
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload.erreur || `Erreur HTTP ${response.status}`);
    error.code = payload.code;
    error.status = response.status;
    throw error;
  }
  return response.blob();
}
