"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="font-medium">Identifiant</span>
        <input
          name="login"
          defaultValue={state.login}
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
        <input name="password" type="password" autoComplete="current-password" required className="field" />
      </label>
      {state.error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
