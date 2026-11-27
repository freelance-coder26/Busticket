"use client";

import type { Dispatch, FormEvent, SetStateAction } from "react";
import { formatDate, formatGnf, simulateFare, translateApiError, validateCancellationReason } from "../../../shared/admin-utils.js";
import { Button, Empty, Field, PageHeading, Panel, PanelTitle, SelectField, Status, Table } from "./admin-ui";
import type { Account, AuditEvent, Bus, Carrier, Data, Device, Line, Sale, SaleDetail, Service, Stop, Tariff } from "./types";

type Props = {
  page: string;
  role: string;
  data: Data;
  form: Record<string, string>;
  setValue: (key: string, value: string) => void;
  clearForm: () => void;
  loading: boolean;
  runAction: (path: string, method: "POST" | "PATCH" | "DELETE", body: unknown, success: string) => Promise<void>;
  setError: (message: string) => void;
  busRows: Bus[];
  lineRows: Line[];
  tariffRows: Tariff[];
  userRows: Account[];
  deviceRows: Device[];
  serviceRows: Service[];
  saleRows: Sale[];
  carrierRows: Carrier[];
  onBusSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onLineSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTariffSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUserSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDeviceSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onServiceSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCarrierSubmit: (event: FormEvent<HTMLFormElement>) => void;
  editingBus: Bus | null;
  setEditingBus: (bus: Bus | null) => void;
  editingLine: Line | null;
  setEditingLine: (line: Line | null) => void;
  editingDevice: Device | null;
  setEditingDevice: (device: Device | null) => void;
  stops: Stop[];
  setStops: Dispatch<SetStateAction<Stop[]>>;
  resetStops: Stop[];
  networkValidated: boolean;
  validateNetwork: () => void;
  clearNetworkValidation: () => void;
  simBoarding: string;
  setSimBoarding: (value: string) => void;
  simDestination: string;
  setSimDestination: (value: string) => void;
  simDirection: "ALLER" | "RETOUR";
  setSimDirection: (value: "ALLER" | "RETOUR") => void;
  simFare: string;
  setSimFare: (value: string) => void;
  today: string;
  salesFrom: string;
  setSalesFrom: (value: string) => void;
  salesTo: string;
  setSalesTo: (value: string) => void;
  salesPage: number;
  setSalesPage: (value: number) => void;
  salesBusId: string;
  setSalesBusId: (value: string) => void;
  salesLineId: string;
  setSalesLineId: (value: string) => void;
  salesReceiverId: string;
  setSalesReceiverId: (value: string) => void;
  salesStatus: string;
  setSalesStatus: (value: string) => void;
  loadSales: (pageNumber: number) => void;
  saleDetail: SaleDetail | null;
  setSaleDetail: (sale: SaleDetail | null) => void;
  showSaleDetail: (id: string) => void;
};

function getSimulationResult(stops: Stop[], boardingStopId: string, destinationStopId: string, direction: "ALLER" | "RETOUR", unitFareGnf: number) {
  try {
    return {
      result: simulateFare({
        stops: stops.map((stop, index) => ({ id: stop.id ?? `editor-${index}`, nom: stop.nom, position: Number(stop.position) })),
        boardingStopId,
        destinationStopId,
        direction,
        unitFareGnf,
      }),
      error: "",
    };
  } catch (error) {
    if (error instanceof Error) {
      const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
      return { result: null, error: translateApiError(code, error.message) };
    }
    return { result: null, error: "Une erreur inattendue est survenue." };
  }
}

