// Le jeton de renouvellement vit dans un cookie HttpOnly plutôt que dans le corps JSON,
// pour qu'il reste inaccessible à un script exécuté dans la page (risque XSS).
const REFRESH_COOKIE_NAME = "refreshToken";

// Express ne peuple req.cookies qu'avec un middleware dédié ; un seul cookie connu ne le justifie pas.
export function readRefreshCookie(request) {
  const header = request.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === REFRESH_COOKIE_NAME) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return null;
}

export function writeRefreshCookie(response, token, maxAgeMs) {
  response.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/api/auth",
    maxAge: maxAgeMs,
  });
}

export function clearRefreshCookie(response) {
  response.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/api/auth",
  });
}
