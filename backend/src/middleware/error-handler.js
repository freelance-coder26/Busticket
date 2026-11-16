// Le gestionnaire final expose les erreurs prévues en français et journalise les erreurs serveur.
export function errorHandler(error, request, response, _next) {
  if (error.code === "P2002") {
    return response.status(409).json({ erreur: "Cette donnée existe déjà.", code: "DOUBLON" });
  }
  if (error.code === "P2003" || error.code === "P2025") {
    return response.status(409).json({ erreur: "La donnée est liée ou introuvable.", code: "CONFLIT_DONNEES" });
  }
  if (error.status && error.status < 500) {
    return response.status(error.status).json({ erreur: error.message, code: error.code });
  }

  console.error("Erreur interne API", {
    method: request.method,
    path: request.path,
    message: error.message,
  });
  return response.status(500).json({ erreur: "Une erreur interne est survenue.", code: "ERREUR_INTERNE" });
}
