"use client";

import { useState } from "react";
import { formatGnf } from "../../../../shared/admin-utils.js";
import { downloadSalesExport } from "../admin.api";
import { Button, Empty, Field, Panel, PanelTitle, PageHeading, Table } from "../admin-ui";
import type { Bus, Report, ReportGroup, Service } from "../types";

type DashboardProps = {
  report?: Report;
  buses?: Bus[];
  services?: Service[];
  role: string;
  from: string;
  to: string;
  setFrom: (value: string) => void;
  setTo: (value: string) => void;
  refresh: () => void;
  setError: (message: string) => void;
  loading: boolean;
};

function BreakdownPanel({ title, rows, label }: { title: string; rows: ReportGroup[]; label: string }) {
  return (
    <Panel>
      <PanelTitle title={title} count={rows.length} />
      {!rows.length ? <Empty>Aucune donnée sur la période choisie.</Empty> : (
        <Table>
          <thead><tr><th>{label}</th><th>TICKETS</th><th>RECETTES NETTES</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.cle}>
            <td><strong>{row.cle}</strong></td>
            <td>{row.tickets.toLocaleString("fr-FR")}</td>
            <td>{formatGnf(row.recettesGnf)}</td>
          </tr>)}</tbody>
        </Table>
      )}
    </Panel>
  );
}

function StatCard({ label, value, note, icon, tone }: {
  label: string;
  value: string;
  note: string;
  icon: string;
  tone: "blue" | "gold" | "violet" | "green";
}) {
  return (
    <article className={`stat-card tone-${tone}`}>
      <div className="stat-top"><span>{label}</span><span className="stat-icon" aria-hidden="true">{icon}</span></div>
      <strong className="stat-value">{value}</strong>
      <span className="stat-note">{note}</span>
    </article>
  );
}

