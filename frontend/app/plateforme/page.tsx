"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiRequest, getSession, setSession } from "../../services/api.js";

type LoginResult = {
  utilisateur: { id: string; nom: string; login: string; role: string; transporteurId: string | null };
  accessToken: string;
};

// Page de connexion dédiée à l'administrateur plateforme (Gorohitech), séparée du login partagé
// des transporteurs/gestionnaires/contrôleurs/receveurs pour garder cet accès à part.
export default function PlatformLoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = getSession() as LoginResult | null;
      if (saved && saved.utilisateur.role === "ADMIN_PLATEFORME") {
        router.push("/dashboard");
        return;
      }
      setCheckingSession(false);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const session = await apiRequest<LoginResult>("/auth/login", {
        method: "POST",
        body: { login, motDePasse },
      });
      if (session.utilisateur.role !== "ADMIN_PLATEFORME") {
        throw new Error("Ce compte n'est pas un compte plateforme.");
      }
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

  if (checkingSession) return <main className="loading-screen">Chargement…</main>;

  return (
    <div className="login-screen">
      <div className="login-decoration" />
      <div className="login-card">
        <div className="brand-mark">G</div>
        <h1>Espace plateforme</h1>
        <p className="muted">Réservé aux administrateurs Gorohitech. Gère les transporteurs et leur compte principal.</p>

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
              placeholder="ex: superadmin"
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
          <button className="button button-primary" type="submit" disabled={loading}>
            {loading ? "Connexion…" : "Se connecter"}
          </button>
        </form>

        <p className="login-footnote">
          Vous n&apos;êtes pas administrateur plateforme ? <Link href="/">Connexion transporteur/receveur</Link>.
        </p>
      </div>
    </div>
  );
}
