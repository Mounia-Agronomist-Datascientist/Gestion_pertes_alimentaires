/**
 * Enregistrement d'une déclaration de perte.
 * Toutes les règles sont appliquées ici, côté serveur, quel que soit l'écran utilisé.
 */
import { and, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { DestinationError, validateDestinationSplit } from "@/domain/destinations";
import { roundQuantity } from "@/domain/nombres";
import { isLateDeclaration, toProductionLocalDate } from "@/domain/semaine-production";
import { computeNetWeight, type GastroLine, type SupportTare, TareError } from "@/domain/tares";
import { convertToKg, type KgStatus, QuantityError, type UnitKind } from "@/domain/unites";
import { writeAudit } from "@/modules/audit/audit";
import { type AuthUser, can, ForbiddenError, requirePermission } from "@/modules/auth/permissions";
import { findStoredProductionWeek } from "@/modules/referentiels/weeks";
import { canModifyDeclaration, canReadDeclaration, isBoundByTeamDelay, isWithinTeamDelay, TEAM_DELAY_DAYS } from "./access";
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

/** Valeurs calculées d'une déclaration, prêtes à être enregistrées. */
type PreparedDeclaration = Awaited<ReturnType<typeof prepareDeclaration>>;

/**
 * Contrôle une saisie et calcule toutes les valeurs à enregistrer, sans rien écrire.
 * Utilisé à la création et à la correction : les règles ne sont écrites qu'une fois.
 * `declaredAt` : horodatage de la saisie initiale (conservé lors d'une correction).
 */
async function prepareDeclaration(db: Db, user: AuthUser, rawInput: unknown, now: Date, declaredAt: Date) {
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
  if (isBoundByTeamDelay(user) && !isWithinTeamDelay(input.occurredOn, today)) {
    throw new DeclarationError(
      `Une perte de plus de ${TEAM_DELAY_DAYS} jours ne peut être déclarée que par un responsable`,
    );
  }
  const [lossWeek, declaredWeek] = await Promise.all([
    findStoredProductionWeek(db, input.occurredOn),
    findStoredProductionWeek(db, toProductionLocalDate(declaredAt)),
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
  const measurementMethod: (typeof s.measurementMethodEnum.enumValues)[number] =
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

  return {
    values: {
      occurredOn: input.occurredOn,
      occurredTime: input.occurredTime ?? null,
      declaredAt,
      productionWeekId: lossWeek.id,
      declaredWeekId: declaredWeek.id,
      isLate,
      zoneId: place.zone.id,
      subzoneId: place.subzone.id,
      teamId,
      responsibility: teamId ? ("equipe" as const) : ("zone" as const),
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
    },
    containers: measurement.containers,
    destinations: input.destinations.map((d) => ({
      destinationId: d.destinationId,
      quantity: roundQuantity(d.quantity),
      netKg: kgPerUnit != null ? roundQuantity(d.quantity * kgPerUnit) : null,
    })),
  };
}

/** Enregistre les tares et destinations d'une version donnée et renvoie l'instantané complet. */
async function writeVersionLines(
  tx: Db,
  declaration: typeof s.lossDeclarations.$inferSelect,
  prepared: Pick<PreparedDeclaration, "containers" | "destinations">,
) {
  const containers = prepared.containers.length
    ? await tx
        .insert(s.declarationContainers)
        .values(
          prepared.containers.map((c) => ({
            declarationId: declaration.id,
            revision: declaration.revision,
            containerTareId: c.containerTareId,
            count: c.count,
            tareKgSnapshot: c.tareKg,
          })),
        )
        .returning()
    : [];
  const destinations = await tx
    .insert(s.declarationDestinations)
    .values(prepared.destinations.map((d) => ({ ...d, declarationId: declaration.id, revision: declaration.revision })))
    .returning();
  return { declaration, containers, destinations };
}

function summarize(declaration: typeof s.lossDeclarations.$inferSelect): CreatedDeclaration {
  return {
    id: declaration.id,
    isLate: declaration.isLate,
    netQuantity: declaration.netQuantity,
    netUnitCode: declaration.netUnitCode,
    netKg: declaration.netKg,
    kgStatus: declaration.kgStatus,
  };
}

/** Insère une nouvelle déclaration validée (version 1, instantané, audit) dans une transaction ouverte. */
async function insertNewDeclaration(
  tx: Db,
  user: AuthUser,
  prepared: PreparedDeclaration,
  now: Date,
  batchId: string | null = null,
): Promise<CreatedDeclaration> {
  const [declaration] = await tx
    .insert(s.lossDeclarations)
    .values({ ...prepared.values, status: "validee", revision: 1, createdBy: user.id, batchId })
    .returning();
  if (!declaration) throw new Error("Enregistrement impossible");

  const snapshot = await writeVersionLines(tx, declaration, prepared);
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
  return summarize(declaration);
}

export async function createDeclaration(
  db: Db,
  user: AuthUser,
  rawInput: unknown,
  now: Date = new Date(),
): Promise<CreatedDeclaration> {
  requirePermission(user, "declaration.create");
  const prepared = await prepareDeclaration(db, user, rawInput, now, now);
  return db.transaction((tx) => insertNewDeclaration(tx, user, prepared, now));
}

// ─── Déclaration groupée (docs/ECRANS_PHASE1.md E4) ───────────────────────────

export const MAX_BATCH_LINES = 50;

/** Erreurs dues à la saisie (affichables), par opposition aux pannes techniques. */
export function isInputError(e: unknown): e is Error {
  return [DeclarationError, TareError, QuantityError, DestinationError, ForbiddenError].some((E) => e instanceof E);
}

/** Une ligne du lot est invalide : rien n'a été enregistré. `lineIndex` commence à 0. */
export class BatchLineError extends DeclarationError {
  constructor(
    readonly lineIndex: number,
    message: string,
  ) {
    super(`Ligne ${lineIndex + 1} : ${message}`);
  }
}

/**
 * Enregistre plusieurs pertes d'un coup. Toutes les lignes sont contrôlées avant la moindre écriture,
 * puis enregistrées dans une seule transaction : soit tout est enregistré, soit rien.
 */
export async function createDeclarationBatch(
  db: Db,
  user: AuthUser,
  rawInputs: readonly unknown[],
  now: Date = new Date(),
): Promise<CreatedDeclaration[]> {
  requirePermission(user, "declaration.create");
  if (rawInputs.length === 0) throw new DeclarationError("La liste est vide");
  if (rawInputs.length > MAX_BATCH_LINES) {
    throw new DeclarationError(`Au plus ${MAX_BATCH_LINES} pertes à la fois`);
  }

  const prepared: PreparedDeclaration[] = [];
  for (const [index, raw] of rawInputs.entries()) {
    try {
      prepared.push(await prepareDeclaration(db, user, raw, now, now));
    } catch (e) {
      if (!isInputError(e)) throw e;
      throw new BatchLineError(index, e.message);
    }
  }

  return db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(s.declarationBatches)
      .values({ createdBy: user.id, defaults: { lines: prepared.length }, closedAt: now, createdAt: now })
      .returning();
    const created: CreatedDeclaration[] = [];
    for (const p of prepared) created.push(await insertNewDeclaration(tx, user, p, now, batch!.id));
    return created;
  });
}

// ─── Corrections et annulations (docs/REGLES_METIER.md R5, R6) ─────────────────

/** La déclaration a été modifiée par quelqu'un d'autre depuis son affichage. */
export class DeclarationConflictError extends DeclarationError {
  constructor() {
    super("Cette perte vient d'être modifiée par quelqu'un d'autre : rechargez la page avant de corriger.");
  }
}

export interface ChangeOptions {
  reason: string;
  /** Version affichée à l'utilisateur au moment où il a commencé la modification. */
  expectedRevision: number;
}

async function loadForChange(db: Db, user: AuthUser, id: string, options: ChangeOptions, now: Date) {
  const reason = options.reason?.trim() ?? "";
  if (reason.length < 3) throw new DeclarationError("Indiquez le motif de la modification");

  const [existing] = await db.select().from(s.lossDeclarations).where(eq(s.lossDeclarations.id, id));
  if (!existing || !canReadDeclaration(user, existing)) throw new DeclarationError("Déclaration introuvable");
  if (existing.status === "annulee") throw new DeclarationError("Cette déclaration est annulée : elle ne peut plus être modifiée");

  if (!canModifyDeclaration(user, existing, toProductionLocalDate(now))) {
    throw new ForbiddenError("Vous ne pouvez plus modifier cette déclaration : demandez à un responsable");
  }
  if (existing.revision !== options.expectedRevision) throw new DeclarationConflictError();
  return { existing, reason };
}

async function currentSnapshot(db: Db, declaration: typeof s.lossDeclarations.$inferSelect) {
  const [containers, destinations] = await Promise.all([
    db
      .select()
      .from(s.declarationContainers)
      .where(and(eq(s.declarationContainers.declarationId, declaration.id), eq(s.declarationContainers.revision, declaration.revision))),
    db
      .select()
      .from(s.declarationDestinations)
      .where(and(eq(s.declarationDestinations.declarationId, declaration.id), eq(s.declarationDestinations.revision, declaration.revision))),
  ]);
  return { declaration, containers, destinations };
}

/**
 * Corrige une déclaration : nouvelle version complète, anciennes valeurs conservées,
 * date de saisie initiale inchangée, motif obligatoire.
 */
export async function correctDeclaration(
  db: Db,
  user: AuthUser,
  id: string,
  rawInput: unknown,
  options: ChangeOptions,
  now: Date = new Date(),
): Promise<CreatedDeclaration> {
  const { existing, reason } = await loadForChange(db, user, id, options, now);
  const prepared = await prepareDeclaration(db, user, rawInput, now, existing.declaredAt);
  const before = await currentSnapshot(db, existing);

  return db.transaction(async (tx) => {
    const revision = existing.revision + 1;
    const [declaration] = await tx
      .update(s.lossDeclarations)
      .set({ ...prepared.values, status: "corrigee", revision })
      .where(and(eq(s.lossDeclarations.id, id), eq(s.lossDeclarations.revision, existing.revision)))
      .returning();
    if (!declaration) throw new DeclarationConflictError();

    const after = await writeVersionLines(tx, declaration, prepared);
    await tx.insert(s.declarationRevisions).values({
      declarationId: id,
      revision,
      status: "corrigee",
      data: after,
      changedBy: user.id,
      changedAt: now,
      reason,
    });
    await writeAudit(tx, { userId: user.id, action: "update", entity: "loss_declaration", entityId: id, before, after, reason, occurredAt: now });
    return summarize(declaration);
  });
}

/** Annule une déclaration : elle reste consultable mais sort des statistiques. */
export async function cancelDeclaration(
  db: Db,
  user: AuthUser,
  id: string,
  options: ChangeOptions,
  now: Date = new Date(),
): Promise<void> {
  const { existing, reason } = await loadForChange(db, user, id, options, now);
  const before = await currentSnapshot(db, existing);

  await db.transaction(async (tx) => {
    const revision = existing.revision + 1;
    const [declaration] = await tx
      .update(s.lossDeclarations)
      .set({ status: "annulee", revision, updatedAt: now })
      .where(and(eq(s.lossDeclarations.id, id), eq(s.lossDeclarations.revision, existing.revision)))
      .returning();
    if (!declaration) throw new DeclarationConflictError();

    // Les lignes de tares et destinations sont reconduites telles quelles dans la nouvelle version.
    const after = await writeVersionLines(tx, declaration, {
      containers: before.containers.map((c) => ({ containerTareId: c.containerTareId, count: c.count, tareKg: c.tareKgSnapshot })),
      destinations: before.destinations.map((d) => ({ destinationId: d.destinationId, quantity: d.quantity, netKg: d.netKg })),
    });
    await tx.insert(s.declarationRevisions).values({
      declarationId: id,
      revision,
      status: "annulee",
      data: after,
      changedBy: user.id,
      changedAt: now,
      reason,
    });
    await writeAudit(tx, { userId: user.id, action: "cancel", entity: "loss_declaration", entityId: id, before, after, reason, occurredAt: now });
  });
}
