import Link from "next/link";
import { db } from "@/db/client";
import type * as s from "@/db/schema";
import { requireUser } from "@/modules/auth/next-session";
import { AGRIBALYSE_PROPOSAL } from "@/modules/environnement/agribalyse-proposal";
import { listFamiliesForAdmin, RETAINED_STAGES, STAGE_LABELS } from "@/modules/environnement/factors";
import { type FactorView, FactorsAdmin } from "./factors-admin";

export const metadata = { title: "Facteurs d'émission — Administration" };

type Factor = typeof s.emissionFactors.$inferSelect;

const view = (f: Factor): FactorView => ({
  id: f.id,
  version: f.version,
  status: f.status,
  kgCo2ePerKg: f.kgCo2ePerKg,
  source: f.source,
  sourceVersion: f.sourceVersion,
  referenceDate: f.referenceDate,
  referenceCode: f.referenceCode,
  referenceName: f.referenceName,
  stages: f.stages
    ? (Object.keys(STAGE_LABELS) as (keyof s.FactorStages)[]).map((k) => ({ label: STAGE_LABELS[k], value: f.stages![k], retained: (RETAINED_STAGES as readonly string[]).includes(k) }))
    : null,
  hypotheses: f.hypotheses,
  createdAt: f.createdAt.toISOString(),
  validatedAt: f.validatedAt?.toISOString() ?? null,
  closedAt: f.closedAt?.toISOString() ?? null,
});

export default async function FactorsPage() {
  const admin = await requireUser();
  const families = await listFamiliesForAdmin(db, admin);
  const codes = new Set(families.map((f) => f.code));
  return (
    <>
      <Link href="/admin" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Administration
      </Link>
      <h1 className="text-2xl font-bold">Facteurs d&apos;émission (CO2e)</h1>
      <div className="flex flex-col gap-2 text-sm text-slate-600">
        <p>
          Chaque ingrédient Melba sera rattaché à une famille alimentaire. Le facteur de la famille donne les kg de CO2e émis pour produire 1 kg de
          ce produit : c&apos;est l&apos;impact des denrées perdues, pas le bilan carbone de l&apos;entreprise.
        </p>
        <p>
          Valeurs proposées : Agribalyse 3.2 (ADEME), indicateur « Changement climatique ». Sont retenues les étapes agriculture, transformation,
          emballage et transport, c&apos;est-à-dire l&apos;impact du produit jusqu&apos;à sa livraison, sans la distribution en magasin ni la cuisson chez le
          consommateur.
        </p>
        <p>
          <strong>Aucun facteur n&apos;est utilisé avant d&apos;être validé.</strong> Une nouvelle valeur validée remplace l&apos;ancienne pour les calculs
          suivants ; l&apos;ancienne reste conservée et les calculs déjà faits ne changent pas.
        </p>
      </div>
      <Link href="/admin/facteurs-co2/ingredients" className="flex flex-col gap-1 rounded-2xl bg-white p-4 shadow-sm">
        <span className="text-lg font-semibold">Ingrédients Melba et familles →</span>
        <span className="text-sm text-slate-600">Rattacher chaque ingrédient des recettes à une famille (les plus utilisés d&apos;abord)</span>
      </Link>
      <FactorsAdmin
        missing={AGRIBALYSE_PROPOSAL.filter((p) => !codes.has(p.code)).length}
        families={families.map((f) => ({
          id: f.id,
          name: f.name,
          category: f.category,
          current: f.current ? view(f.current) : null,
          proposal: f.proposal ? view(f.proposal) : null,
          versions: f.versions.map(view),
        }))}
      />
    </>
  );
}
