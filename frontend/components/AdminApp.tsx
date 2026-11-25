"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { clearSession, getSession, setSession } from "../services/api.js";
import { formatDate, formatGnf, pagesForRole, translateApiError, validateStops } from "../../shared/admin-utils.js";
import { getSaleDetail, loadAdminPage, login, logout as logoutApi, runAdminAction } from "../features/admin/admin.api";
import AdminFeaturePages from "../features/admin/AdminFeaturePages";
import Dashboard from "../features/admin/dashboard/Dashboard";
import { Button, ConfirmDialog, Field, PromptDialog, type ConfirmRequest, type PromptRequest } from "../features/admin/admin-ui";
import type { Account, Bus, Carrier, Data, Device, Line, Report, Sale, SaleDetail, Service, Session, Stop, Tariff } from "../features/admin/types";

const today = new Date().toISOString().slice(0, 10);
const emptyStops: Stop[] = [
  { nom: "", position: 0 },
  { nom: "", position: 1 },
];

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
    return translateApiError(code, error.message);
  }
  return "Une erreur inattendue est survenue.";
}

export default function AdminApp() {
  const [session, setCurrentSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [selectedPage, setSelectedPage] = useState("");
  const [data, setData] = useState<Data>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});
  const [editingBus, setEditingBus] = useState<Bus | null>(null);
  const [editingLine, setEditingLine] = useState<Line | null>(null);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [stops, setStops] = useState<Stop[]>(emptyStops);
  const [validatedNetworkSnapshot, setValidatedNetworkSnapshot] = useState<string | null>(null);
  const [simBoarding, setSimBoarding] = useState("");
  const [simDestination, setSimDestination] = useState("");
  const [simDirection, setSimDirection] = useState<"ALLER" | "RETOUR">("ALLER");
  const [simFare, setSimFare] = useState("2000");
  const [salesFrom, setSalesFrom] = useState(today);
  const [salesTo, setSalesTo] = useState(today);
  const [salesPage, setSalesPage] = useState(1);
  const [salesBusId, setSalesBusId] = useState("");
  const [salesLineId, setSalesLineId] = useState("");
  const [salesReceiverId, setSalesReceiverId] = useState("");
  const [salesStatus, setSalesStatus] = useState("");
  const [saleDetail, setSaleDetail] = useState<SaleDetail | null>(null);
  const [loginValues, setLoginValues] = useState({ login: "", motDePasse: "", transporteurId: "" });
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [promptRequest, setPromptRequest] = useState<PromptRequest | null>(null);

  function requestConfirm(message: string, onConfirm: () => void) {
    setConfirmRequest({ message, onConfirm });
  }
  function requestPrompt(message: string, onSubmit: (value: string) => void, inputType?: "text" | "password") {
    setPromptRequest({ message, onSubmit, inputType });
  }

  const pages = useMemo(() => pagesForRole(session?.utilisateur.role ?? ""), [session]);
  const user = session?.utilisateur;
  const networkSnapshot = JSON.stringify({
    nom: form.nom ?? "",
    stops: stops.map(({ nom, position }) => ({ nom, position })),
  });
  const networkValidated = validatedNetworkSnapshot === networkSnapshot;

  const loadPage = useCallback(async (page: string, from = salesFrom, to = salesTo, pageNumber = salesPage) => {
    if (!page) return;
    setLoading(true);
    setError("");
    try {
      const payload = await loadAdminPage({
        page,
        from,
        to,
        pageNumber,
        busId: salesBusId,
        lineId: salesLineId,
        receiverId: salesReceiverId,
        status: salesStatus,
        role: user?.role,
      });
      setData((current) => ({ ...current, [page]: payload }));
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [salesBusId, salesFrom, salesLineId, salesPage, salesReceiverId, salesStatus, salesTo, user]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = getSession() as Session | null;
        if (saved) {
          setCurrentSession(saved);
          const firstPage = pagesForRole(saved.utilisateur.role)[0]?.id ?? "";
          setSelectedPage(firstPage);
        }
      } catch (sessionError) {
        setError(getErrorMessage(sessionError));
      } finally {
        setReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!session || !selectedPage) return;
    const timer = window.setTimeout(() => void loadPage(selectedPage), 0);
    return () => window.clearTimeout(timer);
  }, [session, selectedPage, loadPage]);

  const setValue = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await login({
        login: loginValues.login,
        motDePasse: loginValues.motDePasse,
        ...(loginValues.transporteurId.trim() ? { transporteurId: loginValues.transporteurId.trim() } : {}),
      });
      setSession(result);
      setCurrentSession(result);
      const firstPage = pagesForRole(result.utilisateur.role)[0]?.id ?? "";
      setSelectedPage(firstPage);
      setData({});
      setNotice("");
      setLoginValues({ login: "", motDePasse: "", transporteurId: "" });
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    setError("");
    try {
      await logoutApi();
      clearSession();
      setCurrentSession(null);
      setData({});
      setSelectedPage("");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  async function runAction(path: string, method: "POST" | "PATCH" | "DELETE", body: unknown, success: string, page = selectedPage) {
    setError("");
    setNotice("");
    setLoading(true);
    try {
      await runAdminAction(path, method, body);
      setNotice(success);
      setForm({});
      setEditingBus(null);
      setEditingLine(null);
      setEditingDevice(null);
      setValidatedNetworkSnapshot(null);
      await loadPage(page);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  function choosePage(page: string) {
    setSelectedPage(page);
    setError("");
    setNotice("");
    setForm({});
    setEditingBus(null);
    setEditingLine(null);
    setEditingDevice(null);
    setSaleDetail(null);
  }

  async function showSaleDetail(id: string) {
    setLoading(true);
    setError("");
    try {
      setSaleDetail(await getSaleDetail(id));
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function handleBusSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = {
      code: form.code?.trim(),
      nom: form.nom?.trim(),
      ...(form.versementAttenduGnf?.trim()
        ? { versementAttenduGnf: Number(form.versementAttenduGnf) }
        : { versementAttenduGnf: null }),
    };
    const submit = () => runAction(
      editingBus ? `/bus/${editingBus.id}` : "/bus",
      editingBus ? "PATCH" : "POST",
      body,
      editingBus ? "Bus modifié." : "Bus créé.",
    );
    if (editingBus) requestConfirm("Confirmer la modification de ce bus ?", () => void submit());
    else await submit();
  }

  async function handleLineSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const stopErrors = validateStops(stops);
    if (!form.nom?.trim()) stopErrors.unshift("Le nom de la ligne est obligatoire.");
    if (stopErrors.length) {
      setError(stopErrors.join(" "));
      return;
    }
    if (!networkValidated) {
      setError("Validez le réseau avant d’enregistrer la ligne.");
      return;
    }
    const normalizedStops = stops.map((stop) => ({ nom: stop.nom.trim(), position: Number(stop.position) }));
    const submit = () => runAction(
      editingLine ? `/lignes/${editingLine.id}` : "/lignes",
      editingLine ? "PATCH" : "POST",
      { nom: form.nom.trim(), reperes: normalizedStops },
      editingLine ? "Ligne modifiée." : "Ligne créée.",
    );
    if (editingLine) requestConfirm("Confirmer la modification de la ligne et de ses repères ?", () => void submit());
    else await submit();
  }

  function validateNetwork() {
    setError("");
    setNotice("");
    const errors = [
      ...(!form.nom?.trim() ? ["Le nom de la ligne est obligatoire."] : []),
      ...validateStops(stops),
    ];
    if (errors.length) {
      setValidatedNetworkSnapshot(null);
      setError(errors.join(" "));
      return;
    }
    setValidatedNetworkSnapshot(networkSnapshot);
    setNotice("Réseau validé : les repères sont cohérents et ordonnés.");
  }

  async function handleTariffSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(form.montantGnf);
    const effectiveDate = form.dateEffet ? new Date(form.dateEffet) : new Date();
    if (!Number.isSafeInteger(amount) || amount <= 0 || Number.isNaN(effectiveDate.getTime())) {
      setError("Saisissez un montant GNF positif et une date d’effet valide.");
      return;
    }
    requestConfirm(
      `Confirmer le nouveau tarif de ${formatGnf(amount)} à partir du ${formatDate(effectiveDate, { dateStyle: "long" })} ?`,
      () => void runAction("/tarifs", "POST", { montantGnf: amount, dateEffet: effectiveDate.toISOString() }, "Nouveau tarif enregistré avec son historique."),
    );
  }

  async function handleUserSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction("/utilisateurs", "POST", {
      login: form.login?.trim(),
      nom: form.nom?.trim(),
      motDePasse: form.motDePasse,
      role: form.role,
      ...(form.telephone?.trim() ? { telephone: form.telephone.trim() } : {}),
    }, "Utilisateur créé.");
  }

  async function handleDeviceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = {
      nom: form.nom?.trim(),
      receveurId: form.receveurId || null,
      ...(!editingDevice ? { prefixeTicket: form.prefixeTicket?.trim().toUpperCase() } : {}),
    };
    const submit = () => runAction(
      editingDevice ? `/appareils/${editingDevice.id}` : "/appareils",
      editingDevice ? "PATCH" : "POST",
      body,
      editingDevice ? "Appareil modifié." : "Appareil créé.",
    );
    if (editingDevice) requestConfirm(`Confirmer la modification de ${editingDevice.nom} ?`, () => void submit());
    else await submit();
  }

  async function handleServiceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction("/services", "POST", {
      busId: form.busId,
      ligneId: form.ligneId,
      receveurId: form.receveurId,
      sens: form.sens || "ALLER",
      ...(form.appareilId ? { appareilId: form.appareilId } : {}),
    }, "Service ouvert.");
  }

  async function handleCarrierSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction("/transporteurs", "POST", {
      nom: form.nom?.trim(),
      loginPrincipal: form.loginPrincipal?.trim(),
      nomPrincipal: form.nomPrincipal?.trim(),
      motDePassePrincipal: form.motDePassePrincipal,
    }, "Transporteur créé.");
  }

  if (!ready) return <main className="loading-screen">Chargement…</main>;
  if (!session) {
    return (
      <main className="login-screen">
        <div className="login-decoration" aria-hidden="true" />
        <section className="login-card">
          <div className="brand-mark">G</div>
          <p className="eyebrow">GOROHITECH · BILLETTERIE</p>
          <h1>Votre espace de gestion</h1>
          <p className="muted">Connectez-vous pour suivre vos bus, vos ventes et vos recettes.</p>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <form className="form-stack" onSubmit={submitLogin}>
            <Field label="Identifiant" autoComplete="username" value={loginValues.login} onChange={(event) => setLoginValues({ ...loginValues, login: event.target.value })} required />
            <Field label="Mot de passe" type="password" autoComplete="current-password" value={loginValues.motDePasse} onChange={(event) => setLoginValues({ ...loginValues, motDePasse: event.target.value })} required />
            <Field label="Identifiant transporteur (pour un compte transporteur)" value={loginValues.transporteurId} onChange={(event) => setLoginValues({ ...loginValues, transporteurId: event.target.value })} />
            <Button type="submit" disabled={loading}>{loading ? "Connexion…" : "Se connecter"} <span aria-hidden="true">→</span></Button>
          </form>
          <p className="login-footnote">La sécurité des accès est vérifiée par le serveur.</p>
        </section>
      </main>
    );
  }

  if (!pages.length) {
    return (
      <main className="login-screen">
        <section className="login-card">
          <div className="brand-mark">G</div>
          <h1>Accès à l’administration non autorisé</h1>
          <p className="muted">Le rôle « {user?.role} » n’a pas accès à l’administration web.</p>
          <Button variant="quiet" onClick={logout}>Se déconnecter</Button>
        </section>
      </main>
    );
  }

  const currentPage = pages.find((page) => page.id === selectedPage) ?? pages[0];
  const sectionData = (data[selectedPage] ?? {}) as Data;
  const busRows = (sectionData.bus ?? []) as Bus[];
  const lineRows = (sectionData.lignes ?? []) as Line[];
  const tariffRows = (sectionData.tarifs ?? []) as Tariff[];
  const userRows = (sectionData.utilisateurs ?? []) as Account[];
  const deviceRows = (sectionData.appareils ?? []) as Device[];
  const serviceRows = (sectionData.services ?? []) as Service[];
  const saleRows = (sectionData.ventes ?? []) as Sale[];
  const carrierRows = (sectionData.transporteurs ?? []) as Carrier[];

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">G</div>
          <div><strong>GOROHI</strong><small>GESTION · BUS</small></div>
        </div>
        <div className="sidebar-caption">ESPACE DE TRAVAIL</div>
        <nav className="main-nav" aria-label="Navigation principale">
          {pages.map((page, index) => (
            <button key={page.id} className={`nav-item ${selectedPage === page.id ? "active" : ""}`} onClick={() => choosePage(page.id)}>
              <span className="nav-number">{String(index + 1).padStart(2, "0")}</span>{page.label}
              {selectedPage === page.id && <span className="nav-active-mark" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="online-indicator"><i /> Espace sécurisé</div>
          <button className="logout-link" onClick={logout}>↗ <span>Se déconnecter</span></button>
          <div className="profile-chip">
            <div className="avatar">{user?.nom?.slice(0, 1).toUpperCase()}</div>
            <div><strong>{user?.nom}</strong><small>{user?.role?.replace("_", " ")}</small></div>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>Administration</span><b>/</b><strong>{currentPage.label}</strong></div>
          <div className="topbar-right">
            <span className="topbar-date">{formatDate(new Date(), { dateStyle: "full" })}</span>
            <span className="avatar avatar-small">{user?.nom?.slice(0, 1).toUpperCase()}</span>
          </div>
        </header>
        <div className="page-content">
          {(error || notice) && (
            <div className={`alert ${error ? "alert-error" : "alert-success"}`} role={error ? "alert" : "status"}>
              <span>{error || notice}</span>
              {error && <button className="alert-close" onClick={() => setError("")} aria-label="Fermer">×</button>}
            </div>
          )}
          {loading && <div className="loading-bar"><span /></div>}

          {selectedPage === "dashboard" && (
            <Dashboard
              report={sectionData.dashboard as Report | undefined}
              buses={sectionData.buses as Bus[] | undefined}
              services={sectionData.services as Service[] | undefined}
              role={user?.role ?? ""}
              from={salesFrom}
              to={salesTo}
              setFrom={setSalesFrom}
              setTo={setSalesTo}
              refresh={() => void loadPage("dashboard", salesFrom, salesTo)}
              setError={setError}
              loading={loading}
            />
          )}

          <AdminFeaturePages
            page={selectedPage}
            role={user?.role ?? ""}
            data={sectionData}
            form={form}
            setValue={setValue}
            clearForm={() => setForm({})}
            loading={loading}
            runAction={runAction}
            setError={setError}
            requestConfirm={requestConfirm}
            requestPrompt={requestPrompt}
            busRows={busRows}
            lineRows={lineRows}
            tariffRows={tariffRows}
            userRows={userRows}
            deviceRows={deviceRows}
            serviceRows={serviceRows}
            saleRows={saleRows}
            carrierRows={carrierRows}
            onBusSubmit={handleBusSubmit}
            onLineSubmit={handleLineSubmit}
            onTariffSubmit={handleTariffSubmit}
            onUserSubmit={handleUserSubmit}
            onDeviceSubmit={handleDeviceSubmit}
            onServiceSubmit={handleServiceSubmit}
            onCarrierSubmit={handleCarrierSubmit}
            editingBus={editingBus}
            setEditingBus={setEditingBus}
            editingLine={editingLine}
            setEditingLine={setEditingLine}
            editingDevice={editingDevice}
            setEditingDevice={setEditingDevice}
            stops={stops}
            setStops={setStops}
            resetStops={emptyStops}
            networkValidated={networkValidated}
            validateNetwork={validateNetwork}
            clearNetworkValidation={() => setValidatedNetworkSnapshot(null)}
            simBoarding={simBoarding}
            setSimBoarding={setSimBoarding}
            simDestination={simDestination}
            setSimDestination={setSimDestination}
            simDirection={simDirection}
            setSimDirection={setSimDirection}
            simFare={simFare}
            setSimFare={setSimFare}
            today={today}
            salesFrom={salesFrom}
            setSalesFrom={setSalesFrom}
            salesTo={salesTo}
            setSalesTo={setSalesTo}
            salesPage={salesPage}
            setSalesPage={setSalesPage}
            salesBusId={salesBusId}
            setSalesBusId={setSalesBusId}
            salesLineId={salesLineId}
            setSalesLineId={setSalesLineId}
            salesReceiverId={salesReceiverId}
            setSalesReceiverId={setSalesReceiverId}
            salesStatus={salesStatus}
            setSalesStatus={setSalesStatus}
            loadSales={(pageNumber) => { void loadPage("ventes", salesFrom, salesTo, pageNumber); }}
            saleDetail={saleDetail}
            setSaleDetail={setSaleDetail}
            showSaleDetail={(id) => { void showSaleDetail(id); }}
          />
          <ConfirmDialog request={confirmRequest} onClose={() => setConfirmRequest(null)} />
          <PromptDialog request={promptRequest} onClose={() => setPromptRequest(null)} />
        </div>
        <footer className="page-footer"><span>Gorohitech · Billetterie de bus</span><span>Interface d’administration · Accès protégé</span></footer>
      </main>
    </div>
  );
}
