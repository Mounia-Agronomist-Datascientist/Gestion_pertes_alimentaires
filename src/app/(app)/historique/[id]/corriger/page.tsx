import { notFound, redirect } from "next/navigation";
import { productLabel } from "@/domain/produits";
import { db } from "@/db/client";
import type { DiscardedPackaging, UnitCost } from "@/domain/couts";
import { computeProductionWeek, toProductionLocalDate } from "@/domain/semaine-production";
import { requireUser } from "@/modules/auth/next-session";
import { INPUT_METHODS, type InputMethod } from "@/modules/declarations/input";
import { getDeclarationOptions } from "@/modules/declarations/options";
import { getDeclarationDetail } from "@/modules/declarations/queries";
import { packagingOptions } from "@/modules/matieres/colis";
import { DeclarationWizard, type WizardInitial } from "../../../declarer/declaration-wizard";
import type { FreePrice } from "@/domain/produit-absent";
import { formatDlc } from "@/domain/lots";

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
  // Colis de la perte d'origine, retrouvé par son libellé (« Sachet 5kg — Pro à Pro ») parmi les colis du produit.
  const packagingKey =
    d.unitCode === "colis" && d.productId
      ? ((await packagingOptions(db, [d.productId]))
          .get(d.productId)
          ?.find((k) => d.packagingLabel?.startsWith(`${k.label ?? "Colis"} — ${k.supplier}`))?.key ?? null)
      : null;

  // Produit choisi dans l'import de la semaine : il reste valable tant que la date de la perte ne change pas de semaine.
  const weekItem = d.weekRecipeId
    ? { kind: "plat" as const, id: d.weekRecipeId }
    : d.weekSubRecipeId
      ? { kind: "sous_recette" as const, id: d.weekSubRecipeId }
      : d.weekLineId
        ? { kind: "ingredient" as const, id: d.weekLineId }
        : null;
  const lossWeek = computeProductionWeek(d.occurredOn);

  const options = await getDeclarationOptions(
    db,
    user,
    toProductionLocalDate(new Date()),
    detail.destinations.map((x) => x.destinationId),
  );
  const details = d.costDetails as {
    packagingPerPortionEur?: number | null;
    mouldPerPortionEur?: number | null;
    packagingItself?: UnitCost | null;
    freePrice?: FreePrice | null;
    discarded?: DiscardedPackaging | null;
  } | null;
  // Plat entier (pas un encas) : moule et barquette, comptés s'ils sont jetés (R42) ; barquette aux prix du jour pour
  // l'aperçu, le serveur reprend ceux de la date de la perte.
  const wholeDish = weekItem?.kind === "plat" && d.productCategory === "produit_fini";

  const initial: WizardInitial = {
    zoneId: d.zoneId,
    subzoneId: d.subzoneId,
    teamId: d.teamId,
    product: weekItem
      ? {
          kind: "week",
          itemKind: weekItem.kind,
          id: weekItem.id,
          name: productLabel(d.productName, d.productCode),
          category: d.productCategory,
          unitWeightKg: d.conversionFactorUsed,
          week: { year: lossWeek.year, number: lossWeek.number },
          cost: {
            food: { perKgEur: d.costPerKgEur, perUnitEur: d.costPerUnitEur },
            packagingPerPortionEur: wholeDish ? null : (details?.packagingPerPortionEur ?? null),
            portionWeightKg: d.conversionFactorUsed,
            packagingItself: details?.packagingItself ?? undefined,
          },
          dishPackaging: wholeDish
            ? {
                mouldPerPortionEur: details?.mouldPerPortionEur ?? null,
                trayPerPortionEur:
                  options.packagingPerPortion[d.productCode?.startsWith("PJ") ? "petit_dejeuner" : "plat"],
              }
            : undefined,
        }
      : d.productId
        ? { kind: "listed", id: d.productId, name: d.productName, category: d.productCategory }
        : {
            kind: "free",
            name: d.productName,
            category: d.productCategory,
            // Prix d'achat indiqué (à la saisie ou après coup), gardé à la correction.
            price: details?.freePrice ?? null,
          },
    method,
    quantity: useTare ? "" : String(d.quantity),
    unitCode: useTare ? null : d.unitCode,
    packagingKey,
    // Poids d'un colis réellement utilisé (corrigé à la saisie ou « Autre colis »).
    packagingKg:
      d.unitCode === "colis" && d.conversionFactorUsed != null ? String(d.conversionFactorUsed).replace(".", ",") : "",
    useTare,
    grossKg: useTare ? String(d.quantity) : "",
    gastroCounts: Object.fromEntries(
      detail.containers.filter((c) => c.kind === "gastro").map((c) => [c.containerTypeId, c.count]),
    ),
    supportId: support?.containerTypeId ?? null,
    causeId: d.causeId,
    destinationLines: detail.destinations.map((x) => ({
      destinationId: x.destinationId,
      quantity: String(x.quantity),
    })),
    recoveredAmounts: Object.fromEntries(
      detail.destinations
        .filter((x) => x.recoveredAmount != null)
        .map((x) => [x.destinationId, String(x.recoveredAmount).replace(".", ",")]),
    ),
    binNumbers: Object.fromEntries(
      detail.destinations.filter((x) => x.binNumber).map((x) => [x.destinationId, x.binNumber!]),
    ),
    justification: d.destinationGapJustification ?? "",
    occurredOn: d.occurredOn,
    occurredTime: d.occurredTime?.slice(0, 5) ?? "",
    comment: d.comment ?? "",
    lotLines: (d.lots ?? []).map((l) => ({
      lotNumber: l.lotNumber ?? "",
      dlc: l.dlc ? formatDlc(l.dlc) : "",
      quantity: String(l.quantity).replace(".", ","),
    })),
    photos: detail.photos.map((p) => ({ photoId: p.id, src: `/historique/${id}/photo/${p.id}` })),
    discarded: details?.discarded ?? {},
  };

  return (
    <DeclarationWizard options={options} userTeam={user.team} correction={{ id, revision: d.revision, initial }} />
  );
}
