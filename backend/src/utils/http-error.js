// Les erreurs métier gardent un statut HTTP explicite sans masquer les erreurs inattendues.
export class HttpError extends Error {
  constructor(status, message, code = "ERREUR_REQUETE") {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}
