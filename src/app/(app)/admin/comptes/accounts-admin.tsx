"use client";

import { useActionState, useState } from "react";
import { type AccountActionState, accountAction } from "../actions";

interface Account {
  id: string;
  login: string;
  displayName: string;
  roleCode: string;
  roleLabel: string;
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  teamLetter: string | null;
  teamColorHex: string | null;
  zones: string[];
}

interface Props {
  adminId: string;
  accounts: Account[];
  teams: { id: string; letter: string; colorName: string }[];
  zones: { id: string; name: string }[];
}

const ROLES = [
  { code: "equipe", label: "Compte équipe (chef d'équipe)" },
  { code: "resp_zone", label: "Responsable de zone" },
  { code: "resp_production", label: "Responsable de production" },
  { code: "admin", label: "Administrateur" },
  { code: "direction", label: "Direction" },
];

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function AccountsAdmin({ adminId, accounts, teams, zones }: Props) {
  const [state, action, pending] = useActionState<AccountActionState, FormData>(accountAction, {});
  const [roleCode, setRoleCode] = useState("equipe");
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {state.error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">
          {state.error}
        </p>
      )}
      {state.message && (
        <div role="status" className="flex flex-col gap-1 rounded-xl bg-emerald-50 p-3 text-emerald-900">
          <span>{state.message}</span>
          {state.password && (
            <span>
              Mot de passe provisoire de <strong>{state.login}</strong> :{" "}
              <code className="rounded bg-white px-2 py-1 text-lg font-semibold">{state.password}</code>
              <span className="block text-sm">
                Notez-le maintenant : il ne sera plus affiché. Il devra être changé à la première connexion.
              </span>
            </span>
          )}
        </div>
      )}

      {!showForm ? (
        <button type="button" className="btn-secondary" onClick={() => setShowForm(true)}>
          + Créer un compte
        </button>
      ) : (
        <form action={action} className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <input type="hidden" name="intent" value="create" />
          <h2 className="text-lg font-semibold">Nouveau compte</h2>
          <label className="flex flex-col gap-1">
            <span className="font-medium">Rôle</span>
            <select name="roleCode" className="field" value={roleCode} onChange={(e) => setRoleCode(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          {roleCode === "equipe" && (
            <label className="flex flex-col gap-1">
              <span className="font-medium">Équipe</span>
              <select name="teamId" className="field" required>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    Équipe {t.letter} – {t.colorName}
                  </option>
                ))}
              </select>
            </label>
          )}
          {roleCode === "resp_zone" && (
            <fieldset className="flex flex-col gap-1">
              <legend className="font-medium">Zone(s)</legend>
              {zones.map((z) => (
                <label key={z.id} className="flex items-center gap-2">
                  <input type="checkbox" name="zoneIds" value={z.id} className="size-5" /> {z.name}
                </label>
              ))}
            </fieldset>
          )}
          <label className="flex flex-col gap-1">
            <span className="font-medium">Intitulé affiché</span>
            <input name="displayName" className="field" required placeholder="ex. Chef d'équipe – Équipe Turquoise (H)" />
            <span className="text-sm text-slate-500">Une fonction, pas un prénom.</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium">Identifiant de connexion</span>
            <input name="login" className="field" required placeholder="ex. equipe-h" autoCapitalize="none" />
          </label>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary flex-1" disabled={pending}>
              {pending ? "Création…" : "Créer le compte"}
            </button>
            <button type="button" className="px-4 text-slate-700" onClick={() => setShowForm(false)}>
              Fermer
            </button>
          </div>
        </form>
      )}

      <ul className="flex flex-col gap-2">
        {accounts.map((a) => (
          <li key={a.id} className={`flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm ${a.active ? "" : "opacity-60"}`}>
            <span className="flex flex-wrap items-center gap-2">
              {a.teamLetter && (
                <span
                  className="flex size-8 items-center justify-center rounded-full font-bold text-white"
                  style={{ backgroundColor: a.teamColorHex ?? undefined }}
                  aria-hidden
                >
                  {a.teamLetter}
                </span>
              )}
              <span className="font-semibold">{a.displayName}</span>
              {!a.active && <span className="rounded-full bg-slate-200 px-2 text-sm">Désactivé</span>}
            </span>
            <span className="text-sm text-slate-600">
              {a.login} · {a.roleLabel}
              {a.zones.length > 0 && ` · ${a.zones.join(", ")}`}
            </span>
            <span className="text-sm text-slate-500">
              {a.lastLoginAt ? `Dernière connexion : ${dateFormat.format(new Date(a.lastLoginAt))}` : "Jamais connecté"}
              {a.mustChangePassword && " · mot de passe provisoire"}
            </span>
            <form action={action} className="flex flex-wrap gap-4">
              <input type="hidden" name="userId" value={a.id} />
              <input type="hidden" name="login" value={a.login} />
              <button
                type="submit"
                name="intent"
                value="reset"
                className="text-sm font-medium text-teal-800 underline"
                onClick={(e) => {
                  if (!window.confirm(`Réinitialiser le mot de passe de « ${a.login} » ? Ses appareils seront déconnectés.`)) e.preventDefault();
                }}
              >
                Réinitialiser le mot de passe
              </button>
              {a.id !== adminId && (
                <button
                  type="submit"
                  name="intent"
                  value={a.active ? "deactivate" : "activate"}
                  className={`text-sm font-medium underline ${a.active ? "text-red-800" : "text-teal-800"}`}
                  onClick={(e) => {
                    if (a.active && !window.confirm(`Désactiver « ${a.login} » ? Il sera déconnecté partout.`)) e.preventDefault();
                  }}
                >
                  {a.active ? "Désactiver" : "Réactiver"}
                </button>
              )}
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
