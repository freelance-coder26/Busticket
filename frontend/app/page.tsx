"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, setSession } from "../services/api.js";

export default function LoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [transporteurId, setTransporteurId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const session = await apiRequest<{
        utilisateur: { id: string; nom: string; login: string; role: string; transporteurId: string | null };
        accessToken: string;
      }>("/auth/login", {
        method: "POST",
        body: {
          login,
          motDePasse,
          ...(transporteurId ? { transporteurId } : {}),
        },
      });
      setSession(session);
      router.push("/dashboard");
    } catch (requestError) {
      setError(requestError instanceof Error
        ? requestError.message
        : "Impossible de joindre le serveur. Vérifiez que le backend est démarré.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-decoration" />
      <div className="login-card">
        <div className="brand-mark">GB</div>
        <h1>Gorohitech · Billetterie</h1>
        <p className="muted">Votre espace de gestion. Connectez-vous pour suivre vos bus, vos ventes et vos recettes.</p>

        {error && (
          <div className="alert alert-error" role="alert">
            {error}
            <button className="alert-close" onClick={() => setError("")} aria-label="Fermer">×</button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="form-stack">
          <div className="field">
            <label>Identifiant</label>
            <input
              required
              autoComplete="username"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="ex: transporteur1"
            />
          </div>
          <div className="field">
            <label>Mot de passe</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Identifiant transporteur</label>
            <input
              value={transporteurId}
              onChange={(e) => setTransporteurId(e.target.value)}
              placeholder="Obligatoire pour un compte transporteur"
            />
          </div>
          <button className="button button-primary" type="submit" disabled={loading}>
            {loading ? "Connexion…" : "Se connecter"}
          </button>
        </form>

        <p className="login-footnote">
          La sécurité des accès est vérifiée par le serveur.
        </p>
      </div>
    </div>
  );
}
