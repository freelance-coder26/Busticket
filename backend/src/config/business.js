// Les règles centralisées évitent de disperser des valeurs provisoires dans les routes.
function configuredInteger(name, fallback, minimum = 1) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${name} doit être un entier supérieur ou égal à ${minimum}.`);
  }
  return value;
}

export const DEFAULT_FARE_GNF = configuredInteger("DEFAULT_FARE_GNF", 2000);
export const OFFLINE_SESSION_MAX_DAYS = configuredInteger("OFFLINE_SESSION_MAX_DAYS", 7);
export const CLOCK_SKEW_WARNING_MS = configuredInteger("CLOCK_SKEW_WARNING_MS", 5 * 60 * 1000, 0);
export const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL ?? "15m";
export const REFRESH_TOKEN_TTL_DAYS = configuredInteger("REFRESH_TOKEN_TTL_DAYS", 30);

// Cette matrice est la source unique des autorisations serveur, modifiable selon la validation métier.
export const PERMISSIONS = Object.freeze({
  transporteurs: ["ADMIN_PLATEFORME"],
  bus: ["TRANSPORTEUR", "GESTIONNAIRE"],
  lignes: ["TRANSPORTEUR", "GESTIONNAIRE"],
  tarifs: ["TRANSPORTEUR"],
  utilisateurs: ["TRANSPORTEUR", "GESTIONNAIRE"],
  appareils: ["TRANSPORTEUR"],
  services: ["TRANSPORTEUR", "GESTIONNAIRE", "RECEVEUR"],
  ventesLecture: ["TRANSPORTEUR", "GESTIONNAIRE", "RECEVEUR", "CONTROLEUR"],
  ventesAnnulation: ["TRANSPORTEUR"],
  rapports: ["TRANSPORTEUR", "CONTROLEUR"],
  audit: ["TRANSPORTEUR"],
});
