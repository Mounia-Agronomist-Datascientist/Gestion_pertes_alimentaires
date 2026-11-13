import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db/client";
import * as s from "@/db/schema";
import { requireUser } from "@/modules/auth/next-session";
import { validFactors } from "@/modules/environnement/factors";
import { listIngredientsForMapping } from "@/modules/environnement/ingredients";
import { MappingAdmin } from "./mapping-admin";

export const metadata = { title: "Ingrédients et familles — Administration" };

export default async function IngredientsPage() {
  const admin = await requireUser();
  const [rows, families, factors] = await Promise.all([
    listIngredientsForMapping(db, admin),
    db.select().from(s.foodFamilies).where(eq(s.foodFamilies.active, true)).orderBy(asc(s.foodFamilies.displayOrder), asc(s.foodFamilies.name)),
    validFactors(db),
  ]);
  return (
    <>
      <Link href="/admin/facteurs-co2" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Facteurs d&apos;émission
      </Link>
      <h1 className="text-2xl font-bold">Ingrédients Melba et familles</h1>
      <p className="text-sm text-slate-600">
        Chaque ingrédient des recettes importées est rattaché à une famille alimentaire, dont le facteur donne son impact CO2e. Les plus utilisés sont
        en tête. Une famille est proposée d&apos;après le nom de l&apos;ingrédient : rien n&apos;est enregistré sans votre validation. « Non couvert » : aliment
        sans famille (épices, fonds…), compté à part ; « non alimentaire » : contenant listé dans une recette, jamais compté.
      </p>
      {families.length === 0 ? (
        <p className="rounded-xl bg-amber-50 p-3 text-amber-950">
          Aucune famille pour l&apos;instant : chargez d&apos;abord la proposition dans{" "}
          <Link href="/admin/facteurs-co2" className="underline">
            Facteurs d&apos;émission
          </Link>
          .
        </p>
      ) : (
        <MappingAdmin
          rows={rows.map((r) => ({
            key: r.key,
            label: r.label,
            uses: r.uses,
            mapping: r.mapping ? { status: r.mapping.status, familyId: r.mapping.familyId } : null,
            suggestion: !r.suggestion ? null : r.suggestion.kind === "famille" ? `f:${r.suggestion.familyId}` : "non_alimentaire",
          }))}
          families={families.map((f) => ({ id: f.id, name: f.name, category: f.category, validated: factors.has(f.id) }))}
        />
      )}
    </>
  );
}
