import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { apiRequest, getSession, setSession } from "../services/api.js";

const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;

afterEach(() => {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  globalThis.fetch = originalFetch;
});

function installSession(session) {
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  };
  setSession(session);
}

function jsonResponse(status, payload = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => payload,
  };
}

const session = {
  utilisateur: { id: "receiver-1", role: "RECEVEUR" },
  accessToken: "expired-access-token",
  refreshToken: "valid-refresh-token",
};

test("keeps the session when token refresh fails with a server error", async () => {
  installSession(session);
  globalThis.fetch = async (url) => url.endsWith("/auth/refresh")
    ? jsonResponse(500, { erreur: "Erreur interne API" })
    : jsonResponse(401);

  await assert.rejects(apiRequest("/services"), (error) => error.status === 500);
  assert.deepEqual(getSession(), session);
});

test("clears the session when the refresh token is rejected", async () => {
  installSession(session);
  globalThis.fetch = async (url) => url.endsWith("/auth/refresh")
    ? jsonResponse(401, { erreur: "Jeton invalide" })
    : jsonResponse(401);

  await assert.rejects(apiRequest("/services"), (error) => error.status === 401);
  assert.equal(getSession(), null);
});

test("shares one refresh request between concurrent API requests", async () => {
  installSession(session);
  let protectedRequests = 0;
  let refreshRequests = 0;
  globalThis.fetch = async (url) => {
    if (url.endsWith("/auth/refresh")) {
      refreshRequests += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return jsonResponse(200, {
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
      });
    }

    protectedRequests += 1;
    return protectedRequests <= 2
      ? jsonResponse(401)
      : jsonResponse(200, { ok: true });
  };

  const results = await Promise.all([
    apiRequest("/services"),
    apiRequest("/services"),
  ]);
  assert.deepEqual(results, [{ ok: true }, { ok: true }]);
  assert.equal(refreshRequests, 1);
  assert.equal(getSession().refreshToken, "new-refresh-token");
});
