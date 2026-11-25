import test from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup } from "@testing-library/react";
import Dashboard from "../../features/admin/dashboard/Dashboard";
import type { Report } from "../../features/admin/types";

const report: Report = {
  total: { tickets: 42, recettesGnf: 84000, ventesAnnulees: 2, versementAttenduGnf: 50000, ecartGnf: 34000 },
  parJour: [{ cle: "2026-11-20", tickets: 42, recettesGnf: 84000 }],
  parBus: [{ cle: "BUS-1", tickets: 42, recettesGnf: 84000 }],
  parLigne: [{ cle: "Ligne A", tickets: 42, recettesGnf: 84000 }],
  parReceveur: [{ cle: "Receveur Démo", tickets: 42, recettesGnf: 84000 }],
  annulationsParReceveur: [{ receveur: "Receveur Démo", annulations: 2 }],
  ecartsParBus: [{ busCode: "BUS-1", versementAttenduGnf: 50000, recettesGnf: 84000, ecartGnf: 34000 }],
};

test("affiche les tickets vendus et les recettes nettes à partir du rapport", () => {
  try {
    render(
      <Dashboard
        report={report}
        buses={[{ id: "b1", code: "BUS-1", nom: "Bus 1", actif: true, versementAttenduGnf: 50000 }]}
        services={[]}
        role="TRANSPORTEUR"
        from="2026-11-20"
        to="2026-11-20"
        setFrom={() => {}}
        setTo={() => {}}
        refresh={() => {}}
        setError={() => {}}
        loading={false}
      />,
    );
    assert.ok(screen.getByText("Tableau de bord"));
    assert.ok(screen.getAllByText("42").length > 0);
    assert.ok(screen.getAllByText(/84\s?000\s?GNF/).length > 0);
  } finally {
    cleanup();
  }
});
