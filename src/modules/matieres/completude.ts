/**
 * Matières de la semaine à compléter (décision du 19/11/2026) : chaque matière proposée en Réception doit avoir son
 * fournisseur et le poids de son colis (sauf vrac au kg). Ce qui manque se saisit une fois sur la fiche produit
 * (colis saisi à la main) et reste valable les semaines suivantes, jusqu'à un bon qui change de fournisseur ou de colis.
 */
import type { Db } from "@/db/types";
import type { LocalDate } from "@/domain/semaine-production";
import { type AuthUser, requirePermission } from "@/modules/auth/permissions";
import { packagingOptions, productSuppliers } from "./colis";
import { recentWeekMaterials } from "./semaine";

export interface IncompleteMaterial {
  productId: string;
  name: string;
  /** Semaines (numéros) où la matière est proposée. */
  weeks: number[];
  reason: "sans_fournisseur" | "poids_colis_inconnu";
  supplier: string | null;
  packagingLabel: string | null;
}

/** Matières de la semaine en cours et de la suivante sans fournisseur, ou dont le poids du colis n'est pas connu. */
export async function incompleteWeekMaterials(
  db: Db,
  admin: AuthUser,
  today: LocalDate,
): Promise<{ weeks: number[]; checked: number; incomplete: IncompleteMaterial[] }> {
  requirePermission(admin, "referentiel.manage");
  const weeks = (await recentWeekMaterials(db, today)).filter((w) => w.relative >= 0);
  const [suppliers, packagings] = await Promise.all([productSuppliers(db), packagingOptions(db)]);
  const byProduct = new Map<string, IncompleteMaterial>();
  const checked = new Set<string>();
  for (const w of weeks)
    for (const m of w.materials) {
      checked.add(m.productId);
      const known = byProduct.get(m.productId);
      if (known) {
        known.weeks.push(w.number);
        continue;
      }
      const supplier = suppliers.get(m.productId);
      if (supplier && (supplier.looseByKg || packagings.get(m.productId)?.length)) continue;
      byProduct.set(m.productId, {
        productId: m.productId,
        name: m.name,
        weeks: [w.number],
        reason: supplier ? "poids_colis_inconnu" : "sans_fournisseur",
        supplier: supplier?.supplier ?? null,
        packagingLabel: supplier?.label ?? null,
      });
    }
  const incomplete = [...byProduct.values()].sort(
    (a, b) => a.reason.localeCompare(b.reason) || a.name.localeCompare(b.name, "fr"),
  );
  return { weeks: weeks.map((w) => w.number), checked: checked.size, incomplete };
}
