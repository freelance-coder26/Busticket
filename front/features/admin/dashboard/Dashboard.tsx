import { formatGnf } from "../../../../shared/admin-utils.js";
import { Button, Empty, Field, Panel, PanelTitle, PageHeading, Table } from "../admin-ui";
import type { Bus, Report, Service } from "../types";

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
  loading: boolean;
};

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
  loading,
}: DashboardProps) {
  const total = report?.total;
  const busCount = buses?.length ?? 0;
  const currentServices = services?.filter((service) => service.statut === "OUVERT").length ?? 0;

  return (
    <>
      <PageHeading eyebrow="VUE D’ENSEMBLE" title="Tableau de bord" description="Les indicateurs de votre réseau, en un seul regard." />
      <Panel className="filter-panel dashboard-filter">
        <span className="filter-label">PÉRIODE</span>
        <Field label="Du" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <Field label="Au" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        <Button variant="quiet" onClick={refresh} disabled={loading}>Actualiser ↻</Button>
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
          <Panel><PanelTitle title="Écart de versement par bus" count={report.ecartsParBus?.length ?? 0} />
            {!report.ecartsParBus?.length ? <Empty>Aucun versement attendu n’est configuré.</Empty> : <Table><thead><tr><th>BUS</th><th>RECETTES</th><th>VERSEMENT ATTENDU</th><th>ÉCART</th></tr></thead><tbody>{report.ecartsParBus.map((bus) => <tr key={bus.busCode}><td><strong>{bus.busCode}</strong></td><td>{formatGnf(bus.recettesGnf)}</td><td>{formatGnf(bus.versementAttenduGnf)}</td><td><strong className={bus.ecartGnf < 0 ? "negative" : "positive"}>{formatGnf(bus.ecartGnf)}</strong></td></tr>)}</tbody></Table>}
          </Panel>
        </>
      )}
    </>
  );
}
