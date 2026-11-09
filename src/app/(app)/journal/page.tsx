import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { AUDIT_ENTITY_LABELS, auditActionLabel, auditEntityLabel, auditFieldLabel } from "@/modules/audit/labels";
import { listAuditActors, listAuditEntries } from "@/modules/audit/journal";
import { requireUser } from "@/modules/auth/next-session";
import { can } from "@/modules/auth/permissions";

export const metadata = { title: "Journal d'audit — Pertes" };

const PERIODS = [
  { value: "7", label: "7 derniers jours" },
  { value: "30", label: "30 derniers jours" },
  { value: "", label: "Tout l'historique" },
];

const dateTimeFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

type Search = { objet?: string; qui?: string; periode?: string; page?: string };

export default async function JournalPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  if (!can(user, "audit.read")) redirect("/");
  const params = await searchParams;
  const period = params.periode ?? "30";
  const [result, actors] = await Promise.all([
    listAuditEntries(db, user, {
      entity: params.objet || null,
      userId: params.qui || null,
      days: period ? Number(period) : null,
      page: Number(params.page ?? 1) || 1,
    }),
    listAuditActors(db, user),
  ]);
  const pageHref = (page: number) =>
    `/journal?${new URLSearchParams({ objet: params.objet ?? "", qui: params.qui ?? "", periode: period, page: String(page) })}`;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Accueil
      </Link>
      <h1 className="text-2xl font-bold">Journal d&apos;audit</h1>
      <p className="text-sm text-slate-600">
        Toutes les actions enregistrées : connexions, déclarations, corrections, réglages. Le journal ne peut être ni
        modifié ni effacé.
      </p>

      <form className="grid min-w-0 gap-2 rounded-2xl bg-white p-4 shadow-sm sm:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Objet</span>
          <select name="objet" defaultValue={params.objet ?? ""} className="field w-full min-w-0">
            <option value="">Tous</option>
            {Object.entries(AUDIT_ENTITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Qui</span>
          <select name="qui" defaultValue={params.qui ?? ""} className="field w-full min-w-0">
            <option value="">Tout le monde</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName} ({a.login})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Période</span>
          <select name="periode" defaultValue={period} className="field w-full min-w-0">
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-primary self-end">
          Filtrer
        </button>
      </form>

      <p className="text-sm text-slate-600">
        {result.total} action{result.total > 1 && "s"}
        {result.pageCount > 1 && ` — page ${result.page} sur ${result.pageCount}`}
      </p>

      <ul className="flex flex-col gap-2">
        {result.entries.map((e) => (
          <li key={e.id} className="flex flex-col gap-1 rounded-2xl bg-white p-4 shadow-sm">
            <span className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold">
                {auditActionLabel(e.action)} · {auditEntityLabel(e.entity)}
              </span>
              <span className="text-sm text-slate-500">{dateTimeFormat.format(e.occurredAt)}</span>
            </span>
            <span className="text-sm text-slate-700">
              {e.userName ? `${e.userName} (${e.userLogin})` : "Système ou identifiant inconnu"}
              {e.entity === "loss_declaration" && e.entityId && (
                <>
                  {" · "}
                  <Link href={`/historique/${e.entityId}`} className="text-teal-800 underline">
                    voir la déclaration
                  </Link>
                </>
              )}
            </span>
            {e.reason && <span className="text-sm text-slate-700">Motif : {e.reason}</span>}
            {e.changes && e.changes.length > 0 && <span className="text-sm text-slate-600">Champs modifiés : {[...new Set(e.changes.map(auditFieldLabel))].join(", ")}</span>}
            {(e.before != null || e.after != null) && (
              <details className="text-sm">
                <summary className="cursor-pointer text-slate-600">Détail enregistré</summary>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {e.before != null && (
                    <div>
                      <p className="font-medium">Avant</p>
                      <pre className="max-h-64 overflow-auto rounded-lg bg-slate-50 p-2 text-xs">{JSON.stringify(e.before, null, 2)}</pre>
                    </div>
                  )}
                  {e.after != null && (
                    <div>
                      <p className="font-medium">Après</p>
                      <pre className="max-h-64 overflow-auto rounded-lg bg-slate-50 p-2 text-xs">{JSON.stringify(e.after, null, 2)}</pre>
                    </div>
                  )}
                </div>
              </details>
            )}
          </li>
        ))}
      </ul>

      {result.pageCount > 1 && (
        <nav className="flex justify-between">
          {result.page > 1 ? (
            <Link href={pageHref(result.page - 1)} className="btn-secondary flex items-center">
              ← Plus récentes
            </Link>
          ) : (
            <span />
          )}
          {result.page < result.pageCount && (
            <Link href={pageHref(result.page + 1)} className="btn-secondary flex items-center">
              Plus anciennes →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
