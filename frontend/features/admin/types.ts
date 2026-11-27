export type User = {
  id: string;
  nom: string;
  login: string;
  role: string;
  transporteurId: string | null;
};

export type Session = { utilisateur: User; accessToken: string; refreshToken: string };
export type Stop = { id?: string; nom: string; position: number | string };
export type Line = { id: string; nom: string; actif: boolean; reperes: Stop[] };
export type Bus = { id: string; code: string; nom: string; actif: boolean; versementAttenduGnf: number | null };
export type Account = { id: string; nom: string; login: string; role: string; actif: boolean };
export type Device = { id: string; nom: string; prefixeTicket: string; actif: boolean; receveur?: Account | null };
export type Service = {
  id: string;
  sens: string;
  statut: string;
  debutAt: string;
  bus?: Bus;
  ligne?: Line;
  receveur?: Account;
};
export type Sale = {
  id: string;
  numeroTicket: string;
  montantGnf: number;
  troncons: number;
  ligneNom: string;
  busCode: string;
  receveurNom: string;
  destinationNom: string;
  vendueAtClient: string;
  annulation?: { motif: string } | null;
};
export type SaleDetail = Sale & {
  monteeNom: string;
  prixUnitaireGnf: number;
  sens: string;
  recueAtServeur: string;
};
export type ReportGroup = { cle: string; tickets: number; recettesGnf: number };
export type BusVariance = { busCode: string; recettesGnf: number; versementAttenduGnf: number; ecartGnf: number };
export type Report = {
  total: { tickets: number; recettesGnf: number; ventesAnnulees: number; versementAttenduGnf: number; ecartGnf: number };
  parJour: ReportGroup[];
  parBus: ReportGroup[];
  parLigne: ReportGroup[];
  parReceveur: ReportGroup[];
  annulationsParReceveur: { receveur: string; annulations: number }[];
  ecartsParBus: BusVariance[];
};
export type AuditEvent = {
  id: string;
  createdAt: string;
  acteur?: { nom: string };
  action: string;
  entite: string;
  avant: unknown;
  apres: unknown;
};
export type Carrier = { id: string; nom: string; actif: boolean };
export type Tariff = { id: string; montantGnf: number; dateEffet: string; createdAt: string };
export type Data = Record<string, unknown>;