export default function AdminFeaturePages(props: Props) {
  const {
    page, role, data, form, setValue, clearForm, loading, runAction, setError,
    busRows, lineRows, tariffRows, userRows, deviceRows, serviceRows, saleRows, carrierRows,
    onBusSubmit, onLineSubmit, onTariffSubmit, onUserSubmit, onDeviceSubmit, onServiceSubmit, onCarrierSubmit,
    editingBus, setEditingBus, editingLine, setEditingLine, editingDevice, setEditingDevice,
    stops, setStops, resetStops, networkValidated, validateNetwork, clearNetworkValidation,
    simBoarding, setSimBoarding, simDestination, setSimDestination, simDirection, setSimDirection, simFare, setSimFare,
    today, salesFrom, setSalesFrom, salesTo, setSalesTo, salesPage, setSalesPage,
    salesBusId, setSalesBusId, salesLineId, setSalesLineId, salesReceiverId, setSalesReceiverId, salesStatus, setSalesStatus,
    loadSales, saleDetail, setSaleDetail, showSaleDetail,
  } = props;

  if (page === "bus") return (
    <>
      <PageHeading eyebrow="FLOTTE" title="Gestion des bus" description="Suivez les véhicules et définissez leur versement journalier attendu." />
      <Panel>
        <h2>{editingBus ? "Modifier le bus" : "Ajouter un bus"}</h2>
        <form className="form-grid" onSubmit={onBusSubmit}>
          <Field label="Code du bus" value={form.code ?? ""} onChange={(event) => setValue("code", event.target.value)} required />
          <Field label="Nom / désignation" value={form.nom ?? ""} onChange={(event) => setValue("nom", event.target.value)} required />
          <Field label="Versement attendu / jour (GNF)" type="number" min="1" value={form.versementAttenduGnf ?? ""} onChange={(event) => setValue("versementAttenduGnf", event.target.value)} />
          <div className="form-actions"><Button type="submit" disabled={loading}>{editingBus ? "Enregistrer" : "Créer le bus"}</Button>{editingBus && <Button variant="quiet" type="button" onClick={() => { setEditingBus(null); clearForm(); }}>Annuler</Button>}</div>
        </form>
      </Panel>
      <Panel><PanelTitle title="Parc de bus" count={busRows.length} />
        {busRows.length === 0 ? <Empty /> : <Table><thead><tr><th>BUS</th><th>VERSEMENT ATTENDU</th><th>STATUT</th><th /></tr></thead><tbody>
          {busRows.map((bus) => <tr key={bus.id}>
            <td><strong>{bus.code}</strong><small className="table-sub">{bus.nom}</small></td>
            <td>{bus.versementAttenduGnf == null ? "Non défini" : formatGnf(bus.versementAttenduGnf)}</td>
            <td><Status active={bus.actif} /></td>
            <td className="row-actions">
              <Button variant="quiet" onClick={() => { setEditingBus(bus); setValue("code", bus.code); setValue("nom", bus.nom); setValue("versementAttenduGnf", bus.versementAttenduGnf?.toString() ?? ""); }}>Modifier</Button>
              <Button variant="quiet" onClick={() => { if (window.confirm(`Confirmer la ${bus.actif ? "désactivation" : "activation"} du bus ${bus.code} ?`)) void runAction(`/bus/${bus.id}`, "PATCH", { actif: !bus.actif }, bus.actif ? "Bus désactivé." : "Bus activé."); }}>{bus.actif ? "Désactiver" : "Activer"}</Button>
              <Button variant="danger" onClick={() => { if (window.confirm(`Supprimer le bus ${bus.code} ?`)) void runAction(`/bus/${bus.id}`, "DELETE", undefined, "Bus supprimé."); }}>Supprimer</Button>
            </td>
          </tr>)}
        </tbody></Table>}
      </Panel>
    </>
  );

  if (page === "lignes") return (
    <>
      <PageHeading eyebrow="RÉSEAU" title="Lignes & repères" description="Ordonnez les repères puis simulez un trajet avant d’enregistrer la ligne." />
      <div className="two-column">
        <Panel>
          <h2>{editingLine ? "Modifier la ligne" : "Nouvelle ligne"}</h2>
          <form className="form-stack" onSubmit={onLineSubmit}>
            <Field label="Nom de la ligne" value={form.nom ?? ""} onChange={(event) => setValue("nom", event.target.value)} required />
            <div className="stops-heading"><span>REPÈRES ORDONNÉS</span><button type="button" className="text-button" onClick={() => setStops((current) => [...current, { nom: "", position: current.length ? Number(current[current.length - 1].position) + 1 : 0 }])}>+ Ajouter un repère</button></div>
            <div className="stop-editor">{stops.map((stop, index) => <div className="stop-row" key={`${index}-${stop.id ?? "new"}`}>
              <span className="stop-index">{String(index + 1).padStart(2, "0")}</span>
              <input aria-label={`Nom du repère ${index + 1}`} placeholder="Nom du repère" value={stop.nom} onChange={(event) => setStops((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, nom: event.target.value } : item))} />
              <input aria-label={`Position du repère ${index + 1}`} type="number" step="1" value={stop.position} onChange={(event) => setStops((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, position: event.target.value } : item))} />
              <button className="remove-stop" type="button" aria-label={`Retirer le repère ${index + 1}`} onClick={() => setStops((current) => current.length > 2 ? current.filter((_, itemIndex) => itemIndex !== index) : current)}>×</button>
            </div>)}</div>
            <p className="muted" role="status">{networkValidated ? "Réseau validé. Vous pouvez enregistrer la ligne." : "Validez le réseau après chaque modification avant d’enregistrer."}</p>
            <div className="form-actions">
              <Button variant="quiet" type="button" onClick={validateNetwork} disabled={loading}>Valider le réseau</Button>
              <Button type="submit" disabled={loading || !networkValidated}>{editingLine ? "Enregistrer la ligne" : "Créer la ligne"}</Button>
              {editingLine && <Button variant="quiet" type="button" onClick={() => { setEditingLine(null); clearForm(); setStops(resetStops); clearNetworkValidation(); }}>Annuler</Button>}
            </div>
          </form>
        </Panel>
        <Panel className="simulator-panel">
          <div className="simulator-icon">↔</div><p className="eyebrow">OUTIL DE CONTRÔLE</p><h2>Simulateur de prix</h2>
          <p className="muted">Le montant est calculé par le module tarifaire partagé avec le backend.</p>
          <div className="form-stack">
            <SelectField label="Sens" value={simDirection} onChange={(event) => setSimDirection(event.target.value as "ALLER" | "RETOUR")}><option value="ALLER">Aller</option><option value="RETOUR">Retour</option></SelectField>
            <SelectField label="Montée" value={simBoarding} onChange={(event) => setSimBoarding(event.target.value)}><option value="">Choisir un repère</option>{stops.map((stop, index) => <option key={index} value={stop.id ?? `editor-${index}`}>{stop.nom || `Repère ${index + 1}`}</option>)}</SelectField>
            <SelectField label="Destination" value={simDestination} onChange={(event) => setSimDestination(event.target.value)}><option value="">Choisir un repère</option>{stops.map((stop, index) => <option key={index} value={stop.id ?? `editor-${index}`}>{stop.nom || `Repère ${index + 1}`}</option>)}</SelectField>
            <Field label="Tarif par tronçon (GNF)" type="number" min="1" value={simFare} onChange={(event) => setSimFare(event.target.value)} />
            <div className="simulator-result">{(() => {
              const { result, error } = getSimulationResult(stops, simBoarding, simDestination, simDirection, Number(simFare));
              return result
                ? <><span>{result.segments} tronçon{result.segments > 1 ? "s" : ""}</span><strong>{formatGnf(result.amountGnf)}</strong></>
                : <span className="muted">{error}</span>;
            })()}</div>
          </div>
        </Panel>
      </div>
      <Panel><PanelTitle title="Lignes configurées" count={lineRows.length} />
        {lineRows.length === 0 ? <Empty /> : <Table><thead><tr><th>LIGNE</th><th>REPÈRES</th><th>STATUT</th><th /></tr></thead><tbody>{lineRows.map((line) => <tr key={line.id}>
          <td><strong>{line.nom}</strong></td><td>{line.reperes.map((stop) => stop.nom).join(" → ")}</td><td><Status active={line.actif} /></td>
          <td className="row-actions">
            <Button variant="quiet" onClick={() => { setEditingLine(line); setValue("nom", line.nom); setStops(line.reperes.map((stop) => ({ ...stop }))); clearNetworkValidation(); }}>Modifier</Button>
            <Button variant="quiet" onClick={() => { if (window.confirm(`Confirmer la ${line.actif ? "désactivation" : "activation"} de la ligne ${line.nom} ?`)) void runAction(`/lignes/${line.id}`, "PATCH", { actif: !line.actif }, line.actif ? "Ligne désactivée." : "Ligne activée."); }}>{line.actif ? "Désactiver" : "Activer"}</Button>
            <Button variant="danger" onClick={() => { if (window.confirm(`Supprimer la ligne ${line.nom} ?`)) void runAction(`/lignes/${line.id}`, "DELETE", undefined, "Ligne supprimée."); }}>Supprimer</Button>
          </td>
        </tr>)}</tbody></Table>}
      </Panel>
    </>
  );

  if (page === "tarifs") return (
    <>
      <PageHeading eyebrow="TARIFICATION" title="Tarif par tronçon" description="Chaque changement prend effet à la date choisie et conserve l’historique." />
      <Panel className="tariff-current"><span className="eyebrow">TARIF EN VIGUEUR</span><strong>{tariffRows.find((tariff) => new Date(tariff.dateEffet) <= new Date()) ? formatGnf(tariffRows.find((tariff) => new Date(tariff.dateEffet) <= new Date())!.montantGnf) : formatGnf(2000)}</strong><span className="muted">par tronçon</span></Panel>
      <Panel><h2>Programmer un nouveau tarif</h2><form className="form-grid" onSubmit={onTariffSubmit}>
        <Field label="Montant par tronçon (GNF)" type="number" min="1" value={form.montantGnf ?? ""} onChange={(event) => setValue("montantGnf", event.target.value)} required />
        <Field label="Date d’effet" type="datetime-local" value={form.dateEffet ?? `${today}T00:00`} onChange={(event) => setValue("dateEffet", event.target.value)} required />
        <div className="form-actions"><Button type="submit" disabled={loading}>Confirmer le nouveau tarif</Button></div>
      </form></Panel>
      <Panel><PanelTitle title="Historique des tarifs" count={tariffRows.length} />
        {tariffRows.length === 0 ? <Empty>Le tarif par défaut est de 2 000 GNF par tronçon.</Empty> : <Table><thead><tr><th>MONTANT</th><th>DATE D’EFFET</th><th>ENREGISTRÉ LE</th></tr></thead><tbody>{tariffRows.map((tariff) => <tr key={tariff.id}><td><strong>{formatGnf(tariff.montantGnf)}</strong></td><td>{formatDate(tariff.dateEffet)}</td><td>{formatDate(tariff.createdAt)}</td></tr>)}</tbody></Table>}
      </Panel>
    </>
  );

  if (page === "utilisateurs") return (
    <>
      <PageHeading eyebrow="ÉQUIPE" title="Utilisateurs" description="Créez des comptes, gérez leur accès et réinitialisez leurs mots de passe." />
      <Panel><h2>Ajouter un utilisateur</h2><form className="form-grid" onSubmit={onUserSubmit}>
        <Field label="Nom complet" value={form.nom ?? ""} onChange={(event) => setValue("nom", event.target.value)} required />
        <Field label="Identifiant" value={form.login ?? ""} onChange={(event) => setValue("login", event.target.value)} required />
        <Field label="Téléphone (facultatif)" value={form.telephone ?? ""} onChange={(event) => setValue("telephone", event.target.value)} />
        <SelectField label="Rôle" value={form.role ?? "RECEVEUR"} onChange={(event) => setValue("role", event.target.value)}><option value="RECEVEUR">Receveur</option>{role === "TRANSPORTEUR" && <><option value="GESTIONNAIRE">Gestionnaire</option><option value="CONTROLEUR">Contrôleur</option></>}</SelectField>
        <Field label="Mot de passe initial (12 caractères minimum)" type="password" minLength={12} value={form.motDePasse ?? ""} onChange={(event) => setValue("motDePasse", event.target.value)} required />
        <div className="form-actions"><Button type="submit" disabled={loading}>Créer le compte</Button></div>
      </form></Panel>
      <Panel><PanelTitle title="Comptes" count={userRows.length} />
        {userRows.length === 0 ? <Empty /> : <Table><thead><tr><th>UTILISATEUR</th><th>RÔLE</th><th>STATUT</th><th /></tr></thead><tbody>{userRows.map((account) => <tr key={account.id}>
          <td><strong>{account.nom}</strong><small className="table-sub">{account.login}</small></td><td>{account.role}</td><td><Status active={account.actif} /></td>
          <td className="row-actions">
            <Button variant="quiet" onClick={() => { if (window.confirm(`Confirmer la ${account.actif ? "désactivation" : "réactivation"} de ${account.nom} ?`)) void runAction(`/utilisateurs/${account.id}`, "PATCH", { actif: !account.actif }, account.actif ? "Compte désactivé." : "Compte réactivé."); }}>{account.actif ? "Désactiver" : "Réactiver"}</Button>
            <Button variant="quiet" onClick={() => { const password = window.prompt("Nouveau mot de passe (12 caractères minimum) :"); if (password === null) return; if (password.length < 12) { setError("Le mot de passe doit contenir au moins 12 caractères."); return; } if (window.confirm(`Réinitialiser le mot de passe de ${account.nom} ?`)) void runAction(`/utilisateurs/${account.id}`, "PATCH", { motDePasse: password }, "Mot de passe réinitialisé."); }}>Réinitialiser le mot de passe</Button>
          </td>
        </tr>)}</tbody></Table>}
      </Panel>
    </>
  );

  if (page === "appareils") return (
    <>
      <PageHeading eyebrow="ÉQUIPEMENT" title="Appareils" description="Attribuez un préfixe de ticket unique à chaque appareil de vente." />
      <Panel><h2>{editingDevice ? "Modifier l’appareil" : "Enregistrer un appareil"}</h2><form className="form-grid" onSubmit={onDeviceSubmit}>
        <Field label="Nom de l’appareil" value={form.nom ?? ""} onChange={(event) => setValue("nom", event.target.value)} required />
        {!editingDevice && <Field label="Préfixe de ticket (A–Z, 0–9, tiret)" maxLength={12} value={form.prefixeTicket ?? ""} onChange={(event) => setValue("prefixeTicket", event.target.value.toUpperCase())} required />}
        <SelectField label="Receveur attribué (facultatif)" value={form.receveurId ?? ""} onChange={(event) => setValue("receveurId", event.target.value)}><option value="">Non attribué</option>{((data.receivers ?? []) as Account[]).map((receiver) => <option key={receiver.id} value={receiver.id}>{receiver.nom}</option>)}</SelectField>
        <div className="form-actions"><Button type="submit" disabled={loading}>{editingDevice ? "Enregistrer" : "Ajouter l’appareil"}</Button>{editingDevice && <Button variant="quiet" type="button" onClick={() => { setEditingDevice(null); clearForm(); }}>Annuler</Button>}</div>
      </form></Panel>
      <Panel><PanelTitle title="Appareils attribués" count={deviceRows.length} />
        {deviceRows.length === 0 ? <Empty /> : <Table><thead><tr><th>APPAREIL</th><th>PRÉFIXE</th><th>RECEVEUR</th><th>STATUT</th><th /></tr></thead><tbody>{deviceRows.map((device) => <tr key={device.id}>
          <td><strong>{device.nom}</strong></td><td><span className="code-pill">{device.prefixeTicket}</span></td><td>{device.receveur?.nom ?? "—"}</td><td><Status active={device.actif} /></td>
          <td className="row-actions"><Button variant="quiet" onClick={() => { setEditingDevice(device); setValue("nom", device.nom); setValue("receveurId", device.receveur?.id ?? ""); }}>Modifier</Button><Button variant="quiet" onClick={() => { if (window.confirm(`Confirmer la ${device.actif ? "désactivation" : "activation"} de ${device.nom} ?`)) void runAction(`/appareils/${device.id}`, "PATCH", { actif: !device.actif }, device.actif ? "Appareil désactivé." : "Appareil activé."); }}>{device.actif ? "Désactiver" : "Activer"}</Button></td>
        </tr>)}</tbody></Table>}
      </Panel>
    </>
  );

  if (page === "services") return (
    <>
      <PageHeading eyebrow="EXPLOITATION" title="Services" description="Affectez un bus, une ligne, un receveur et le sens de circulation." />
      <Panel><h2>Ouvrir un service</h2><form className="form-grid" onSubmit={onServiceSubmit}>
        <SelectField label="Bus" value={form.busId ?? ""} onChange={(event) => setValue("busId", event.target.value)} required><option value="">Choisir un bus</option>{((data.availableBuses ?? []) as Bus[]).filter((bus) => bus.actif).map((bus) => <option key={bus.id} value={bus.id}>{bus.code} · {bus.nom}</option>)}</SelectField>
        <SelectField label="Ligne" value={form.ligneId ?? ""} onChange={(event) => setValue("ligneId", event.target.value)} required><option value="">Choisir une ligne</option>{((data.availableLines ?? []) as Line[]).filter((line) => line.actif).map((line) => <option key={line.id} value={line.id}>{line.nom}</option>)}</SelectField>
        <SelectField label="Receveur" value={form.receveurId ?? ""} onChange={(event) => setValue("receveurId", event.target.value)} required><option value="">Choisir un receveur</option>{((data.availableUsers ?? []) as Account[]).filter((account) => account.role === "RECEVEUR" && account.actif).map((receiver) => <option key={receiver.id} value={receiver.id}>{receiver.nom}</option>)}</SelectField>
        <SelectField label="Sens" value={form.sens ?? "ALLER"} onChange={(event) => setValue("sens", event.target.value)}><option value="ALLER">Aller</option><option value="RETOUR">Retour</option></SelectField>
        {role === "TRANSPORTEUR" && <SelectField label="Appareil (facultatif)" value={form.appareilId ?? ""} onChange={(event) => setValue("appareilId", event.target.value)}><option value="">Sans appareil attribué</option>{((data.availableDevices ?? []) as Device[]).filter((device) => device.actif).map((device) => <option key={device.id} value={device.id}>{device.nom} · {device.prefixeTicket}</option>)}</SelectField>}
        <div className="form-actions"><Button type="submit" disabled={loading}>Ouvrir le service</Button></div>
      </form></Panel>
      <Panel><PanelTitle title="Services enregistrés" count={serviceRows.length} />
        {serviceRows.length === 0 ? <Empty /> : <Table><thead><tr><th>OUVERTURE</th><th>BUS / LIGNE</th><th>RECEVEUR</th><th>SENS</th><th>STATUT</th><th /></tr></thead><tbody>{serviceRows.map((service) => <tr key={service.id}>
          <td>{formatDate(service.debutAt)}</td><td><strong>{service.bus?.code ?? "—"}</strong><small className="table-sub">{service.ligne?.nom ?? "—"}</small></td><td>{service.receveur?.nom ?? "—"}</td><td>{service.sens === "ALLER" ? "Aller" : "Retour"}</td>
          <td><span className={`status ${service.statut === "OUVERT" ? "status-active" : "status-inactive"}`}>{service.statut === "OUVERT" ? "Ouvert" : "Terminé"}</span></td><td>{service.statut === "OUVERT" && <Button variant="quiet" onClick={() => { if (window.confirm("Terminer ce service ?")) void runAction(`/services/${service.id}`, "PATCH", { statut: "TERMINE" }, "Service terminé."); }}>Terminer</Button>}</td>
        </tr>)}</tbody></Table>}
      </Panel>
    </>
  );

  if (page === "ventes") return (
    <>
      <PageHeading eyebrow="ACTIVITÉ" title="Ventes & annulations" description="Consultez les tickets émis. Une annulation conserve le ticket et requiert un motif." />
      <Panel className="filter-panel sales-filters">
        <Field label="Du" type="date" value={salesFrom} onChange={(event) => setSalesFrom(event.target.value)} />
        <Field label="Au" type="date" value={salesTo} onChange={(event) => setSalesTo(event.target.value)} />
        {(role === "TRANSPORTEUR" || role === "GESTIONNAIRE") && <>
          <SelectField label="Bus" value={salesBusId} onChange={(event) => setSalesBusId(event.target.value)}><option value="">Tous les bus</option>{((data.availableBuses ?? []) as Bus[]).map((bus) => <option key={bus.id} value={bus.id}>{bus.code}</option>)}</SelectField>
          <SelectField label="Ligne" value={salesLineId} onChange={(event) => setSalesLineId(event.target.value)}><option value="">Toutes les lignes</option>{((data.availableLines ?? []) as Line[]).map((line) => <option key={line.id} value={line.id}>{line.nom}</option>)}</SelectField>
          <SelectField label="Receveur" value={salesReceiverId} onChange={(event) => setSalesReceiverId(event.target.value)}><option value="">Tous les receveurs</option>{((data.availableUsers ?? []) as Account[]).filter((account) => account.role === "RECEVEUR").map((receiver) => <option key={receiver.id} value={receiver.id}>{receiver.nom}</option>)}</SelectField>
        </>}
        <SelectField label="Statut" value={salesStatus} onChange={(event) => setSalesStatus(event.target.value)}><option value="">Toutes les ventes</option><option value="false">Non annulées</option><option value="true">Annulées</option></SelectField>
        <Button variant="quiet" onClick={() => { setSalesPage(1); loadSales(1); }}>Appliquer les filtres</Button><span className="filter-count">{String(data.total ?? 0)} résultat(s)</span>
      </Panel>
      <Panel><PanelTitle title="Tickets" count={saleRows.length} />
        {saleRows.length === 0 ? <Empty>Aucune vente pour cette période.</Empty> : <Table><thead><tr><th>TICKET / DATE</th><th>TRAJET</th><th>BUS / RECEVEUR</th><th>MONTANT</th><th>STATUT</th><th /></tr></thead><tbody>{saleRows.map((sale) => <tr key={sale.id}>
          <td><strong>{sale.numeroTicket}</strong><small className="table-sub">{formatDate(sale.vendueAtClient)}</small></td><td>{sale.ligneNom}<small className="table-sub">→ {sale.destinationNom} · {sale.troncons} tronçon(s)</small></td>
          <td>{sale.busCode}<small className="table-sub">{sale.receveurNom}</small></td><td><strong>{formatGnf(sale.montantGnf)}</strong></td><td>{sale.annulation ? <span className="status status-inactive">Annulée</span> : <span className="status status-active">Valide</span>}</td>
          <td className="row-actions"><Button variant="quiet" onClick={() => showSaleDetail(sale.id)}>Détail</Button>{!sale.annulation && role === "TRANSPORTEUR" && <Button variant="danger" onClick={() => {
            const reason = window.prompt("Motif obligatoire de l’annulation du ticket :");
            if (reason === null) return;
            const reasonError = validateCancellationReason(reason);
            if (reasonError) { setError(reasonError); return; }
            if (window.confirm(`Confirmer l’annulation du ticket ${sale.numeroTicket} ?`)) void runAction(`/ventes/${sale.id}/annulation`, "POST", { motif: reason.trim() }, "Vente annulée avec motif.");
          }}>Annuler</Button>}</td>
        </tr>)}</tbody></Table>}
        {Number(data.total ?? 0) > 50 && <div className="pagination">
          <Button variant="quiet" disabled={salesPage <= 1 || loading} onClick={() => { const next = salesPage - 1; setSalesPage(next); loadSales(next); }}>← Précédent</Button>
          <span>Page {salesPage} sur {Math.ceil(Number(data.total) / 50)}</span>
          <Button variant="quiet" disabled={salesPage >= Math.ceil(Number(data.total) / 50) || loading} onClick={() => { const next = salesPage + 1; setSalesPage(next); loadSales(next); }}>Suivant →</Button>
        </div>}
      </Panel>
      {saleDetail && <div className="detail-overlay" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setSaleDetail(null); }}>
        <section className="detail-dialog" role="dialog" aria-modal="true" aria-labelledby="sale-detail-title">
          <div className="panel-title"><h2 id="sale-detail-title">Détail du ticket</h2><button className="alert-close" onClick={() => setSaleDetail(null)} aria-label="Fermer">×</button></div>
          <div className="detail-grid">
            <div><span>Numéro</span><strong>{saleDetail.numeroTicket}</strong></div><div><span>Montant</span><strong>{formatGnf(saleDetail.montantGnf)}</strong></div>
            <div><span>Trajet</span><strong>{saleDetail.monteeNom} → {saleDetail.destinationNom}</strong></div><div><span>Tarif par tronçon</span><strong>{formatGnf(saleDetail.prixUnitaireGnf)} × {saleDetail.troncons}</strong></div>
            <div><span>Bus / ligne</span><strong>{saleDetail.busCode} · {saleDetail.ligneNom}</strong></div><div><span>Sens</span><strong>{saleDetail.sens === "ALLER" ? "Aller" : "Retour"}</strong></div>
            <div><span>Vendu par</span><strong>{saleDetail.receveurNom}</strong></div><div><span>Date de vente</span><strong>{formatDate(saleDetail.vendueAtClient)}</strong></div>
            <div><span>Reçu par le serveur</span><strong>{formatDate(saleDetail.recueAtServeur)}</strong></div>{saleDetail.annulation && <div className="detail-wide"><span>Motif d’annulation</span><strong>{saleDetail.annulation.motif}</strong></div>}
          </div>
        </section>
      </div>}
    </>
  );

  if (page === "audit") {
    const events = (data.evenements ?? []) as AuditEvent[];
    return <><PageHeading eyebrow="CONTRÔLE" title="Journal d’audit" description="Historique en lecture seule des changements et actions sensibles." />
      <Panel><PanelTitle title="Événements récents" count={events.length} />
        {!events.length ? <Empty>Aucun événement enregistré.</Empty> : <Table><thead><tr><th>DATE</th><th>AUTEUR</th><th>ACTION</th><th>ENTITÉ</th><th>AVANT / APRÈS</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{formatDate(event.createdAt)}</td><td>{event.acteur?.nom ?? "—"}</td><td><span className="code-pill">{event.action}</span></td><td>{event.entite}</td><td className="audit-values">{JSON.stringify(event.avant ?? {})}<br />→ {JSON.stringify(event.apres ?? {})}</td></tr>)}</tbody></Table>}
      </Panel>
    </>;
  }

  if (page === "plateforme") return (
    <>
      <PageHeading eyebrow="GOROHITECH" title="Espace plateforme" description="Gérez les transporteurs et leur compte principal. Chaque transporteur reste cloisonné côté serveur." />
      <Panel><h2>Créer un transporteur</h2><form className="form-grid" onSubmit={onCarrierSubmit}>
        <Field label="Nom du transporteur" value={form.nom ?? ""} onChange={(event) => setValue("nom", event.target.value)} required />
        <Field label="Nom du compte principal" value={form.nomPrincipal ?? ""} onChange={(event) => setValue("nomPrincipal", event.target.value)} required />
        <Field label="Identifiant principal" value={form.loginPrincipal ?? ""} onChange={(event) => setValue("loginPrincipal", event.target.value)} required />
        <Field label="Mot de passe (12 caractères minimum)" type="password" minLength={12} value={form.motDePassePrincipal ?? ""} onChange={(event) => setValue("motDePassePrincipal", event.target.value)} required />
        <div className="form-actions"><Button type="submit" disabled={loading}>Créer le transporteur</Button></div>
      </form></Panel>
      <Panel><PanelTitle title="Transporteurs" count={carrierRows.length} />
        {carrierRows.length === 0 ? <Empty /> : <Table><thead><tr><th>ORGANISATION</th><th>IDENTIFIANT</th><th>STATUT</th><th /></tr></thead><tbody>{carrierRows.map((carrier) => <tr key={carrier.id}>
          <td><strong>{carrier.nom}</strong></td><td className="table-sub">{carrier.id}</td><td><Status active={carrier.actif} /></td>
          <td><Button variant="quiet" onClick={() => { if (window.confirm(`Confirmer la ${carrier.actif ? "désactivation" : "activation"} de ${carrier.nom} ?`)) void runAction(`/transporteurs/${carrier.id}`, "PATCH", { actif: !carrier.actif }, carrier.actif ? "Transporteur désactivé." : "Transporteur activé."); }}>{carrier.actif ? "Désactiver" : "Activer"}</Button></td>
        </tr>)}</tbody></Table>}
      </Panel>
    </>
  );

  return null;
}
