import Link from "next/link";
import { db } from "@/db/client";
import { loadAlertSettings } from "@/modules/alertes/reglages";
import { requireUser } from "@/modules/auth/next-session";
import { requirePermission } from "@/modules/auth/permissions";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Seuils des alertes — Administration" };

export default async function AlertSettingsPage() {
  const admin = await requireUser();
  requirePermission(admin, "referentiel.manage");
  const settings = await loadAlertSettings(db);
  return (
    <>
      <Link href="/admin" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Administration
      </Link>
      <h1 className="text-2xl font-bold">Seuils des alertes</h1>
      <p className="text-sm text-slate-600">
        Alertes d&apos;analyse calculées chaque nuit pour la semaine de production terminée, et sens des tendances dans les statistiques. Chaque
        modification est inscrite au journal d&apos;audit ; les alertes déjà calculées ne changent pas tant que leur semaine n&apos;est pas recalculée.
      </p>
      <SettingsForm
        values={{
          unusualPercent: Math.round(settings.unusualRate * 1000) / 10,
          minKg: settings.minKg,
          recurrenceWeeks: settings.recurrenceWeeks,
          stablePercent: Math.round(settings.trendStableRate * 1000) / 10,
        }}
      />
      <Link href="/alertes/analyse" className="text-teal-800 underline">
        Voir les alertes d&apos;analyse
      </Link>
    </>
  );
}
