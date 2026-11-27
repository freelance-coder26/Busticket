"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, getSession, setSession } from "../services/api.js";

type LoginResult = {
  utilisateur: { id: string; nom: string; login: string; role: string; transporteurId: string | null };
  accessToken: string;
};

// Après connexion, chaque rôle retrouve directement son espace : le receveur l'application
// hors ligne, les autres l'administration web. Le superadmin n'est volontairement pas accepté
// ici : il dispose de sa propre page (/plateforme).
function redirectForRole(role: string, router: ReturnType<typeof useRouter>) {
  if (role === "RECEVEUR") router.push("/receveur");
  else router.push("/dashboard");
}

export default function LoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = getSession() as LoginResult | null;
      if (saved && saved.utilisateur.role !== "ADMIN_PLATEFORME") {
        redirectForRole(saved.utilisateur.role, router);
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
      if (session.utilisateur.role === "ADMIN_PLATEFORME") {
        throw new Error("Les comptes plateforme se connectent depuis /plateforme.");
      }
      setSession(session);
      redirectForRole(session.utilisateur.role, router);
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
