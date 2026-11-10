"use client";

import { useState } from "react";

const ERRORS: Record<string, string> = {
  vide: "Saisissez votre identifiant et votre mot de passe.",
  incorrect: "Identifiant ou mot de passe incorrect.",
  bloque: "Trop d'essais : ce compte est bloqué pendant 15 minutes.",
};

/** Formulaire classique envoyé à /connexion/session (le cookie de session est posé sur la redirection). */
export function LoginForm({ error, login }: { error?: string; login?: string }) {
  const [pending, setPending] = useState(false);
  const message = error ? (ERRORS[error] ?? ERRORS.incorrect) : null;

  return (
    <form method="post" action="/connexion/session" onSubmit={() => setPending(true)} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="font-medium">Identifiant</span>
        <input
          name="login"
          defaultValue={login}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          required
          className="field"
          placeholder="ex. equipe-a"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Mot de passe</span>
        <input name="password" type="password" autoComplete="current-password" required autoFocus={!!login} className="field" />
      </label>
      {message && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">
          {message}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
