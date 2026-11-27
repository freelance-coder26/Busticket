"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Network } from "@capacitor/network";
import { calculateFare } from "../../../shared/fare.js";
import { formatGnf } from "../../../shared/admin-utils.js";
import { apiRequest, clearSession, getSession, setSession } from "../../services/api.js";
import { getReceiverStore } from "../../features/receiver/sqlite-receiver-store.js";
import { printerService } from "../../features/receiver/printer/printer-service.js";

type Stop = { id: string; nom: string; position: number };
type ReceiverSession = {
  utilisateur: { id: string; nom: string; login: string; role: string; transporteurId: string | null };
  accessToken: string;
  refreshToken: string;
};
type Configuration = {
  lastBoardingStopId?: string;
  service: {
    id: string;
    statut: "OUVERT" | "TERMINE";
    sens: "ALLER" | "RETOUR";
    debutAt: string;
    bus: { id: string; code: string; nom: string };
    ligne: { nom: string; reperes: Stop[] };
    receveur: { id: string; nom: string; login: string };
    transporteur?: { nom: string };
    appareil: { id: string; prefixeTicket: string } | null;
  };
  tarif: { montantGnf: number };
};
type StoredSale = {
  data: {
    clientVenteId: string;
    numeroTicket: string;
    serviceId: string;
    appareilId: string;
    monteeRepereId: string;
    destinationRepereId: string;
    troncons: number;
    prixUnitaireGnf: number;
    montantGnf: number;
    vendueAtClient: string;
  };
  status: "PENDING" | "SYNCED" | "REJECTED";
  message: string | null;
  serverResult?: { ecartHorlogeImportant?: boolean; ecartHorlogeMs?: number } | null;
  duplicateCount?: number;
};
type NewSaleInput = {
  clientVenteId: string;
  serviceId: string;
  appareilId: string;
  prefixeTicket: string;
  monteeRepereId: string;
  destinationRepereId: string;
  troncons: number;
  prixUnitaireGnf: number;
  montantGnf: number;
  vendueAtClient: string;
};
type ReceiverStore = {
  listConfigurations(): Promise<Configuration[]>;
  getConfiguration(serviceId: string): Promise<Configuration | null>;
  saveConfiguration(configuration: Configuration): Promise<void>;
  getSales(serviceId?: string): Promise<StoredSale[]>;
  getPendingSales(): Promise<unknown[]>;
  countUnsyncedSales(serviceId: string): Promise<number>;
  createSale(input: NewSaleInput): Promise<StoredSale>;
  retrySale(clientVenteId: string): Promise<void>;
  recordDuplicatePrint(clientVenteId: string): Promise<number>;
};

const newUuid = () => globalThis.crypto.randomUUID();
const printerStateLabels: Record<string, string> = {
  DISCONNECTED: "Déconnectée",
  SCANNING: "Recherche en cours…",
  CONNECTING: "Connexion…",
  CONNECTED: "Connectée",
  PRINTING: "Impression…",
  ERROR: "Erreur imprimante",
};

function printableTicket(sale: StoredSale["data"], configuration: Configuration) {
  const { service } = configuration;
  const boardingStop = service.ligne.reperes.find((stop) => stop.id === sale.monteeRepereId);
  const destinationStop = service.ligne.reperes.find((stop) => stop.id === sale.destinationRepereId);
  if (!boardingStop || !destinationStop) {
    throw new Error("Les repères du ticket sont absents de la configuration locale.");
  }
  if (!service.transporteur?.nom) {
    throw new Error("Téléchargez à nouveau la configuration du service pour inclure le nom du transporteur sur le ticket.");
  }

  return {
    carrierName: service.transporteur.nom,
    ticketNumber: sale.numeroTicket,
    lineName: service.ligne.nom,
    direction: service.sens,
    soldAt: sale.vendueAtClient,
    boardingStop: boardingStop.nom,
    destinationStop: destinationStop.nom,
    segments: sale.troncons,
    unitFareGnf: sale.prixUnitaireGnf,
    amountGnf: sale.montantGnf,
    busCode: service.bus.code,
    receiverLogin: service.receveur.login,
    receiverName: service.receveur.nom,
  };
}