export default function Dashboard({
  report,
  buses,
  services,
  role,
  from,
  to,
  setFrom,
  setTo,
  refresh,
  setError,
  loading,
}: DashboardProps) {
  const [exportingFormat, setExportingFormat] = useState<"csv" | "excel" | null>(null);
  const total = report?.total;
  const busCount = buses?.length ?? 0;
  const currentServices = services?.filter((service) => service.statut === "OUVERT").length ?? 0;
  const busBreakdown = new Map((report?.parBus ?? []).map((row) => [row.cle, {
    ...row,
    versementAttenduGnf: 0,
    ecartGnf: 0,
  }]));
  for (const variance of report?.ecartsParBus ?? []) {
    const current = busBreakdown.get(variance.busCode) ?? {
      cle: variance.busCode,
      tickets: 0,
      recettesGnf: 0,
      versementAttenduGnf: 0,
      ecartGnf: 0,
    };
    busBreakdown.set(variance.busCode, {
      ...current,
      versementAttenduGnf: variance.versementAttenduGnf,
      ecartGnf: variance.ecartGnf,
    });
  }

  async function exportSales(format: "csv" | "excel") {
    setExportingFormat(format);
    try {
      await downloadSalesExport(from, to, format);
    } catch (error) {
      setError(error instanceof Error ? error.message : "L’export a échoué.");
    } finally {
      setExportingFormat(null);
    }
  }

  return (
    <>
      <PageHeading eyebrow="VUE D’ENSEMBLE" title="Tableau de bord" description="Les indicateurs de votre réseau, en un seul regard." />
      <Panel className="filter-panel dashboard-filter">
        <span className="filter-label">PÉRIODE</span>
        <Field label="Du" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <Field label="Au" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        <Button variant="quiet" onClick={refresh} disabled={loading}>Actualiser ↻</Button>
        <Button variant="quiet" onClick={() => void exportSales("csv")} disabled={loading || exportingFormat !== null}>
          {exportingFormat === "csv" ? "Export CSV…" : "Exporter CSV"}
        </Button>
        <Button variant="quiet" onClick={() => void exportSales("excel")} disabled={loading || exportingFormat !== null}>
          {exportingFormat === "excel" ? "Export Excel…" : "Exporter Excel"}
        </Button>
      </Panel>
      {!report ? <Panel><Empty>{loading ? "Chargement des indicateurs…" : "Les indicateurs ne sont pas disponibles."}</Empty></Panel> : (
        <>
          <div className="stats-grid">
            <StatCard label="Bus enregistrés" value={role === "TRANSPORTEUR" ? busCount.toString() : "—"} note={role === "TRANSPORTEUR" ? "Flotte totale" : "Non disponible pour ce rôle"} icon="▰" tone="blue" />
            <StatCard label="Services en cours" value={role === "TRANSPORTEUR" ? currentServices.toString() : "—"} note={role === "TRANSPORTEUR" ? "Services ouverts" : "Non disponible pour ce rôle"} icon="◷" tone="gold" />
            <StatCard label="Tickets vendus" value={(total?.tickets ?? 0).toLocaleString("fr-FR")} note={`${total?.ventesAnnulees ?? 0} annulation(s)`} icon="▤" tone="violet" />
            <StatCard label="Recettes de la période" value={formatGnf(total?.recettesGnf ?? 0)} note="Ventes non annulées" icon="₣" tone="green" />
          </div>
          <div className="dashboard-grid">
            <Panel className="revenue-panel">
              <PanelTitle title="Recettes par jour" count={report.parJour?.length ?? 0} />
              {!report.parJour?.length ? <Empty>Aucune recette sur la période choisie.</Empty> : (
                <div className="revenue-list">{report.parJour.map((day, index) => {
                  const peak = Math.max(1, ...report.parJour.map((item) => item.recettesGnf));
                  return <div className="revenue-row" key={day.cle}><div className="revenue-day"><span>{String(index + 1).padStart(2, "0")}</span><strong>{day.cle}</strong></div><div className="revenue-track"><span style={{ width: `${Math.max(3, day.recettesGnf / peak * 100)}%` }} /></div><strong className="revenue-amount">{formatGnf(day.recettesGnf)}</strong></div>;
                })}</div>
              )}
            </Panel>
            <Panel className="summary-panel">
              <p className="eyebrow">RÉSUMÉ DE LA PÉRIODE</p>
              <h2>Votre activité</h2>
              <div className="summary-item"><span>Recettes nettes</span><strong>{formatGnf(total?.recettesGnf ?? 0)}</strong></div>
              <div className="summary-item"><span>Versement attendu</span><strong>{formatGnf(total?.versementAttenduGnf ?? 0)}</strong></div>
              <div className="summary-item summary-gap"><span>Écart constaté</span><strong>{formatGnf(total?.ecartGnf ?? 0)}</strong></div>
              <div className="summary-item"><span>Annulations</span><strong>{total?.ventesAnnulees ?? 0}</strong></div>
              <p className="summary-footnote">Les ventes annulées sont exclues des recettes. Les rapports restent filtrés sur votre transporteur.</p>
            </Panel>
          </div>
          <Panel><PanelTitle title="Détail des recettes par bus" count={busBreakdown.size} />
            {!busBreakdown.size ? <Empty>Aucune recette sur la période choisie.</Empty> : <Table><thead><tr><th>BUS</th><th>TICKETS</th><th>RECETTES NETTES</th><th>VERSEMENT ATTENDU</th><th>ÉCART</th></tr></thead><tbody>{[...busBreakdown.values()].sort((a, b) => a.cle.localeCompare(b.cle)).map((bus) => <tr key={bus.cle}><td><strong>{bus.cle}</strong></td><td>{bus.tickets}</td><td>{formatGnf(bus.recettesGnf)}</td><td>{bus.versementAttenduGnf ? formatGnf(bus.versementAttenduGnf) : "—"}</td><td><strong className={bus.ecartGnf < 0 ? "negative" : "positive"}>{bus.versementAttenduGnf ? formatGnf(bus.ecartGnf) : "—"}</strong></td></tr>)}</tbody></Table>}
          </Panel>
          <div className="dashboard-breakdowns">
            <BreakdownPanel title="Recettes par ligne" rows={report.parLigne ?? []} label="LIGNE" />
            <BreakdownPanel title="Recettes par receveur" rows={report.parReceveur ?? []} label="RECEVEUR" />
            <Panel>
              <PanelTitle title="Annulations par receveur" count={report.annulationsParReceveur?.length ?? 0} />
              {!report.annulationsParReceveur?.length ? <Empty>Aucune annulation sur la période choisie.</Empty> : (
                <Table><thead><tr><th>RECEVEUR</th><th>VENTES ANNULÉES</th></tr></thead>
                  <tbody>{report.annulationsParReceveur.map((row) => <tr key={row.receveur}><td><strong>{row.receveur}</strong></td><td>{row.annulations}</td></tr>)}</tbody>
                </Table>
              )}
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
