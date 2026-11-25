import test from "node:test";
import assert from "node:assert/strict";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import AdminApp from "../../components/AdminApp";

test("affiche l'écran de connexion quand aucune session n'est enregistrée", async () => {
  window.localStorage.clear();
  try {
    render(<AdminApp />);
    await waitFor(() => {
      assert.ok(screen.getByText(/Se connecter/i));
    });
    assert.ok(screen.getByText(/Votre espace de gestion/i));
  } finally {
    cleanup();
  }
});
