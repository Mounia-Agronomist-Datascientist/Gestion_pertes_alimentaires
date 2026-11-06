/**
 * Enregistrement d'une déclaration de perte.
 * Toutes les règles sont appliquées ici, côté serveur, quel que soit l'écran utilisé.
 */
import { and, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { validateDestinationSplit } from "@/domain/destinations";
import { roundQuantity } from "@/domain/nombres";
import { isLateDeclaration, toProductionLocalDate } from "@/domain/semaine-production";
import { computeNetWeight, type GastroLine, type SupportTare } from "@/domain/tares";
import { convertToKg, type KgStatus, type UnitKind } from "@/domain/unites";
import { writeAudit } from "@/modules/audit/audit";
import { type AuthUser, can, requirePermission } from "@/modules/auth/permissions";
import { findStoredProductionWeek } from "@/modules/referentiels/weeks";
import { declarationInputSchema } from "./input";

/** Erreur de saisie, affichable telle quelle à l'utilisateur. */
export class DeclarationError extends Error {}

export interface CreatedDeclaration {
  id: string;
  isLate: boolean;
  netQuantity: number;
  netUnitCode: string;
  netKg: number | null;
  kgStatus: KgStatus;
}

export async function createDeclaration(
  db: Db,
  user: AuthUser,
  rawInput: unknown,
  now: Date = new Date(),
): Promise<CreatedDeclaration> {
  requirePermission(user, "declaration.create");

  const parsed = declarationInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new DeclarationError(parsed.error.issues[0]?.message ?? "Saisie invalide");
  }
  const input = parsed.data;

  // ─── Lieu ───────────────────────────────────────────────────────────────
  const [place] = await db
    .select({ subzone: s.subzones, zone: s.zones })
    .from(s.subzones)
    .innerJoin(s.zones, eq(s.subzones.zoneId, s.zones.id))
    .where(eq(s.subzones.id, input.subzoneId));
  if (!place || !place.subzone.active || !place.zone.active) {
    throw new DeclarationError("Sous-zone inconnue ou désactivée");
  }
  const limitedToOwnZones = can(user, "declaration.read.zone") && !can(user, "declaration.read.all");
  if (limitedToOwnZones && !user.zoneIds.includes(place.zone.id)) {
    throw new DeclarationError("Vous ne pouvez déclarer que dans vos zones");
  }

  // ─── Semaines ───────────────────────────────────────────────────────────
  const today = toProductionLocalDate(now);
  if (input.occurredOn > today) {
    throw new DeclarationError("La date de la perte ne peut pas être dans le futur");
  }
  const [lossWeek, declaredWeek] = await Promise.all([
    findStoredProductionWeek(db, input.occurredOn),
    findStoredProductionWeek(db, today),
  ]);
  if (!lossWeek || !declaredWeek) {
    throw new DeclarationError("Aucune semaine de production paramétrée pour cette date : prévenez l'administrateur");
  }
  const isLate = isLateDeclaration(lossWeek, declaredWeek);

  // ─── Équipe (docs/REGLES_METIER.md R7) ──────────────────────────────────
  let teamId: string | null = null;
  if (place.subzone.teamMode === "equipe") {
    teamId = user.teamId ?? input.teamId ?? null;
    if (!teamId) throw new DeclarationError("Choisissez l'équipe concernée");
    const [team] = await db.select().from(s.teams).where(eq(s.teams.id, teamId));
    const [weekStatus] = await db
      .select()
      .from(s.teamWeekStatus)
      .where(and(eq(s.teamWeekStatus.teamId, teamId), eq(s.teamWeekStatus.productionWeekId, lossWeek.id)));
    if (!team || !team.active || weekStatus?.active === false) {
      throw new DeclarationError("Cette équipe n'est pas active pour cette semaine");
    }
  }

  // ─── Produit ────────────────────────────────────────────────────────────
  let product: {
    id: string | null;
    unlisted: boolean;
    category: (typeof s.productCategoryEnum.enumValues)[number];
    name: string;
    externalId: string | null;
    code: string | null;
    variant: string | null;
    unitWeightKg: number | null;
    densityKgPerL: number | null;
  };
  if ("productId" in input.product) {
    const [row] = await db.select().from(s.products).where(eq(s.products.id, input.product.productId));
    if (!row || !row.active) throw new DeclarationError("Produit inconnu ou désactivé");
    product = {
      id: row.id,
      unlisted: false,
      category: row.category,
      name: row.name,
      externalId: row.externalId,
      code: row.code,
      variant: row.variant,
      unitWeightKg: row.unitWeightKg,
      densityKgPerL: row.densityKgPerL,
    };
  } else {
    product = {
      id: null,
      unlisted: true,
      category: input.product.category,
      name: input.product.freeLabel,
      externalId: null,
      code: null,
      variant: null,
      unitWeightKg: null,
      densityKgPerL: null,
    };
  }
  const isConsumable = product.category === "consommable";

  // ─── Quantité ───────────────────────────────────────────────────────────
  let measurement: {
    quantity: number;
    unitCode: string;
    tareTotalKg: number | null;
    netQuantity: number;
    netUnitCode: string;
    netKg: number | null;
    kgStatus: KgStatus;
    factorUsed: number | null;
    containers: { containerTareId: string; count: number; tareKg: number }[];
  };

  if (input.tare) {
    if (isConsumable) throw new DeclarationError("La pesée en gastros concerne les denrées, pas les consommables");
    const typeIds = [
      ...input.tare.gastros.map((g) => g.containerTypeId),
      ...(input.tare.supportTypeId ? [input.tare.supportTypeId] : []),
    ];
    const tareRows = typeIds.length
      ? await db
          .select({ type: s.containerTypes, tare: s.containerTares })
          .from(s.containerTares)
          .innerJoin(s.containerTypes, eq(s.containerTares.containerTypeId, s.containerTypes.id))
          .where(
            and(
              inArray(s.containerTypes.id, typeIds),
              lte(s.containerTares.validFrom, input.occurredOn),
              or(isNull(s.containerTares.validTo), gte(s.containerTares.validTo, input.occurredOn)),
            ),
          )
      : [];
    const tareOf = (typeId: string, kind: "gastro" | "support") => {
      const row = tareRows.find((r) => r.type.id === typeId);
      if (!row || !row.type.active || row.type.kind !== kind) {
        throw new DeclarationError("Contenant inconnu ou sans tare en vigueur à cette date");
      }
      return row;
    };
    const gastros: GastroLine[] = input.tare.gastros.map((g) => {
      const row = tareOf(g.containerTypeId, "gastro");
      return { containerTypeId: g.containerTypeId, tareId: row.tare.id, unitTareKg: row.tare.unitTareKg, count: g.count, maxCount: row.type.maxCount };
    });
    let support: SupportTare | null = null;
    if (input.tare.supportTypeId) {
      const row = tareOf(input.tare.supportTypeId, "support");
      support = { containerTypeId: row.type.id, tareId: row.tare.id, unitTareKg: row.tare.unitTareKg };
    }
    const result = computeNetWeight({ grossKg: input.tare.grossKg, gastros, support });
    measurement = {
      quantity: result.grossKg,
      unitCode: "kg",
      tareTotalKg: result.tareTotalKg,
      netQuantity: result.netKg,
      netUnitCode: "kg",
      netKg: result.netKg,
      kgStatus: "pese",
      factorUsed: null,
      containers: result.lines.map((l) => ({ containerTareId: l.tareId, count: l.count, tareKg: l.tareKg })),
    };
  } else {
    const [unit] = await db.select().from(s.units).where(eq(s.units.code, input.unitCode!));
    if (!unit || !unit.active) throw new DeclarationError("Unité inconnue");
    const quantity = roundQuantity(input.quantity!);
    const conversion = convertToKg(quantity, { code: unit.code, kind: unit.kind as UnitKind, toBaseFactor: unit.toBaseFactor }, {
      isConsumable,
      unitWeightKg: product.unitWeightKg,
      densityKgPerL: product.densityKgPerL,
    });
    measurement = {
      quantity,
      unitCode: unit.code,
      tareTotalKg: null,
      netQuantity: quantity,
      netUnitCode: unit.code,
      netKg: conversion.netKg,
      kgStatus: conversion.kgStatus,
      factorUsed: conversion.factorUsed,
      containers: [],
    };
  }
  const measurementMethod =
    input.method === "comptage" && measurement.kgStatus === "converti" ? "conversion_reference" : input.method;

  // ─── Cause ──────────────────────────────────────────────────────────────
  const [cause] = await db.select().from(s.causes).where(eq(s.causes.id, input.causeId));
  if (!cause || cause.status !== "active") throw new DeclarationError("Cause inconnue ou désactivée");
  if (!cause.isOther) {
    const [inZone] = await db
      .select()
      .from(s.causeZones)
      .where(and(eq(s.causeZones.causeId, cause.id), eq(s.causeZones.zoneId, place.zone.id)));
    if (!inZone) throw new DeclarationError("Cette cause n'est pas proposée dans cette zone");
    const restrictions = await db.select().from(s.causeSubzones).where(eq(s.causeSubzones.causeId, cause.id));
    if (restrictions.length > 0 && !restrictions.some((r) => r.subzoneId === place.subzone.id)) {
      throw new DeclarationError("Cette cause n'est pas proposée dans cette sous-zone");
    }
  }

  // ─── Destinations (docs/REGLES_METIER.md R4) ────────────────────────────
  const destinationRows = await db
    .select()
    .from(s.destinations)
    .where(inArray(s.destinations.id, input.destinations.map((d) => d.destinationId)));
  for (const d of input.destinations) {
    const row = destinationRows.find((r) => r.id === d.destinationId);
    if (!row || !row.active) throw new DeclarationError("Destination inconnue ou désactivée");
  }
  const { justification } = validateDestinationSplit(
    measurement.netQuantity,
    input.destinations,
    input.destinationGapJustification,
  );
  const kgPerUnit = measurement.netKg != null ? measurement.netKg / measurement.netQuantity : null;

  // ─── Enregistrement ─────────────────────────────────────────────────────
  return db.transaction(async (tx) => {
    const [declaration] = await tx
      .insert(s.lossDeclarations)
      .values({
        status: "validee",
        occurredOn: input.occurredOn,
        occurredTime: input.occurredTime ?? null,
        declaredAt: now,
        productionWeekId: lossWeek.id,
        declaredWeekId: declaredWeek.id,
        isLate,
        zoneId: place.zone.id,
        subzoneId: place.subzone.id,
        teamId,
        responsibility: teamId ? "equipe" : "zone",
        createdBy: user.id,
        productId: product.id,
        productUnlisted: product.unlisted,
        productCategory: product.category,
        productName: product.name,
        productExternalId: product.externalId,
        productCode: product.code,
        productVariant: product.variant,
        measurementMethod,
        quantity: measurement.quantity,
        unitCode: measurement.unitCode,
        tareTotalKg: measurement.tareTotalKg,
        netQuantity: measurement.netQuantity,
        netUnitCode: measurement.netUnitCode,
        netKg: measurement.netKg,
        kgStatus: measurement.kgStatus,
        conversionFactorUsed: measurement.factorUsed,
        causeId: cause.id,
        causeName: cause.name,
        comment: input.comment || null,
        destinationGapJustification: justification,
        updatedAt: now,
      })
      .returning();
    if (!declaration) throw new Error("Enregistrement impossible");

    const containers = measurement.containers.length
      ? await tx
          .insert(s.declarationContainers)
          .values(
            measurement.containers.map((c) => ({
              declarationId: declaration.id,
              containerTareId: c.containerTareId,
              count: c.count,
              tareKgSnapshot: c.tareKg,
            })),
          )
          .returning()
      : [];
    const destinations = await tx
      .insert(s.declarationDestinations)
      .values(
        input.destinations.map((d) => ({
          declarationId: declaration.id,
          destinationId: d.destinationId,
          quantity: roundQuantity(d.quantity),
          netKg: kgPerUnit != null ? roundQuantity(d.quantity * kgPerUnit) : null,
        })),
      )
      .returning();

    const snapshot = { declaration, containers, destinations };
    await tx.insert(s.declarationRevisions).values({
      declarationId: declaration.id,
      revision: 1,
      status: declaration.status,
      data: snapshot,
      changedBy: user.id,
      changedAt: now,
    });
    await writeAudit(tx, {
      userId: user.id,
      action: "create",
      entity: "loss_declaration",
      entityId: declaration.id,
      after: snapshot,
      occurredAt: now,
    });

    return {
      id: declaration.id,
      isLate,
      netQuantity: measurement.netQuantity,
      netUnitCode: measurement.netUnitCode,
      netKg: measurement.netKg,
      kgStatus: measurement.kgStatus,
    };
  });
}
