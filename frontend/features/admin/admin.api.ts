import { apiDownload, apiRequest } from "../../services/api.js";
import type {
  Account,
  AuditEvent,
  Bus,
  Carrier,
  Data,
  Device,
  Line,
  Report,
  Sale,
  SaleDetail,
  Service,
  Session,
} from "./types";

type RequestMethod = "POST" | "PATCH" | "DELETE";

export function login(credentials: { login: string; motDePasse: string; transporteurId?: string }): Promise<Session> {
  return apiRequest<Session>("/auth/login", { method: "POST", body: credentials });
}

export function logout(): Promise<unknown> {
  return apiRequest("/auth/logout", { method: "POST" });
}

export function runAdminAction(path: string, method: RequestMethod, body?: unknown): Promise<unknown> {
  return apiRequest(path, { method, body });
}

export async function downloadSalesExport(from: string, to: string, format: "csv" | "excel"): Promise<void> {
  const query = new URLSearchParams({ du: from, au: to, format });
  const blob = await apiDownload(`/ventes/export?${query.toString()}`);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ventes-${from}-${to}.${format === "excel" ? "xls" : "csv"}`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function getSaleDetail(id: string): Promise<SaleDetail> {
  const result = await apiRequest<{ vente: SaleDetail }>(`/ventes/${id}`);
  return result.vente;
}

type LoadAdminPageOptions = {
  page: string;
  from: string;
  to: string;
  pageNumber: number;
  busId: string;
  lineId: string;
  receiverId: string;
  status: string;
  role?: string;
};

export async function loadAdminPage({
  page,
  from,
  to,
  pageNumber,
  busId,
  lineId,
  receiverId,
  status,
  role,
}: LoadAdminPageOptions): Promise<Data> {
  if (page === "dashboard") {
    const report = await apiRequest<Report>(`/rapports?du=${from}&au=${to}`);
    if (role === "TRANSPORTEUR") {
      const [buses, services] = await Promise.all([
        apiRequest<{ bus: Bus[] }>("/bus"),
        apiRequest<{ services: Service[] }>("/services"),
      ]);
      return { dashboard: report, buses: buses.bus, services: services.services };
    }
    return { dashboard: report };
  }

  if (page === "ventes") {
    const query = new URLSearchParams({ page: String(pageNumber), limit: "50", du: from, au: to });
    if (busId) query.set("busId", busId);
    if (lineId) query.set("ligneId", lineId);
    if (receiverId) query.set("receveurId", receiverId);
    if (status) query.set("annulee", status);

    const payload = await apiRequest<{ ventes: Sale[]; page: number; limite: number; total: number }>(`/ventes?${query.toString()}`);
    if (role === "TRANSPORTEUR" || role === "GESTIONNAIRE") {
      const [busResult, lineResult, userResult] = await Promise.all([
        apiRequest<{ bus: Bus[] }>("/bus"),
        apiRequest<{ lignes: Line[] }>("/lignes"),
        apiRequest<{ utilisateurs: Account[] }>("/utilisateurs"),
      ]);
      return {
        ...payload,
        availableBuses: busResult.bus,
        availableLines: lineResult.lignes,
        availableUsers: userResult.utilisateurs,
      };
    }
    return payload;
  }

  if (page === "audit") {
    return apiRequest<{ evenements: AuditEvent[]; page: number; limite: number; total: number }>("/journal-audit?page=1&limit=50");
  }

  if (page === "plateforme") {
    return apiRequest<{ transporteurs: Carrier[] }>("/transporteurs");
  }

  const route = page === "lignes" ? "lignes" : page;
  const result = await apiRequest<Record<string, unknown>>(`/${route}`);
  const key = page === "bus" ? "bus"
    : page === "lignes" ? "lignes"
      : page === "tarifs" ? "tarifs"
        : page === "utilisateurs" ? "utilisateurs"
          : page === "appareils" ? "appareils"
            : "services";
  const payload: Data = { [key]: result[key] };

  if (page === "services") {
    const [busResult, lineResult, userResult] = await Promise.all([
      apiRequest<{ bus: Bus[] }>("/bus"),
      apiRequest<{ lignes: Line[] }>("/lignes"),
      apiRequest<{ utilisateurs: Account[] }>("/utilisateurs"),
    ]);
    const deviceResult = role === "TRANSPORTEUR"
      ? await apiRequest<{ appareils: Device[] }>("/appareils")
      : null;
    Object.assign(payload, {
      availableBuses: busResult.bus,
      availableLines: lineResult.lignes,
      availableUsers: userResult.utilisateurs,
      availableDevices: deviceResult?.appareils ?? [],
    });
  }

  if (page === "appareils") {
    const accounts = await apiRequest<{ utilisateurs: Account[] }>("/utilisateurs");
    payload.receivers = accounts.utilisateurs.filter((account) => account.role === "RECEVEUR");
  }

  return payload;
}
