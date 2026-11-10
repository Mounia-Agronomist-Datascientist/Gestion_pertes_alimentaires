import { notFound, redirect } from "next/navigation";
import { db } from "@/db/client";
import type { UnitCost } from "@/domain/couts";
import { computeProductionWeek, toProductionLocalDate } from "@/domain/semaine-production";
import { requireUser } from "@/modules/auth/next-session";
import { INPUT_METHODS, type InputMethod } from "@/modules/declarations/input";
import { getDeclarationOptions } from "@/modules/declarations/options";
import { getDeclarationDetail } from "@/modules/declarations/queries";
import { DeclarationWizard, type WizardInitial } from "../../../declarer/declaration-wizard";

export const metadata = { title: "Corriger une perte — Pertes" };

export default async function CorrectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const detail = await getDeclarationDetail(db, user, id).catch(() => null);
  if (!detail) notFound();
  if (!detail.canModify) redirect(`/historique/${id}`);
  const d = detail.declaration;

  const useTare = d.tareTotalKg != null;
  // « Conversion automatique » est déduite : à la saisie, elle correspond à un comptage.
  const method: InputMethod = (INPUT_METHODS as readonly string[]).includes(d.measurementMethod)
    ? (d.measurementMethod as InputMethod)
    : "comptage";
  const support = detail.containers.find((c) => c.kind === "support");

  // Produit choisi dans l'import de la semaine : il reste valable tant que la date de la perte ne change pas de semaine.
  const weekItem = d.weekRecipeId
    ? { kind: "plat" as const, id: d.weekRecipeId }
    : d.weekSubRecipeId
      ? { kind: "sous_recette" as const, id: d.weekSubRecipeId }
      : d.weekLineId
        ? { kind: "ingredient" as const, id: d.weekLineId }
        : null;
  const lossWeek = computeProductionWeek(d.occurredOn);

  const initial: WizardInitial = {
    zoneId: d.zoneId,
    subzoneId: d.subzoneId,
    teamId: d.teamId,
    product: weekItem
      ? {
          kind: "week",
          itemKind: weekItem.kind,
          id: weekItem.id,
          name: d.productName,
          category: d.productCategory,
          unitWeightKg: d.conversionFactorUsed,
          week: { year: lossWeek.year, number: lossWeek.number },
          cost: {
            food: { perKgEur: d.costPerKgEur, perUnitEur: d.costPerUnitEur },
            packagingPerPortionEur: (d.costDetails as { packagingPerPortionEur?: number | null } | null)?.packagingPerPortionEur ?? null,
            portionWeightKg: d.conversionFactorUsed,
            packagingItself: (d.costDetails as { packagingItself?: UnitCost | null } | null)?.packagingItself ?? undefined,
          },
        }
      : d.productId
        ? { kind: "listed", id: d.productId, name: d.productName, category: d.productCategory }
        : { kind: "free", name: d.productName, category: d.productCategory },
    method,
    quantity: useTare ? "" : String(d.quantity),
    unitCode: useTare ? null : d.unitCode,
    useTare,
    grossKg: useTare ? String(d.quantity) : "",
    gastroCounts: Object.fromEntries(detail.containers.filter((c) => c.kind === "gastro").map((c) => [c.containerTypeId, c.count])),
    supportId: support?.containerTypeId ?? null,
    causeId: d.causeId,
    destinationLines: detail.destinations.map((x) => ({ destinationId: x.destinationId, quantity: String(x.quantity) })),
    justification: d.destinationGapJustification ?? "",
    occurredOn: d.occurredOn,
    occurredTime: d.occurredTime?.slice(0, 5) ?? "",
    comment: d.comment ?? "",
  };

  const options = await getDeclarationOptions(db, user, toProductionLocalDate(new Date()));
  return <DeclarationWizard options={options} userTeam={user.team} correction={{ id, revision: d.revision, initial }} />;
}
