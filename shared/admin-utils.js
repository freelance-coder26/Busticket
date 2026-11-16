import { calculateFare } from "./fare.js";

export const ADMIN_PAGES = [
  { id: "dashboard", label: "Tableau de bord", roles: ["TRANSPORTEUR", "CONTROLEUR"] },
  { id: "bus", label: "Bus", roles: ["TRANSPORTEUR", "GESTIONNAIRE"] },
  { id: "lignes", label: "Lignes & repères", roles: ["TRANSPORTEUR", "GESTIONNAIRE"] },
  { id: "tarifs", label: "Tarifs", roles: ["TRANSPORTEUR"] },
  { id: "utilisateurs", label: "Utilisateurs", roles: ["TRANSPORTEUR", "GESTIONNAIRE"] },
  { id: "appareils", label: "Appareils", roles: ["TRANSPORTEUR"] },
  { id: "services", label: "Services", roles: ["TRANSPORTEUR", "GESTIONNAIRE"] },
  { id: "ventes", label: "Ventes", roles: ["TRANSPORTEUR", "GESTIONNAIRE", "CONTROLEUR"] },
  { id: "audit", label: "Journal d’audit", roles: ["TRANSPORTEUR"] },
  { id: "plateforme", label: "Espace plateforme", roles: ["ADMIN_PLATEFORME"] },
];

export function pagesForRole(role) {
  return ADMIN_PAGES.filter((page) => page.roles.includes(role));
}

export function formatGnf(amount) {
  if (!Number.isSafeInteger(amount)) {
    throw new TypeError("Le montant GNF doit être un entier sûr.");
  }
  return `${new Intl.NumberFormat("fr-FR").format(amount).replace(/\u202f/g, " ")} GNF`;
}

export function formatDate(value, options) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", options ?? {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function validateStops(stops) {
  const errors = [];
  if (!Array.isArray(stops) || stops.length < 2) {
    errors.push("Une ligne doit comporter au moins deux repères.");
    return errors;
  }

  stops.forEach((stop, index) => {
    if (typeof stop.nom !== "string" || !stop.nom.trim()) {
      errors.push(`Le nom du repère ${index + 1} est obligatoire.`);
    }
    if (!Number.isSafeInteger(Number(stop.position)) || String(stop.position).trim() === "") {
      errors.push(`La position du repère ${index + 1} doit être un entier.`);
    } else if (index > 0 && Number(stop.position) <= Number(stops[index - 1].position)) {
      errors.push("Les positions doivent être strictement croissantes.");
    }
  });
  return errors;
}

export function validateCancellationReason(reason) {
  return typeof reason === "string" && reason.trim().length >= 3
    ? null
    : "Le motif d’annulation doit contenir au moins 3 caractères.";
}

export function simulateFare({ stops, boardingStopId, destinationStopId, direction, unitFareGnf }) {
  return calculateFare({ stops, boardingStopId, destinationStopId, direction, unitFareGnf });
}

const API_ERROR_MESSAGES = {
  AUTHENTIFICATION_REQUISE: "Veuillez vous connecter pour continuer.",
  JETON_INVALIDE: "Votre session a expiré. Veuillez vous reconnecter.",
  COMPTE_INACTIF: "Ce compte est inactif ou introuvable.",
  DROITS_INSUFFISANTS: "Vous n’avez pas les droits nécessaires pour cette action.",
  TENANT_REQUIS: "Cette action est réservée à un compte transporteur.",
  DONNEES_INVALIDES: "Les informations saisies sont invalides.",
  REPERES_INVALIDES: "Vérifiez l’ordre et la position des repères.",
  BUS_AVEC_SERVICES: "Ce bus ne peut pas être supprimé car il possède des services.",
  LIGNE_AVEC_SERVICES: "Cette ligne ne peut pas être supprimée car elle possède des services.",
  VENTE_DEJA_ANNULEE: "Cette vente est déjà annulée.",
  VENTE_INTROUVABLE: "Cette vente est introuvable.",
  PERIODE_INVALIDE: "La période sélectionnée est invalide.",
  ERREUR_INTERNE: "Une erreur serveur est survenue. Réessayez plus tard.",
};

export function translateApiError(code, message) {
  if (code && API_ERROR_MESSAGES[code]) return API_ERROR_MESSAGES[code];
  return message || "Une erreur inattendue est survenue.";
}
