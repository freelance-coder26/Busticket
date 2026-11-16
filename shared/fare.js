/**
 * Calcule le tarif d'un trajet à partir des positions cumulées des repères.
 * Ce module reste indépendant du serveur et de la base afin de pouvoir être
 * importé plus tard par l'application receveur hors ligne.
 */
export function calculateFare({ stops, boardingStopId, destinationStopId, direction, unitFareGnf }) {
  if (!Array.isArray(stops) || stops.length < 2) {
    throw new TypeError("Une ligne doit comporter au moins deux repères.");
  }
  if (!Number.isSafeInteger(unitFareGnf) || unitFareGnf <= 0) {
    throw new TypeError("Le tarif par tronçon doit être un entier positif.");
  }
  if (direction !== "ALLER" && direction !== "RETOUR") {
    throw new TypeError("Le sens doit être ALLER ou RETOUR.");
  }

  const boardingStop = stops.find((stop) => stop.id === boardingStopId);
  const destinationStop = stops.find((stop) => stop.id === destinationStopId);
  if (!boardingStop || !destinationStop) {
    throw new RangeError("Les deux repères doivent appartenir à la ligne.");
  }

  const positions = stops.map((stop) => stop.position);
  if (
    positions.some((position) => !Number.isSafeInteger(position)) ||
    positions.some((position, index) => index > 0 && position <= positions[index - 1])
  ) {
    throw new TypeError("Les positions des repères doivent être des entiers strictement croissants.");
  }

  const difference = destinationStop.position - boardingStop.position;
  if (difference === 0) {
    throw new RangeError("La montée et la destination doivent être différentes.");
  }
  if ((direction === "ALLER" && difference < 0) || (direction === "RETOUR" && difference > 0)) {
    throw new RangeError("La destination n'est pas valide dans le sens choisi.");
  }

  const segments = Math.abs(difference);
  const amountGnf = segments * unitFareGnf;
  if (!Number.isSafeInteger(amountGnf)) {
    throw new RangeError("Le montant calculé dépasse la valeur prise en charge.");
  }

  return { segments, unitFareGnf, amountGnf };
}
