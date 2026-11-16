const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/\/+$/, "");
const SESSION_KEY = "busticket-admin-session";
let refreshPromise = null;

export function getSession() {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(SESSION_KEY);
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    window.localStorage.removeItem(SESSION_KEY);
    throw new Error("La session enregistrée est illisible. Veuillez vous reconnecter.", { cause: error });
  }
}

export function setSession(session) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  window.localStorage.removeItem(SESSION_KEY);
}

async function renewSession(session) {
  if (!session?.refreshToken) return null;
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    if (response.status === 401) return null;
    const renewed = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(renewed.erreur || `Erreur HTTP ${response.status}`);
      error.code = renewed.code;
      error.status = response.status;
      throw error;
    }
    const updated = { ...session, ...renewed };
    setSession(updated);
    return updated;
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
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  if (response.status === 401 && retry && session?.refreshToken && !path.startsWith("/auth/")) {
    session = await renewSession(session);
    if (session) {
      response = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
          ...headers,
          authorization: `Bearer ${session.accessToken}`,
        },
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
