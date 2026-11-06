"use client";

import { useActionState } from "react";
import { MIN_PASSWORD_LENGTH } from "@/modules/auth/password-policy";
import { changePasswordAction, type PasswordState } from "./actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePasswordAction, {});

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="font-medium">Mot de passe actuel</span>
        <input name="current" type="password" autoComplete="current-password" required className="field" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Nouveau mot de passe</span>
        <input name="next" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required className="field" />
        <span className="text-sm text-slate-500">Au moins {MIN_PASSWORD_LENGTH} caractères.</span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Confirmer le nouveau mot de passe</span>
        <input name="confirm" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required className="field" />
      </label>
      {state.error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Enregistrement…" : "Changer le mot de passe"}
      </button>
    </form>
  );
}
