// Les rôles sont contrôlés côté serveur, indépendamment de l'interface qui consommera l'API.
import { PERMISSIONS } from "../config/business.js";
import { HttpError } from "../utils/http-error.js";

export function authorize(permissionName) {
  return (request, _response, next) => {
    const allowedRoles = PERMISSIONS[permissionName];
    if (!allowedRoles) return next(new Error(`Permission inconnue : ${permissionName}`));
    if (!request.user || !allowedRoles.includes(request.user.role)) {
      return next(new HttpError(403, "Vous n'avez pas les droits nécessaires.", "DROITS_INSUFFISANTS"));
    }
    next();
  };
}
