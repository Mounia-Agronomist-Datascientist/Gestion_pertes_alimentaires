/**
 * Familles alimentaires et facteurs d'émission (docs/PHASE5.md, étape 5.4).
 *
 * - Aucun facteur n'est inventé : la proposition vient d'Agribalyse ; une modification porte sa source.
 * - Un facteur n'est utilisé qu'une fois **validé** ; une seule version validée par famille.
 * - Valider une nouvelle version clôt l'ancienne (« remplacée ») sans la modifier : les calculs déjà faits
 *   gardent la version qu'ils ont utilisée (décision du 12/11/2026).
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { writeAudit } from "@/modules/audit/audit";
import { AdminError } from "@/modules/admin/accounts";
import { type AuthUser, requirePermission } from "@/modules/auth/permissions";
import { AGRIBALYSE_DATE, AGRIBALYSE_PROPOSAL, AGRIBALYSE_SOURCE, AGRIBALYSE_VERSION } from "./agribalyse-proposal";

/** Étapes retenues : production jusqu'à la livraison, sans la distribution en magasin ni la cuisson chez le consommateur. */
export const RETAINED_STAGES = ["agriculture", "transformation", "emballage", "transport"] as const;
export const STAGE_LABELS: Record<keyof s.FactorStages, string> = {
  agriculture: "Agriculture",
  transformation: "Transformation",
  emballage: "Emballage",
  transport: "Transport",
  distribution: "Supermarché et distribution",
  consommation: "Consommation",
};
export const AGRIBALYSE_HYPOTHESES =
  "Somme des étapes agriculture, transformation, emballage et transport d'Agribalyse : impact du produit jusqu'à sa livraison. " +
  "Ne comprend pas la distribution en magasin ni la cuisson chez le consommateur (la cuisine de La Brigade n'est pas comptée). " +
  "Produit cru représentatif de la famille.";

export function retainedValue(stages: s.FactorStages): number {
  return Math.round(RETAINED_STAGES.reduce((a, k) => a + stages[k], 0) * 10_000) / 10_000;
}

/** Crée les familles manquantes de la proposition Agribalyse et propose un facteur aux familles qui n'en ont aucun. */
export async function loadAgribalyseProposal(db: Db, admin: AuthUser, now = new Date()) {
  requirePermission(admin, "referentiel.manage");
  return db.transaction(async (tx) => {
    const families = await tx.select().from(s.foodFamilies);
    const factors = await tx.select({ familyId: s.emissionFactors.familyId }).from(s.emissionFactors);
    const withFactor = new Set(factors.map((f) => f.familyId));
    let createdFamilies = 0;
    let proposed = 0;
    for (const [i, p] of AGRIBALYSE_PROPOSAL.entries()) {
      let family = families.find((f) => f.code === p.code);
      if (!family) {
        [family] = await tx.insert(s.foodFamilies).values({ code: p.code, name: p.name, category: p.category, displayOrder: i, createdAt: now }).returning();
        createdFamilies++;
      }
      if (withFactor.has(family!.id)) continue;
      await tx.insert(s.emissionFactors).values({
        familyId: family!.id,
        version: 1,
        kgCo2ePerKg: retainedValue(p.stages),
        source: AGRIBALYSE_SOURCE,
        sourceVersion: AGRIBALYSE_VERSION,
        referenceDate: AGRIBALYSE_DATE,
        referenceCode: p.agb,
        referenceName: p.product,
        stages: p.stages,
        hypotheses: `${AGRIBALYSE_HYPOTHESES}${p.dqr != null ? ` Qualité des données Agribalyse (DQR) : ${p.dqr.toLocaleString("fr-FR")} (1 = très bonne, 5 = très faible).` : ""}`,
        createdBy: admin.id,
        createdAt: now,
      });
      proposed++;
    }
    await writeAudit(tx, { userId: admin.id, action: "load_proposal", entity: "emission_factor", after: { source: `${AGRIBALYSE_SOURCE} ${AGRIBALYSE_VERSION}`, createdFamilies, proposed }, occurredAt: now });
    return { createdFamilies, proposed };
  });
}

/** Familles et toutes les versions de leurs facteurs (écran d'administration). */
export async function listFamiliesForAdmin(db: Db, admin: AuthUser) {
  requirePermission(admin, "referentiel.manage");
  const [families, factors] = await Promise.all([
    db.select().from(s.foodFamilies).orderBy(asc(s.foodFamilies.displayOrder), asc(s.foodFamilies.name)),
    db.select().from(s.emissionFactors).orderBy(desc(s.emissionFactors.version)),
  ]);
  return families.map((f) => {
    const versions = factors.filter((x) => x.familyId === f.id);
    return { ...f, current: versions.find((v) => v.status === "valide") ?? null, proposal: versions.find((v) => v.status === "propose") ?? null, versions };
  });
}