export default function ReceiverPage() {
  const [session, setCurrentSession] = useState<ReceiverSession | null>(null);
  const [store, setStore] = useState<ReceiverStore | null>(null);
  const [config, setConfig] = useState<Configuration | null>(null);
  const [services, setServices] = useState<Array<Configuration["service"]>>([]);
  const [sales, setSales] = useState<StoredSale[]>([]);
  const [screen, setScreen] = useState<"dashboard" | "sale" | "history">("dashboard");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [carrierId, setCarrierId] = useState("");
  const [boardingId, setBoardingId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [preview, setPreview] = useState(false);
  const [online, setOnline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [printerStatus, setPrinterStatus] = useState<{
    state: string;
    deviceName: string | null;
    target: { serviceUuid: string; characteristicUuid: string; writeMode: string } | null;
    message: string | null;
  }>(printerService.getState());
  const [printerDevices, setPrinterDevices] = useState<Array<{ deviceId: string; name: string }>>([]);
  const [printerTargets, setPrinterTargets] = useState<Array<{
    serviceUuid: string;
    characteristicUuid: string;
    writeMode: string;
  }>>([]);
  const [paperWidthMm, setPaperWidthMm] = useState<58 | 80>(58);
  const [printerBusy, setPrinterBusy] = useState(false);
  const [printerError, setPrinterError] = useState("");
  const syncRef = useRef<() => void>(() => {});

  const stops = useMemo(() => config?.service.ligne.reperes ?? [], [config]);
  const availableDestinations = useMemo(() => {
    const boarding = stops.find((stop) => stop.id === boardingId);
    if (!boarding || !config) return [];
    return stops.filter((stop) => config.service.sens === "ALLER"
      ? stop.position > boarding.position
      : stop.position < boarding.position);
  }, [boardingId, config, stops]);

  async function reloadSales(serviceId?: string) {
    if (!store) return;
    setSales(await store.getSales(serviceId));
  }

  async function syncNow() {
    if (!store || !getSession()) return;
    setSyncing(true);
    try {
      const { syncPendingSales } = await import("../../features/receiver/receiver-sync.js");
      const result = await syncPendingSales(store, (ventes: unknown[]) =>
        apiRequest<{ ventes: Array<{ clientVenteId: string; statut: string; raison?: string }> }>(
          "/sync/ventes",
          { method: "POST", body: { ventes } },
        ));
      await reloadSales(config?.service.id);
      setNotice(result.accepted
        ? `${result.accepted} vente(s) confirmée(s) par le serveur.`
        : result.refused
          ? `${result.refused} vente(s) refusée(s) — consultez l’historique.`
          : result.remaining
            ? `${result.remaining} vente(s) attendent la synchronisation.`
            : "");
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Synchronisation impossible.");
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    syncRef.current = () => { void syncNow(); };
  });

  useEffect(() => {
    return printerService.subscribe(setPrinterStatus);
  }, []);

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const receiverStore = await getReceiverStore();
        if (!active) return;
        setStore(receiverStore);

        const savedSession = getSession() as ReceiverSession | null;
        if (savedSession?.utilisateur.role === "RECEVEUR") {
          setCurrentSession(savedSession);
          const cachedConfigs = await receiverStore.listConfigurations() as Configuration[];
          const activeConfig = cachedConfigs.find((item) => item.service.statut === "OUVERT");
          if (activeConfig) {
            setConfig(activeConfig);
            setBoardingId(activeConfig.service.sens === "ALLER"
              ? activeConfig.lastBoardingStopId ?? activeConfig.service.ligne.reperes[0]?.id ?? ""
              : activeConfig.lastBoardingStopId ?? activeConfig.service.ligne.reperes.at(-1)?.id ?? "");
            setSales(await receiverStore.getSales(activeConfig.service.id));
          }
          const status = await Network.getStatus();
          setOnline(status.connected);
          if (status.connected) syncRef.current();
        }
      } catch (initializationError) {
        setError(initializationError instanceof Error
          ? initializationError.message
          : "Impossible d’initialiser le stockage local.");
      }
    }

    void initialize();
    let networkListener: { remove: () => void } | undefined;
    void Network.addListener("networkStatusChange", (status) => {
      setOnline(status.connected);
      if (status.connected) syncRef.current();
    }).then((listener) => {
      networkListener = listener;
    }).catch((networkError: unknown) => {
      setError(networkError instanceof Error ? networkError.message : "État du réseau indisponible.");
    });

    const onOnline = () => {
      setOnline(true);
      syncRef.current();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      active = false;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      void networkListener?.remove();
    };
  }, []);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await apiRequest<ReceiverSession>("/auth/login", {
        method: "POST",
        body: { login, motDePasse: password, ...(carrierId ? { transporteurId: carrierId } : {}) },
      });
      if (result.utilisateur.role !== "RECEVEUR") {
        throw new Error("Ce compte n’est pas un compte receveur.");
      }
      setSession(result);
      setCurrentSession(result);
      setPassword("");
      setNotice("Connecté. Sélectionnez votre service pour télécharger sa configuration.");
      const response = await apiRequest<{ services: Array<Configuration["service"]> }>("/services");
      setServices(response.services.filter((service) => service.statut === "OUVERT"));
      setError("");
      try {
        const status = await Network.getStatus();
        setOnline(status.connected);
        if (status.connected) syncRef.current();
      } catch (networkError) {
        setError(networkError instanceof Error ? networkError.message : "État du réseau indisponible.");
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Connexion impossible.");
    } finally {
      setLoading(false);
    }
  }

  async function loadServices() {
    setLoading(true);
    try {
      const response = await apiRequest<{ services: Array<Configuration["service"]> }>("/services");
      setServices(response.services.filter((service) => service.statut === "OUVERT"));
      if (!response.services.some((service) => service.statut === "OUVERT")) {
        setNotice("Aucun service ouvert ne vous est attribué. Contactez votre gestionnaire.");
      }
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Chargement des services impossible.");
    } finally {
      setLoading(false);
    }
  }

  async function searchPrinters() {
    setPrinterBusy(true);
    setPrinterError("");
    setPrinterDevices([]);
    try {
      const devices = await printerService.scan();
      setPrinterDevices(devices);
      if (!devices.length) setNotice("Aucune imprimante BLE détectée. Vérifiez qu’elle est allumée et à proximité.");
    } catch (printerRequestError) {
      setPrinterError(printerRequestError instanceof Error ? printerRequestError.message : "Recherche Bluetooth impossible.");
    } finally {
      setPrinterBusy(false);
    }
  }

  async function connectPrinter(device: { deviceId: string; name: string }) {
    setPrinterBusy(true);
    setPrinterError("");
    try {
      const targets = await printerService.connect(device);
      setPrinterTargets(targets);
      setNotice(`Imprimante connectée : ${device.name}.`);
    } catch (printerRequestError) {
      setPrinterError(printerRequestError instanceof Error ? printerRequestError.message : "Connexion à l’imprimante impossible.");
    } finally {
      setPrinterBusy(false);
    }
  }

  async function reconnectPrinter() {
    setPrinterBusy(true);
    setPrinterError("");
    try {
      const targets = await printerService.reconnect();
      setPrinterTargets(targets);
      setNotice(`Imprimante reconnectée : ${printerService.getState().deviceName}.`);
    } catch (printerRequestError) {
      setPrinterError(printerRequestError instanceof Error ? printerRequestError.message : "Reconnexion impossible.");
    } finally {
      setPrinterBusy(false);
    }
  }

  async function disconnectPrinter() {
    setPrinterBusy(true);
    setPrinterError("");
    try {
      await printerService.disconnect();
      setPrinterTargets([]);
    } catch (printerRequestError) {
      setPrinterError(printerRequestError instanceof Error ? printerRequestError.message : "Déconnexion impossible.");
    } finally {
      setPrinterBusy(false);
    }
  }

  async function testPrint() {
    setPrinterBusy(true);
    setPrinterError("");
    try {
      await printerService.testPrint(paperWidthMm);
      setNotice("Données de test envoyées. Vérifiez le ticket sur papier.");
    } catch (printerRequestError) {
      setPrinterError(printerRequestError instanceof Error ? printerRequestError.message : "Test d’impression impossible.");
    } finally {
      setPrinterBusy(false);
    }
  }

  async function reprintSale(sale: StoredSale) {
    if (!store) return;
    setPrinterBusy(true);
    setPrinterError("");
    try {
      const configuration = await store.getConfiguration(sale.data.serviceId);
      if (!configuration) throw new Error("Configuration locale du service introuvable; réimpression impossible hors ligne.");
      await printerService.printTicket(printableTicket(sale.data, configuration), {
        widthMm: paperWidthMm,
        duplicate: true,
      });
      const duplicateCount = await store.recordDuplicatePrint(sale.data.clientVenteId);
      await reloadSales(config?.service.id);
      setNotice(`Ticket ${sale.data.numeroTicket} réimprimé en DUPLICATA (${duplicateCount}).`);
    } catch (printerRequestError) {
      setPrinterError(printerRequestError instanceof Error ? printerRequestError.message : "Réimpression impossible.");
    } finally {
      setPrinterBusy(false);
    }
  }

  async function openService(serviceId: string) {
    const receiverStore = store;
    if (!receiverStore) {
      setError("Le stockage local n’est pas encore prêt.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const configuration = await apiRequest<Configuration>(`/config-service?serviceId=${encodeURIComponent(serviceId)}`);
      if (!configuration.service.appareil) {
        throw new Error("Aucun appareil n’est attribué à ce service. Demandez au gestionnaire de l’associer.");
      }
      await receiverStore.saveConfiguration(configuration);
      setConfig(configuration);
      setBoardingId(configuration.service.sens === "ALLER"
        ? configuration.service.ligne.reperes[0]?.id ?? ""
        : configuration.service.ligne.reperes.at(-1)?.id ?? "");
      await reloadSales(serviceId);
      setScreen("dashboard");
      setNotice("Configuration téléchargée et enregistrée sur cet appareil.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Téléchargement de la configuration impossible.");
    } finally {
      setLoading(false);
    }
  }

  function farePreview() {
    if (!config) return null;
    try {
      return calculateFare({
        stops,
        boardingStopId: boardingId,
        destinationStopId: destinationId,
        direction: config.service.sens,
        unitFareGnf: config.tarif.montantGnf,
      });
    } catch {
      return null;
    }
  }

  async function confirmSale() {
    const receiverStore = store;
    if (!config || !session || !config.service.appareil || !receiverStore) return;
    const fare = farePreview();
    if (!fare) {
      setError("Choisissez une montée et une destination valides dans le sens du service.");
      setPreview(false);
      return;
    }
    setLoading(true);
    try {
      const sale = await receiverStore.createSale({
        clientVenteId: newUuid(),
        serviceId: config.service.id,
        appareilId: config.service.appareil.id,
        prefixeTicket: config.service.appareil.prefixeTicket,
        monteeRepereId: boardingId,
        destinationRepereId: destinationId,
        troncons: fare.segments,
        prixUnitaireGnf: fare.unitFareGnf,
        montantGnf: fare.amountGnf,
        vendueAtClient: new Date().toISOString(),
      });
      const updatedConfig = { ...config, lastBoardingStopId: destinationId };
      await receiverStore.saveConfiguration(updatedConfig);
      setConfig(updatedConfig);
      setBoardingId(destinationId);
      setDestinationId("");
      setPreview(false);
      setScreen("dashboard");
      await reloadSales(config.service.id);
      try {
        await printerService.printTicket(printableTicket(sale.data, config), { widthMm: paperWidthMm });
        setNotice("Vente enregistrée et données du ticket envoyées à l’imprimante.");
        setPrinterError("");
      } catch (printerRequestError) {
        const detail = printerRequestError instanceof Error ? ` ${printerRequestError.message}` : "";
        setPrinterError(`Vente ${sale.data.numeroTicket} enregistrée, mais impression non confirmée. Réimprimez-la depuis l’historique.${detail}`);
        setNotice("La vente reste enregistrée localement et sera synchronisée sans créer de doublon.");
      }
      if (online) void syncNow();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Impossible d’enregistrer la vente localement.");
    } finally {
      setLoading(false);
    }
  }

  async function finishService() {
    const receiverStore = store;
    if (!config || !receiverStore) return;
    const unsynced = await receiverStore.countUnsyncedSales(config.service.id);
    const warning = unsynced
      ? `Il reste ${unsynced} vente(s) non synchronisée(s). Terminer le service quand même ?`
      : "Terminer ce service ?";
    if (!window.confirm(warning)) return;
    setLoading(true);
    try {
      await apiRequest(`/services/${config.service.id}`, { method: "PATCH", body: { statut: "TERMINE" } });
      const finished = { ...config, service: { ...config.service, statut: "TERMINE" as const } };
      await receiverStore.saveConfiguration(finished);
      setConfig(null);
      setNotice(unsynced
        ? "Service terminé. Les ventes non synchronisées sont conservées sur l’appareil."
        : "Service terminé.");
      await loadServices();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Impossible de terminer le service.");
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    try {
      const current = getSession() as ReceiverSession | null;
      if (current) await apiRequest("/auth/logout", { method: "POST", body: { refreshToken: current.refreshToken } });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Déconnexion serveur impossible.");
    } finally {
      clearSession();
      setCurrentSession(null);
      setConfig(null);
      setSales([]);
    }
  }

  const currentSales = config ? sales.filter((sale) => sale.data.serviceId === config.service.id) : [];
  const unsyncedCount = currentSales.filter((sale) => sale.status !== "SYNCED").length;
  const todaySales = currentSales.filter((sale) => {
    const soldAt = new Date(sale.data.vendueAtClient);
    const today = new Date();
    return soldAt.getFullYear() === today.getFullYear()
      && soldAt.getMonth() === today.getMonth()
      && soldAt.getDate() === today.getDate();
  });
  const dayRevenue = todaySales
    .filter((sale) => sale.status !== "REJECTED")
    .reduce((sum, sale) => sum + sale.data.montantGnf, 0);
  const segmentsSummary = currentSales.reduce<Record<number, number>>((summary, sale) => {
    summary[sale.data.troncons] = (summary[sale.data.troncons] ?? 0) + 1;
    return summary;
  }, {});

  if (!session) {
    return (
      <main className="receiver-screen">
        <section className="receiver-card receiver-login">
          <div className="brand-mark">GB</div>
          <p className="eyebrow">ESPACE RECEVEUR</p>
          <h1>Connexion</h1>
          <p className="muted">Connectez-vous avant le départ pour charger le service et sa configuration hors ligne.</p>
          {error && <div className="receiver-alert" role="alert">{error}</div>}
          <form className="form-stack" onSubmit={signIn}>
            <label className="field">Identifiant<input autoComplete="username" required value={login} onChange={(event) => setLogin(event.target.value)} /></label>
            <label className="field">Mot de passe<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            <label className="field">Identifiant transporteur<input value={carrierId} onChange={(event) => setCarrierId(event.target.value)} placeholder="Requis pour un compte transporteur" /></label>
            <button className="button button-primary receiver-main-action" disabled={loading || !store}>{loading ? "Connexion…" : store ? "Se connecter" : "Initialisation…"}</button>
          </form>
          <Link className="receiver-link" href="/">Administration</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="receiver-screen">
      <div className="receiver-app">
        <header className="receiver-header">
          <div><p className="eyebrow">GOROHITECH · RECEVEUR</p><strong>{session.utilisateur.nom}</strong></div>
          <span className={online ? "receiver-network is-online" : "receiver-network"}>{online ? "En ligne" : "Hors ligne"}</span>
        </header>

        {error && <div className="receiver-alert" role="alert">{error}<button onClick={() => setError("")} aria-label="Fermer">×</button></div>}
        {notice && <div className="receiver-notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Fermer">×</button></div>}

        <section className="receiver-card receiver-printer-card">
          <div className="receiver-printer-heading">
            <h2>Imprimante Bluetooth</h2>
            <span className={`receiver-printer-state state-${printerStatus.state.toLowerCase()}`}>
              {printerStateLabels[printerStatus.state] ?? printerStatus.state}
            </span>
          </div>
          <p className="muted">
            {printerStatus.deviceName
              ? `Appareil : ${printerStatus.deviceName}`
              : "Aucune imprimante connectée."}
          </p>
          {!printerService.isAvailable() ? (
            <p className="receiver-empty">Le Bluetooth est disponible dans l’application Android, pas dans le navigateur.</p>
          ) : (
            <>
              <label className="field receiver-printer-width">
                Largeur du papier
                <select value={paperWidthMm} onChange={(event) => setPaperWidthMm(event.target.value === "80" ? 80 : 58)}>
                  <option value={58}>58 mm</option>
                  <option value={80}>80 mm</option>
                </select>
              </label>
              <div className="receiver-printer-actions">
                <button className="button button-quiet" onClick={() => void searchPrinters()} disabled={printerBusy}>
                  {printerStatus.state === "SCANNING" ? "Recherche…" : "Rechercher"}
                </button>
                {printerStatus.state !== "CONNECTED" && (
                  <button className="button button-quiet" onClick={() => void reconnectPrinter()} disabled={printerBusy}>
                    Reconnecter
                  </button>
                )}
                <button className="button button-primary" onClick={() => void testPrint()} disabled={printerBusy || printerStatus.state !== "CONNECTED"}>
                  Tester l’impression
                </button>
                {printerStatus.state === "CONNECTED" && (
                  <button className="button button-quiet" onClick={() => void disconnectPrinter()} disabled={printerBusy}>
                    Déconnecter
                  </button>
                )}
              </div>
              {printerTargets.length > 1 && (
                <label className="field receiver-printer-width">
                  Canal d’écriture
                  <select
                    value={printerStatus.target
                      ? `${printerStatus.target.serviceUuid}/${printerStatus.target.characteristicUuid}`
                      : ""}
                    onChange={(event) => {
                      const target = printerTargets.find((candidate) =>
                        `${candidate.serviceUuid}/${candidate.characteristicUuid}` === event.target.value);
                      if (!target) return;
                      try {
                        printerService.selectTarget(target);
                        setPrinterError("");
                      } catch (selectionError) {
                        setPrinterError(selectionError instanceof Error ? selectionError.message : "Canal d’écriture invalide.");
                      }
                    }}
                  >
                    {printerTargets.map((target) => (
                      <option key={`${target.serviceUuid}/${target.characteristicUuid}`} value={`${target.serviceUuid}/${target.characteristicUuid}`}>
                        {target.serviceUuid} · {target.characteristicUuid} ({target.writeMode === "WITH_RESPONSE" ? "avec réponse" : "sans réponse"})
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {printerDevices.length > 0 && (
                <div className="receiver-service-list">
                  {printerDevices.map((device) => (
                    <button
                      key={device.deviceId}
                      className="receiver-service-option"
                      onClick={() => void connectPrinter(device)}
                      disabled={printerBusy}
                    >
                      <strong>{device.name}</strong>
                      <span>Connecter cette imprimante BLE</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {(printerError || printerStatus.message) && (
            <p className="receiver-printer-error" role="alert">{printerError || printerStatus.message}</p>
          )}
        </section>

        {!config ? (
          <section className="receiver-card">
            <h1>Ouvrir un service</h1>
            <p className="muted">Téléchargez une configuration active avant de commencer les ventes.</p>
            <button className="button button-quiet receiver-main-action" onClick={() => void loadServices()} disabled={loading}>Actualiser les services</button>
            {services.length ? <div className="receiver-service-list">{services.map((service) => (
              <button key={service.id} className="receiver-service-option" onClick={() => void openService(service.id)} disabled={loading}>
                <strong>{service.bus.code} · {service.ligne.nom}</strong><span>{service.sens === "ALLER" ? "Aller" : "Retour"} · {new Date(service.debutAt).toLocaleString("fr-FR")}</span>
              </button>
            ))}</div> : <p className="receiver-empty">Aucun service disponible. Connectez-vous pour actualiser.</p>}
            <button className="receiver-link receiver-logout" onClick={() => void signOut()}>Se déconnecter</button>
          </section>
        ) : (
          <>
            <section className="receiver-card receiver-trip-card">
              <div><p className="eyebrow">SERVICE ACTIF · {config.service.sens === "ALLER" ? "ALLER" : "RETOUR"}</p><h1>{config.service.bus.code} · {config.service.ligne.nom}</h1></div>
              <div className="receiver-metrics"><div><span>Tickets du service</span><strong>{currentSales.length}</strong></div><div><span>Recettes du jour</span><strong>{formatGnf(dayRevenue)}</strong></div><div><span>À synchroniser</span><strong>{unsyncedCount}</strong></div></div>
              <div className="receiver-actions">
                <button className="button button-primary receiver-main-action" onClick={() => { setDestinationId(""); setPreview(false); setScreen("sale"); }}>Nouvelle vente</button>
                <button className="button button-quiet" onClick={() => { setScreen("history"); void reloadSales(config.service.id); }}>Historique</button>
                <button className="button button-quiet" onClick={() => void syncNow()} disabled={syncing || !online}>{syncing ? "Synchronisation…" : "Synchroniser"}</button>
              </div>
            </section>

            {screen === "sale" && (
              <section className="receiver-card">
                <h2>Nouvelle vente</h2>
                {!preview ? (
                  <div className="receiver-sale-form">
                    <label className="field">Montée<select value={boardingId} onChange={(event) => { setBoardingId(event.target.value); setDestinationId(""); }}><option value="">Choisir un repère</option>{stops.map((stop) => <option key={stop.id} value={stop.id}>{stop.nom}</option>)}</select></label>
                    <label className="field">Destination<select value={destinationId} onChange={(event) => setDestinationId(event.target.value)}><option value="">Choisir une destination</option>{availableDestinations.map((stop) => <option key={stop.id} value={stop.id}>{stop.nom}</option>)}</select></label>
                    <div className="receiver-fare">{farePreview() ? formatGnf(farePreview()!.amountGnf) : "Choisissez votre trajet"}</div>
                    <button className="button button-primary receiver-main-action" onClick={() => { if (!farePreview()) setError("Choisissez une montée et une destination valides."); else { setError(""); setPreview(true); } }}>Confirmer le trajet</button>
                    <button className="receiver-link" onClick={() => setScreen("dashboard")}>Annuler</button>
                  </div>
                ) : (
                  <div className="receiver-confirm">
                    <p>Encaissez <strong>{formatGnf(farePreview()!.amountGnf)}</strong> pour le trajet <strong>{stops.find((stop) => stop.id === boardingId)?.nom}</strong> → <strong>{stops.find((stop) => stop.id === destinationId)?.nom}</strong> ({farePreview()!.segments} tronçon(s) × {formatGnf(config.tarif.montantGnf)}).</p>
                    <button className="button button-quiet receiver-main-action" onClick={() => setPreview(false)}>Modifier</button>
                    <button className="button button-primary receiver-main-action" onClick={() => void confirmSale()} disabled={loading}>{loading ? "Enregistrement…" : "Confirmer l’encaissement"}</button>
                  </div>
                )}
              </section>
            )}

            {screen === "history" && (
              <section className="receiver-card">
                <h2>Historique du service</h2>
                {currentSales.length ? <div className="receiver-history">{currentSales.map((sale) => (
                  <article key={sale.data.clientVenteId}>
                    <div><strong>{sale.data.numeroTicket}</strong><span>{new Date(sale.data.vendueAtClient).toLocaleString("fr-FR")}</span></div>
                    <div><strong>{formatGnf(sale.data.montantGnf)}</strong><span>{stops.find((stop) => stop.id === sale.data.monteeRepereId)?.nom ?? "Montée"} → {stops.find((stop) => stop.id === sale.data.destinationRepereId)?.nom ?? "Destination"}</span><span>{sale.status === "SYNCED" ? "Synchronisée" : sale.status === "REJECTED" ? `Refusée : ${sale.message}` : "En attente"}</span></div>
                    {sale.serverResult?.ecartHorlogeImportant && <p className="receiver-warning">Horloge décalée de {Math.round((sale.serverResult.ecartHorlogeMs ?? 0) / 1000)} s à la synchronisation.</p>}
                    {sale.status === "REJECTED" && <button className="receiver-link" onClick={async () => { if (!store) return; await store.retrySale(sale.data.clientVenteId); await reloadSales(config.service.id); }}>Réessayer la synchronisation</button>}
                    <button className="receiver-link" onClick={() => void reprintSale(sale)} disabled={printerBusy || printerStatus.state !== "CONNECTED"}>
                      Réimprimer en DUPLICATA{sale.duplicateCount ? ` (${sale.duplicateCount})` : ""}
                    </button>
                  </article>
                ))}</div> : <p className="receiver-empty">Aucune vente enregistrée pour ce service.</p>}
                <button className="receiver-link" onClick={() => setScreen("dashboard")}>Retour au tableau de bord</button>
              </section>
            )}

            <section className="receiver-card receiver-end-service">
              <h2>Fin de service</h2>
              <p>{currentSales.length} ticket(s) · {formatGnf(currentSales.reduce((sum, sale) => sum + sale.data.montantGnf, 0))} · {unsyncedCount} vente(s) non synchronisée(s)</p>
              <p>Tronçons : {Object.keys(segmentsSummary).length
                ? Object.entries(segmentsSummary).sort(([left], [right]) => Number(left) - Number(right)).map(([segments, count]) => `${segments} tronçon(s) : ${count}`).join(" · ")
                : "aucune vente"}</p>
              <button className="button button-danger receiver-main-action" onClick={() => void finishService()} disabled={loading}>Terminer le service</button>
            </section>
            <button className="receiver-link receiver-logout" onClick={() => void signOut()}>Se déconnecter</button>
          </>
        )}
      </div>
    </main>
  );
}