/** Valide des propositions : chacune remplace la version validée de sa famille. */
export async function validateFactors(db: Db, admin: AuthUser, ids: readonly string[], now = new Date()) {
  requirePermission(admin, "referentiel.manage");
  if (!ids.length) return 0;
  return db.transaction(async (tx) => {
    const proposals = await tx.select().from(s.emissionFactors).where(and(inArray(s.emissionFactors.id, [...ids]), eq(s.emissionFactors.status, "propose")));
    if (proposals.length !== new Set(ids).size) throw new AdminError("Proposition introuvable ou déjà traitée : rechargez la page");
    for (const p of proposals) {
      const [previous] = await tx
        .update(s.emissionFactors)
        .set({ status: "remplace", closedAt: now })
        .where(and(eq(s.emissionFactors.familyId, p.familyId), eq(s.emissionFactors.status, "valide")))
        .returning();
      await tx.update(s.emissionFactors).set({ status: "valide", validatedBy: admin.id, validatedAt: now }).where(eq(s.emissionFactors.id, p.id));
      await writeAudit(tx, {
        userId: admin.id,
        action: "validate",
        entity: "emission_factor",
        entityId: p.id,
        before: previous ? { version: previous.version, kgCo2ePerKg: previous.kgCo2ePerKg } : null,
        after: { version: p.version, kgCo2ePerKg: p.kgCo2ePerKg, source: p.source, reference: p.referenceName },
        occurredAt: now,
      });
    }
    return proposals.length;
  });
}

export async function rejectFactor(db: Db, admin: AuthUser, id: string, now = new Date()) {
  requirePermission(admin, "referentiel.manage");
  const [rejected] = await db
    .update(s.emissionFactors)
    .set({ status: "refuse", closedAt: now })
    .where(and(eq(s.emissionFactors.id, id), eq(s.emissionFactors.status, "propose")))
    .returning();
  if (!rejected) throw new AdminError("Proposition introuvable ou déjà traitée : rechargez la page");
  await writeAudit(db, { userId: admin.id, action: "reject", entity: "emission_factor", entityId: id, after: { version: rejected.version, kgCo2ePerKg: rejected.kgCo2ePerKg }, occurredAt: now });
}

const proposalSchema = z.object({
  kgCo2ePerKg: z.number({ message: "Valeur invalide" }).finite().min(0, "La valeur ne peut pas être négative").max(1000),
  source: z.string().trim().min(3, "Indiquez la source").max(200),
  sourceVersion: z.string().trim().max(40).nullable(),
  referenceName: z.string().trim().max(200).nullable(),
  hypotheses: z.string().trim().min(10, "Indiquez les hypothèses du calcul").max(1000),
});

/** Nouvelle version proposée (valeur saisie avec sa source) ; elle remplace une proposition en attente. */
export async function proposeFactor(db: Db, admin: AuthUser, familyId: string, raw: z.input<typeof proposalSchema>, now = new Date()) {
  requirePermission(admin, "referentiel.manage");
  const parsed = proposalSchema.safeParse(raw);
  if (!parsed.success) throw new AdminError(parsed.error.issues[0]?.message ?? "Saisie invalide");
  return db.transaction(async (tx) => {
    const [family] = await tx.select().from(s.foodFamilies).where(eq(s.foodFamilies.id, familyId));
    if (!family) throw new AdminError("Famille introuvable");
    await tx.update(s.emissionFactors).set({ status: "refuse", closedAt: now }).where(and(eq(s.emissionFactors.familyId, familyId), eq(s.emissionFactors.status, "propose")));
    const [last] = await tx.select({ version: s.emissionFactors.version }).from(s.emissionFactors).where(eq(s.emissionFactors.familyId, familyId)).orderBy(desc(s.emissionFactors.version)).limit(1);
    const [created] = await tx
      .insert(s.emissionFactors)
      .values({ familyId, version: (last?.version ?? 0) + 1, ...parsed.data, createdBy: admin.id, createdAt: now })
      .returning();
    await writeAudit(tx, { userId: admin.id, action: "propose", entity: "emission_factor", entityId: created!.id, after: { family: family.name, ...parsed.data }, occurredAt: now });
    return created!;
  });
}

const familySchema = z.object({
  name: z.string().trim().min(2, "Indiquez le nom de la famille").max(80),
  category: z.string().trim().min(2, "Indiquez la catégorie").max(60),
});

/** Nouvelle famille sans facteur : sa valeur se propose ensuite avec sa source (« Proposer une autre valeur »). */
export async function createFamily(db: Db, admin: AuthUser, raw: z.input<typeof familySchema>, now = new Date()) {
  requirePermission(admin, "referentiel.manage");
  const parsed = familySchema.safeParse(raw);
  if (!parsed.success) throw new AdminError(parsed.error.issues[0]?.message ?? "Saisie invalide");
  const families = await db.select().from(s.foodFamilies);
  const key = (n: string) => n.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (families.some((f) => key(f.name) === key(parsed.data.name))) throw new AdminError("Cette famille existe déjà");
  let code = key(parsed.data.name).toUpperCase().replace(/ /g, "_").slice(0, 40) || "FAMILLE";
  if (families.some((f) => f.code === code)) code = `${code}_${families.length + 1}`;
  const [created] = await db
    .insert(s.foodFamilies)
    .values({ code, ...parsed.data, displayOrder: Math.max(0, ...families.map((f) => f.displayOrder)) + 1, createdAt: now })
    .returning();
  await writeAudit(db, { userId: admin.id, action: "create", entity: "food_family", entityId: created!.id, after: parsed.data, occurredAt: now });
  return created!;
}

/** Facteurs validés en vigueur, par famille (pour les calculs des étapes suivantes). */
export async function validFactors(db: Db) {
  const rows = await db.select().from(s.emissionFactors).where(eq(s.emissionFactors.status, "valide"));
  return new Map(rows.map((r) => [r.familyId, r]));
}
