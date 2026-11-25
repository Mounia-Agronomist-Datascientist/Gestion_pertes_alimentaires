/**
 * Enregistrement d'une déclaration de perte.
 * Toutes les règles sont appliquées ici, côté serveur, quel que soit l'écran utilisé.
 */
import { and, eq, gte, inArray, isNull, lt, lte, or } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import {
  asksPackaging,
  COST_METHOD,
  discardedPackagingPerPortion,
  lossCostBreakdown,
  missingPackagingAnswer,
  packagingQuestionsFor,
} from "@/domain/couts";
import { commentRequiredFor, destinationAllowedIn } from "@/domain/devenirs";
import { cartonsProductError, snackAllowedIn } from "@/domain/encas";
import { CATALOG_ENTRY_ZONE_CODES, type FreePrice, freeCategoriesFor, freeUnitCost } from "@/domain/produit-absent";
import { normalizeCauseName as normalizeLabel } from "@/modules/admin/causes";
import { tomeKey } from "@/modules/imports/tome/parse-tome";
import { DestinationError, validateDestinationSplit } from "@/domain/destinations";
import {
  LotError,
  type LotLine,
  lotsAllowedIn,
  MAX_PHOTO_BYTES,
  PHOTO_RETENTION_MONTHS,
  validateLots,
} from "@/domain/lots";
import { roundQuantity } from "@/domain/nombres";
import { isLateDeclaration, toProductionLocalDate } from "@/domain/semaine-production";
import { computeNetWeight, type GastroLine, type SupportTare, TareError } from "@/domain/tares";
import { gastroTareAllowed, type MeasureContext, unitsFor } from "@/domain/saisie-mesure";
import { convertToKg, type KgStatus, QuantityError, type UnitKind } from "@/domain/unites";
import { packagingOptions } from "@/modules/matieres/colis";
import { writeAudit } from "@/modules/audit/audit";
import { type AuthUser, ForbiddenError, hasZone, requirePermission } from "@/modules/auth/permissions";
import { portionPackagingCost } from "@/modules/admin/packaging";
import { findWeekItem, type ResolvedWeekItem, SNACK_ZONE_CODES } from "@/modules/imports/catalog";
import { currentWeekImport } from "@/modules/imports/service";
import { materialPriceAt } from "@/modules/matieres/referentiel";
import { findStoredProductionWeek } from "@/modules/referentiels/weeks";
import {
  canModifyDeclaration,
  canReadDeclaration,
  isBoundByTeamDelay,
  isWithinTeamCorrectionDelay,
  isWithinTeamDelay,
  TEAM_DELAY_DAYS,
} from "./access";
import {
  declarationInputSchema,
  freePriceSchema,
  isNonFoodCategory,
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_LABELS,
} from "./input";

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

interface NewArticle {
  name: string;
  category: (typeof PRODUCT_CATEGORIES)[number];
  supplier: { supplierId: string } | { supplierName: string } | null;
  price: FreePrice | null;
  occurredOn: string;
}

/** Article actif de même type et de même nom (sans accents, majuscules ni espaces en trop). */
async function findEnteredArticle(db: Db, category: (typeof PRODUCT_CATEGORIES)[number], name: string) {
  const key = normalizeLabel(name);
  const rows = await db
    .select()
    .from(s.products)
    .where(and(eq(s.products.category, category), eq(s.products.active, true)));
  return rows.find((p) => normalizeLabel(`${p.name} ${p.variant ?? ""}`) === key) ?? null;
}

/**
 * Crée l'article saisi à la main (« à valider »), son fournisseur tapé s'il est nouveau (« à valider » aussi) et son
 * prix d'achat, dans la transaction de la perte ; la perte est alors rattachée à l'article.
 */
async function createEnteredArticle(tx: Db, user: AuthUser, prepared: PreparedDeclaration, now: Date) {
  const article = prepared.newArticle;
  if (!article) return;
  let product = await findEnteredArticle(tx, article.category, article.name);
  if (!product) {
    let supplierId: string | null = null;
    if (article.supplier && "supplierId" in article.supplier) supplierId = article.supplier.supplierId;
    else if (article.supplier) {
      const key = tomeKey(article.supplier.supplierName);
      const [known] = await tx.select().from(s.suppliers).where(eq(s.suppliers.key, key));
      supplierId =
        known?.id ??
        (
          await tx
            .insert(s.suppliers)
            .values({ name: article.supplier.supplierName, key, toValidate: true })
            .returning({ id: s.suppliers.id })
        )[0]!.id;
    }
    const [created] = await tx
      .insert(s.products)
      .values({
        category: article.category,
        name: article.name,
        defaultUnit: "kg",
        source: "saisie",
        toValidate: true,
        manualSupplierId: supplierId,
        enteredBy: user.id,
      })
      .returning();
    product = created!;
    if (article.price)
      await tx.insert(s.productPrices).values({
        productId: product!.id,
        source: "manuel",
        validFrom: article.occurredOn,
        perKgEur: article.price.per === "kg" ? article.price.amountEur : null,
        perUnitEur: article.price.per === "piece" ? article.price.amountEur : null,
        createdBy: user.id,
        createdAt: now,
      });
    await writeAudit(tx, {
      userId: user.id,
      action: "create_entered_article",
      entity: "product",
      entityId: product!.id,
      after: { ...article, productId: product!.id, supplierId },
      occurredAt: now,
    });
  }
  prepared.values.productId = product!.id;
  prepared.values.productUnlisted = false;
}

/**
 * Contrôle une saisie et calcule toutes les valeurs à enregistrer, sans rien écrire.
 * Utilisé à la création et à la correction : les règles ne sont écrites qu'une fois.
 * `declaredAt` : horodatage de la saisie initiale (conservé lors d'une correction).
 */
/** `keptDestinationIds` : destinations de la version corrigée, acceptées même si elles ne sont plus proposées aux équipes. */
async function prepareDeclaration(
  db: Db,
  user: AuthUser,
  rawInput: unknown,
  now: Date,
  declaredAt: Date,
  keptDestinationIds: readonly string[] = [],
  /** Heure de la saisie (sur l'appareil pour une perte envoyée plus tard) : le délai des équipes se compte à partir d'elle. */
  enteredAt: Date = now,
  /** Heure de réception, pour une perte saisie hors ligne. */
  receivedAt: Date | null = null,
  /** Correction : délai des équipes jusqu'à une semaine après la fin de la semaine de production. */
  correction = false,
) {
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
  if (!hasZone(user, place.zone.id)) {
    throw new DeclarationError("Vous ne pouvez déclarer que dans vos zones");
  }

  // ─── Semaines ───────────────────────────────────────────────────────────
  const today = toProductionLocalDate(enteredAt);
  if (input.occurredOn > today) {
    throw new DeclarationError("La date de la perte ne peut pas être dans le futur");
  }
  if (isBoundByTeamDelay(user)) {
    if (correction && !isWithinTeamCorrectionDelay(input.occurredOn, today)) {
      throw new DeclarationError(
        "Le délai de correction (une semaine après la fin de la semaine de production) est dépassé : demandez à un responsable",
      );
    }
    if (!correction && !isWithinTeamDelay(input.occurredOn, today)) {
      throw new DeclarationError(
        `Une perte de plus de ${TEAM_DELAY_DAYS} jours ne peut être déclarée que par un responsable`,
      );
    }
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

  // ─── Article saisi à la main en Réception ou Stockage (décision du 23/11/2026) ──
  // Déjà dans la liste (même nom, même type) : la perte est rattachée à cet article. Sinon, il sera créé « à valider »
  // au moment de l'enregistrement (`createEnteredArticle`).
  let newArticle: NewArticle | null = null;
  if ("freeLabel" in input.product && CATALOG_ENTRY_ZONE_CODES.includes(place.zone.code)) {
    const free = input.product;
    if (!freeCategoriesFor(place.zone.code, PRODUCT_CATEGORIES).includes(free.category))
      throw new DeclarationError(
        `Type de produit non proposé dans la zone ${place.zone.name} : ${PRODUCT_CATEGORY_LABELS[free.category]}`,
      );
    const existing = await findEnteredArticle(db, free.category, free.freeLabel);
    if (existing) input.product = { productId: existing.id };
    else {
      if (free.supplier && "supplierId" in free.supplier) {
        const [known] = await db.select().from(s.suppliers).where(eq(s.suppliers.id, free.supplier.supplierId));
        if (!known) throw new DeclarationError("Fournisseur inconnu : choisissez-le à nouveau");
      }
      newArticle = {
        name: free.freeLabel,
        category: free.category,
        supplier: free.supplier ?? null,
        price: free.price ?? null,
        occurredOn: input.occurredOn,
      };
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
    refs?: { weekRecipeId: string | null; weekSubRecipeId: string | null; weekLineId: string | null };
    /** Coûts du tome de la semaine et import d'origine (produits de la semaine uniquement). */
    cost?: {
      item: ResolvedWeekItem["cost"];
      importId: string | null;
      priceVersion?: { id: string; source: string; validFrom: string };
      /** Prix d'achat indiqué pour un produit absent de la liste (décision du 20/11/2026). */
      freePrice?: FreePrice;
    };
  };
  if ("weekItem" in input.product) {
    // Produit de l'import de la semaine (docs/PHASE2.md, étape 2.5).
    const item = await findWeekItem(db, input.product.weekItem.kind, input.product.weekItem.id, input.occurredOn);
    const current = await currentWeekImport(db, lossWeek.id);
    if (!item) throw new DeclarationError("Produit de la semaine introuvable");
    if (!current || item.importId !== current.id) {
      throw new DeclarationError("Ce produit ne fait pas partie de la semaine de la perte : choisissez-le à nouveau");
    }
    if (item.snack && !SNACK_ZONE_CODES.includes(place.zone.code)) {
      throw new DeclarationError("Les encas se déclarent en conditionnement, réception ou stockage");
    }
    if (
      input.product.weekItem.kind === "plat" &&
      !item.snack &&
      place.subzone.teamMode === "equipe" &&
      item.teamId !== teamId
    ) {
      throw new DeclarationError("Ce plat n'est pas produit par cette équipe cette semaine");
    }
    product = {
      id: null,
      unlisted: false,
      category: item.category,
      name: item.name,
      externalId: null,
      code: item.code,
      variant: null,
      unitWeightKg: item.unitWeightKg,
      densityKgPerL: item.densityKgPerL,
      refs: item.refs,
      cost: { item: item.cost, importId: item.importId },
    };
  } else if ("productId" in input.product) {
    const [row] = await db.select().from(s.products).where(eq(s.products.id, input.product.productId));
    if (!row || !row.active) throw new DeclarationError("Produit inconnu ou désactivé");
    if (row.category === "produit_externe" && !SNACK_ZONE_CODES.includes(place.zone.code)) {
      throw new DeclarationError("Les encas se déclarent en conditionnement, réception ou stockage");
    }
    if (row.category === "produit_externe" && !snackAllowedIn(place.zone.code, place.subzone.code, row.snackFamily)) {
      throw new DeclarationError(
        "Au Stockage, un encas se déclare là où il est rangé : yaourts et fromages au « Local encas frais », les autres au « Stockage sec - ENCAS »",
      );
    }
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
    // Matière du référentiel : prix en vigueur à la date de la perte (docs/PHASE6.md, étape 6.7).
    const price = await materialPriceAt(db, row.id, input.occurredOn);
    if (price) {
      const unitCost = { perKgEur: price.perKgEur, perUnitEur: price.perUnitEur };
      const mould = row.category === "moule_plat_gratin";
      product.cost = {
        item: {
          food: mould ? { perKgEur: null, perUnitEur: null } : unitCost,
          mouldPerPortionEur: null,
          moulds: [],
          portionKind: null,
          portionWeightKg: null,
          packagingItself: mould ? unitCost : null,
        },
        importId: price.weeklyImportId,
        priceVersion: { id: price.id, source: price.source, validFrom: price.validFrom },
      };
    }
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
    if (!freeCategoriesFor(place.zone.code, PRODUCT_CATEGORIES).includes(input.product.category))
      throw new DeclarationError(
        `Type de produit non proposé dans la zone ${place.zone.name} : ${PRODUCT_CATEGORY_LABELS[input.product.category]}`,
      );
    if (input.product.price) product.cost = freeCost(product.category, input.product.price);
  }
  const isConsumable = isNonFoodCategory(product.category);
  const cartonsError = cartonsProductError(place.subzone.code, product.category === "produit_externe");
  if (cartonsError) throw new DeclarationError(cartonsError);

  // ─── Façon de mesurer permise dans ce lieu pour ce produit (règle R25) ──────
  // Colis fournisseur (Réception, Stockage) : le colis connu choisi, dont le poids peut être corrigé à la saisie
  // (cartons de 2 kg reçus au lieu de 3 kg), ou un colis dont on indique le poids (« Autre colis »).
  let packaging: { kg: number; label: string } | null = null;
  if (!input.tare && input.unitCode === "colis") {
    const known = input.packagingKey
      ? product.id
        ? ((await packagingOptions(db, [product.id])).get(product.id)?.find((o) => o.key === input.packagingKey) ??
          null)
        : null
      : null;
    if (input.packagingKey && !known) {
      throw new DeclarationError("Colis inconnu pour ce produit : choisissez un colis de la liste");
    }
    const fmtKg = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: 3 })} kg`;
    const kg = roundQuantity(input.packagingKg ?? known!.kg);
    packaging = known
      ? {
          kg,
          label: `${known.label ?? "Colis"} — ${known.supplier}${
            Math.abs(kg - known.kg) > 0.0005 ? ` (reçu : ${fmtKg(kg)} au lieu de ${fmtKg(known.kg)})` : ""
          }`,
        }
      : { kg, label: `Colis de ${fmtKg(kg)} (poids indiqué à la saisie)` };
  }
  const measureContext: MeasureContext = {
    zoneCode: place.zone.code,
    subzoneCode: place.subzone.code,
    isConsumable,
    pieceWeightKnown: product.unitWeightKg != null,
    isSnack: product.category === "produit_externe",
    hasPackaging: packaging != null,
  };
  if (input.tare && !gastroTareAllowed(measureContext)) {
    throw new DeclarationError("Les gastros ne sont proposés qu'en cuisine");
  }
  if (!input.tare && !unitsFor(input.method, measureContext).includes(input.unitCode!)) {
    throw new DeclarationError("Unité non proposée dans ce lieu pour ce produit");
  }

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
    if (isConsumable)
      throw new DeclarationError("La pesée en gastros concerne les denrées, pas les consommables ni les moules");
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
      return {
        containerTypeId: g.containerTypeId,
        tareId: row.tare.id,
        unitTareKg: row.tare.unitTareKg,
        count: g.count,
        maxCount: row.type.maxCount,
      };
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
    // Colis fournisseur : poids du colis choisi (lu dans les bons ou saisi à la main).
    const conversion = packaging
      ? { netKg: roundQuantity(quantity * packaging.kg), kgStatus: "converti" as const, factorUsed: packaging.kg }
      : convertToKg(
          quantity,
          { code: unit.code, kind: unit.kind as UnitKind, toBaseFactor: unit.toBaseFactor },
          {
            isConsumable,
            unitWeightKg: product.unitWeightKg,
            densityKgPerL: product.densityKgPerL,
          },
        );
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
    .where(
      inArray(
        s.destinations.id,
        input.destinations.map((d) => d.destinationId),
      ),
    );
  for (const d of input.destinations) {
    const row = destinationRows.find((r) => r.id === d.destinationId);
    if (!row || !row.active) throw new DeclarationError("Destination inconnue ou désactivée");
    if (!destinationAllowedIn(row.kind, place.zone.code) && !keptDestinationIds.includes(row.id))
      throw new DeclarationError(`« ${row.name} » n'est pas proposée dans la zone ${place.zone.name}`);
    if (!row.declarable && !keptDestinationIds.includes(row.id)) {
      throw new DeclarationError(
        `« ${row.name} » n'est plus déclarée par les équipes : ses chiffres viennent des fichiers de l'entreprise`,
      );
    }
    if (d.recoveredAmountEur != null && !row.financialRecovery) {
      throw new DeclarationError(
        `« ${row.name} » ne rapporte pas de recette : seules les ventes ont un montant encaissé`,
      );
    }
    if (row.binNumberMode === "obligatoire" && !d.binNumber)
      throw new DeclarationError(`Indiquez le n° de la poubelle pour « ${row.name} »`);
  }
  if (
    commentRequiredFor(
      destinationRows.filter((r) => input.destinations.some((d) => d.destinationId === r.id)).map((r) => r.kind),
    ) &&
    !input.comment?.trim()
  )
    throw new DeclarationError("Précisez en commentaire où part la perte (« Autre destination »)");
  const binAsked = new Set(destinationRows.filter((r) => r.binNumberMode !== "aucun").map((r) => r.id));
  const { justification } = validateDestinationSplit(
    measurement.netQuantity,
    input.destinations,
    input.destinationGapJustification,
  );
  const kgPerUnit = measurement.netKg != null ? measurement.netKg / measurement.netQuantity : null;

  // ─── Lots, DLC et photos (règle R37) ─────────────────────────────────────
  if ((input.lots?.length || input.photos?.length) && !lotsAllowedIn(place.zone.code)) {
    throw new DeclarationError("Les n° de lot, DLC et photos se notent à la Réception et au Stockage");
  }
  let lots: LotLine[] | null = null;
  if (input.lots?.length) {
    try {
      lots = validateLots(measurement.netQuantity, input.lots);
    } catch (e) {
      if (e instanceof LotError) throw new DeclarationError(e.message);
      throw e;
    }
  }
  const photos = { keep: [] as string[], add: [] as Buffer[] };
  for (const p of input.photos ?? []) {
    if ("photoId" in p) {
      photos.keep.push(p.photoId);
      continue;
    }
    const bytes = Buffer.from(p.dataUrl.slice(p.dataUrl.indexOf(",") + 1), "base64");
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff)
      throw new DeclarationError("Photo illisible : reprenez-la");
    if (bytes.length > MAX_PHOTO_BYTES) throw new DeclarationError("Photo trop lourde : reprenez-la");
    photos.add.push(bytes);
  }

  // ─── Coût brut figé (docs/PHASE3.md, étapes 3.3 et 3.4) ────────────────────
  // Coûts du tome de la semaine et emballages en vigueur à la date de la perte ; rien pour un produit sans coût.
  // Toutes les colonnes sont écrites (null par défaut) : une correction vers un produit sans coût efface l'ancien coût.
  let costSnapshot: Partial<typeof s.lossDeclarations.$inferInsert> = {
    costPerKgEur: null,
    costPerUnitEur: null,
    materialCostEur: null,
    packagingCostEur: null,
    labourCostEur: null,
    indirectCostEur: null,
    grossCostEur: null,
    costImportId: null,
    costMethod: null,
    costComputedAt: null,
    costDetails: null,
  };
  if (product.cost) {
    const c = product.cost.item;
    // Moule et barquette : comptés seulement s'ils sont jetés, en salle blanche et en salle des cartons (R42).
    const questions = packagingQuestionsFor(
      { zoneCode: place.zone.code, subzoneCode: place.subzone.code },
      { wholeDish: c.portionKind != null, moulds: c.moulds },
    );
    const missing = missingPackagingAnswer(questions, input.discarded);
    if (missing) throw new DeclarationError(missing);
    const packaging =
      c.portionKind && questions.tray && input.discarded?.tray
        ? await portionPackagingCost(db, c.portionKind, input.occurredOn)
        : null;
    const packagingPerPortionEur = discardedPackagingPerPortion(
      questions,
      input.discarded,
      packaging?.totalEur ?? null,
    );
    const loss = { netKg: measurement.netKg, quantity: measurement.netQuantity, unitCode: measurement.netUnitCode };
    const breakdown = lossCostBreakdown(loss, {
      food: c.food,
      packagingPerPortionEur,
      portionWeightKg: c.portionWeightKg,
      packagingItself: c.packagingItself ?? undefined,
    });
    costSnapshot = {
      costPerKgEur: c.food.perKgEur,
      costPerUnitEur: c.food.perUnitEur,
      materialCostEur: breakdown.foodEur,
      packagingCostEur: breakdown.packagingEur,
      labourCostEur: breakdown.labourEur,
      indirectCostEur: breakdown.indirectEur,
      grossCostEur: breakdown.grossEur,
      costImportId: product.cost.importId,
      costMethod: COST_METHOD,
      costComputedAt: now,
      costDetails: {
        portions: breakdown.portions,
        mouldPerPortionEur: c.mouldPerPortionEur,
        packagingPerPortionEur,
        packagingDate: packaging ? input.occurredOn : null,
        discarded: asksPackaging(questions)
          ? {
              ...(questions.moulds.length ? { moulds: input.discarded?.moulds ?? [] } : {}),
              ...(questions.tray ? { tray: !!input.discarded?.tray } : {}),
            }
          : null,
        moulds: questions.moulds.filter((m) => input.discarded?.moulds?.includes(m.label)),
        packagingComplete: packaging?.complete ?? null,
        packagingLines: packaging?.lines ?? [],
        packagingItself: c.packagingItself,
        priceVersion: product.cost.priceVersion ?? null,
        freePrice: product.cost.freePrice ?? null,
        labour: "non imputée : méthode d'affectation à définir (cahier des charges §18.2)",
      },
    };
  }

  return {
    newArticle,
    values: {
      occurredOn: input.occurredOn,
      occurredTime: input.occurredTime ?? null,
      declaredAt,
      ...(input.clientId ? { clientId: input.clientId } : {}),
      ...(receivedAt ? { receivedAt } : {}),
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
      weekRecipeId: product.refs?.weekRecipeId ?? null,
      weekSubRecipeId: product.refs?.weekSubRecipeId ?? null,
      weekLineId: product.refs?.weekLineId ?? null,
      ...costSnapshot,
      ...netCost(
        costSnapshot.grossCostEur,
        input.destinations.map((d) => ({ recoveredAmount: d.recoveredAmountEur })),
      ),
      measurementMethod,
      quantity: measurement.quantity,
      unitCode: measurement.unitCode,
      tareTotalKg: measurement.tareTotalKg,
      netQuantity: measurement.netQuantity,
      netUnitCode: measurement.netUnitCode,
      netKg: measurement.netKg,
      kgStatus: measurement.kgStatus,
      conversionFactorUsed: measurement.factorUsed,
      packagingLabel: packaging?.label ?? null,
      causeId: cause.id,
      causeName: cause.name,
      comment: input.comment || null,
      lots,
      destinationGapJustification: justification,
      updatedAt: now,
    },
    containers: measurement.containers,
    photos,
    destinations: input.destinations.map((d) => ({
      destinationId: d.destinationId,
      quantity: roundQuantity(d.quantity),
      netKg: kgPerUnit != null ? roundQuantity(d.quantity * kgPerUnit) : null,
      recoveredAmount: d.recoveredAmountEur ?? null,
      binNumber: binAsked.has(d.destinationId) ? d.binNumber || null : null,
    })),
  };
}

/** Coût d'un produit absent de la liste à partir du prix indiqué (un moule ou plat à gratin est un emballage). */
function freeCost(category: string, price: FreePrice) {
  const unitCost = freeUnitCost(price);
  const mould = category === "moule_plat_gratin";
  return {
    item: {
      food: mould ? { perKgEur: null, perUnitEur: null } : unitCost,
      mouldPerPortionEur: null,
      moulds: [],
      portionKind: null,
      portionWeightKg: null,
      packagingItself: mould ? unitCost : null,
    },
    importId: null,
    freePrice: price,
  } satisfies NonNullable<NonNullable<Parameters<typeof costColumns>[1]>>;
}

/**
 * Colonnes de coût d'une perte déjà enregistrée, recalculées à partir d'un coût unitaire (prix indiqué après coup,
 * ou prix du produit auquel la saisie « hors liste » est rattachée). Le coût net garde les recettes encaissées.
 */
function costColumns(
  d: typeof s.lossDeclarations.$inferSelect,
  cost: {
    item: {
      food: { perKgEur: number | null; perUnitEur: number | null };
      mouldPerPortionEur: null;
      moulds: [];
      portionKind: null;
      portionWeightKg: null;
      packagingItself: { perKgEur: number | null; perUnitEur: number | null } | null;
    };
    importId: string | null;
    freePrice?: FreePrice;
    priceVersion?: { id: string; source: string; validFrom: string };
  },
  lines: readonly { recoveredAmount?: number | null }[],
  now: Date,
) {
  const breakdown = lossCostBreakdown(
    { netKg: d.netKg, quantity: d.netQuantity, unitCode: d.netUnitCode },
    {
      food: cost.item.food,
      packagingPerPortionEur: null,
      portionWeightKg: null,
      packagingItself: cost.item.packagingItself ?? undefined,
    },
  );
  return {
    costPerKgEur: cost.item.food.perKgEur,
    costPerUnitEur: cost.item.food.perUnitEur,
    materialCostEur: breakdown.foodEur,
    packagingCostEur: breakdown.packagingEur,
    labourCostEur: breakdown.labourEur,
    indirectCostEur: breakdown.indirectEur,
    grossCostEur: breakdown.grossEur,
    costImportId: cost.importId,
    costMethod: COST_METHOD,
    costComputedAt: now,
    costDetails: {
      portions: breakdown.portions,
      packagingItself: cost.item.packagingItself,
      priceVersion: cost.priceVersion ?? null,
      freePrice: cost.freePrice ?? null,
      labour: "non imputée : méthode d'affectation à définir (cahier des charges §18.2)",
    },
    ...netCost(breakdown.grossEur, lines),
  };
}

/** Recettes encaissées et coût net d'une déclaration, à partir de ses lignes de destination (§10.4, §18.6). */
function netCost(grossCostEur: number | null | undefined, lines: readonly { recoveredAmount?: number | null }[]) {
  const amounts = lines.map((l) => l.recoveredAmount).filter((a): a is number => a != null);
  const recoveredEur = amounts.length ? Math.round(amounts.reduce((a, b) => a + b, 0) * 100) / 100 : null;
  return {
    recoveredEur,
    netCostEur: grossCostEur != null ? roundQuantity(grossCostEur - (recoveredEur ?? 0)) : null,
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

/**
 * Enregistre les photos d'une perte (règle R37). Correction (`replacing`) : les photos déjà enregistrées qui ne sont
 * pas gardées sont retirées. Les photos de plus de 3 mois, de toutes les pertes, sont effacées au passage.
 */
async function savePhotos(
  tx: Db,
  user: AuthUser,
  declarationId: string,
  photos: PreparedDeclaration["photos"],
  now: Date,
  replacing: boolean,
) {
  if (replacing) {
    const existing = await tx
      .select({ id: s.declarationPhotos.id })
      .from(s.declarationPhotos)
      .where(eq(s.declarationPhotos.declarationId, declarationId));
    if (photos.keep.some((id) => !existing.some((p) => p.id === id)))
      throw new DeclarationError("Photo introuvable : rechargez la page");
    const removed = existing.filter((p) => !photos.keep.includes(p.id)).map((p) => p.id);
    if (removed.length) await tx.delete(s.declarationPhotos).where(inArray(s.declarationPhotos.id, removed));
  } else if (photos.keep.length) {
    throw new DeclarationError("Photo introuvable : reprenez-la");
  }
  if (photos.add.length) {
    await tx.insert(s.declarationPhotos).values(
      photos.add.map((content) => ({
        declarationId,
        contentType: "image/jpeg",
        content,
        byteSize: content.length,
        createdBy: user.id,
        createdAt: now,
      })),
    );
    await purgeOldPhotos(tx, now);
  }
}

/** Efface les photos de lot / DLC de plus de 3 mois (le lot, la DLC et la quantité restent sur la perte). */
export async function purgeOldPhotos(db: Db, now: Date = new Date()): Promise<number> {
  const limit = new Date(now);
  limit.setUTCMonth(limit.getUTCMonth() - PHOTO_RETENTION_MONTHS);
  const removed = await db
    .delete(s.declarationPhotos)
    .where(lt(s.declarationPhotos.createdAt, limit))
    .returning({ id: s.declarationPhotos.id });
  return removed.length;
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
  await createEnteredArticle(tx, user, prepared, now);
  const [declaration] = await tx
    .insert(s.lossDeclarations)
    .values({ ...prepared.values, status: "validee", revision: 1, createdBy: user.id, batchId })
    .returning();
  if (!declaration) throw new Error("Enregistrement impossible");

  const snapshot = await writeVersionLines(tx, declaration, prepared);
  await savePhotos(tx, user, declaration.id, prepared.photos, now, false);
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

// ─── Saisie hors ligne (docs/PHASE6.md, étape 6.5) ─────────────────────────────

/** Avance tolérée de l'horloge d'un appareil sur celle du serveur. */
export const DEVICE_CLOCK_TOLERANCE_MS = 5 * 60 * 1000;
/** Écart au-delà duquel une perte est considérée comme reçue après sa saisie (gardée hors ligne). */
const RECEIVED_LATER_MS = 60 * 1000;

/**
 * Heure de saisie d'une perte : celle de l'appareil quand elle est fournie (perte gardée hors ligne), sinon
 * l'heure de réception. Refusée si elle est dans le futur, ou, pour une équipe, si elle date de plus que le délai
 * des équipes (horloge de l'appareil à vérifier, ou perte à faire enregistrer par un responsable).
 */
function entryTimes(
  user: AuthUser,
  rawInput: unknown,
  now: Date,
): { enteredAt: Date; receivedAt: Date | null; clientId: string | null } {
  const raw = (rawInput ?? {}) as { enteredAt?: unknown; clientId?: unknown };
  const clientId = typeof raw.clientId === "string" ? raw.clientId : null;
  if (typeof raw.enteredAt !== "string") return { enteredAt: now, receivedAt: null, clientId };
  const enteredAt = new Date(raw.enteredAt);
  if (Number.isNaN(enteredAt.getTime())) throw new DeclarationError("Heure de saisie invalide");
  if (enteredAt.getTime() > now.getTime() + DEVICE_CLOCK_TOLERANCE_MS) {
    throw new DeclarationError("L'heure de cet appareil est en avance : réglez-la, puis saisissez la perte à nouveau");
  }
  if (isBoundByTeamDelay(user) && now.getTime() - enteredAt.getTime() > TEAM_DELAY_DAYS * 86_400_000) {
    throw new DeclarationError(
      `Perte saisie il y a plus de ${TEAM_DELAY_DAYS} jours sur cet appareil : à faire enregistrer par un responsable`,
    );
  }
  const later = now.getTime() - enteredAt.getTime() > RECEIVED_LATER_MS;
  // Une saisie « en avance » de quelques minutes (horloge de l'appareil) compte à l'heure de réception.
  return { enteredAt: enteredAt > now ? now : enteredAt, receivedAt: later ? now : null, clientId };
}

/** Déclaration déjà reçue avec cet identifiant d'appareil (second envoi d'une même perte) ; null sinon. */
async function alreadyReceived(db: Db, user: AuthUser, clientId: string | null): Promise<CreatedDeclaration | null> {
  if (!clientId) return null;
  const [existing] = await db.select().from(s.lossDeclarations).where(eq(s.lossDeclarations.clientId, clientId));
  if (!existing) return null;
  if (existing.createdBy !== user.id) throw new DeclarationError("Identifiant de saisie déjà utilisé");
  return summarize(existing);
}

const isUniqueViolation = (e: unknown) =>
  (e as { code?: string; cause?: { code?: string } })?.code === "23505" ||
  (e as { cause?: { code?: string } })?.cause?.code === "23505";

export async function createDeclaration(
  db: Db,
  user: AuthUser,
  rawInput: unknown,
  now: Date = new Date(),
): Promise<CreatedDeclaration> {
  requirePermission(user, "declaration.create");
  const times = entryTimes(user, rawInput, now);
  const existing = await alreadyReceived(db, user, times.clientId);
  if (existing) return existing;
  const prepared = await prepareDeclaration(
    db,
    user,
    rawInput,
    now,
    times.enteredAt,
    [],
    times.enteredAt,
    times.receivedAt,
  );
  try {
    return await db.transaction((tx) => insertNewDeclaration(tx, user, prepared, now));
  } catch (e) {
    // Deux envois simultanés de la même perte : le second retrouve le premier.
    const again = isUniqueViolation(e) ? await alreadyReceived(db, user, times.clientId) : null;
    if (again) return again;
    throw e;
  }
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

  // Lignes déjà reçues (second envoi d'une série gardée hors ligne) : rendues telles quelles, pas réenregistrées.
  const received: CreatedDeclaration[] = [];
  const prepared: PreparedDeclaration[] = [];
  for (const [index, raw] of rawInputs.entries()) {
    try {
      const times = entryTimes(user, raw, now);
      const existing = await alreadyReceived(db, user, times.clientId);
      if (existing) received.push(existing);
      else
        prepared.push(
          await prepareDeclaration(db, user, raw, now, times.enteredAt, [], times.enteredAt, times.receivedAt),
        );
    } catch (e) {
      if (!isInputError(e)) throw e;
      throw new BatchLineError(index, e.message);
    }
  }
  if (!prepared.length) return received;

  const created = await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(s.declarationBatches)
      .values({ createdBy: user.id, defaults: { lines: prepared.length }, closedAt: now, createdAt: now })
      .returning();
    const list: CreatedDeclaration[] = [];
    for (const p of prepared) list.push(await insertNewDeclaration(tx, user, p, now, batch!.id));
    return list;
  });
  return [...received, ...created];
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
  if (existing.status === "annulee")
    throw new DeclarationError("Cette déclaration est annulée : elle ne peut plus être modifiée");

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
      .where(
        and(
          eq(s.declarationContainers.declarationId, declaration.id),
          eq(s.declarationContainers.revision, declaration.revision),
        ),
      ),
    db
      .select()
      .from(s.declarationDestinations)
      .where(
        and(
          eq(s.declarationDestinations.declarationId, declaration.id),
          eq(s.declarationDestinations.revision, declaration.revision),
        ),
      ),
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
  const before = await currentSnapshot(db, existing);
  const prepared = await prepareDeclaration(
    db,
    user,
    rawInput,
    now,
    existing.declaredAt,
    before.destinations.map((d) => d.destinationId),
    now,
    null,
    true,
  );

  return db.transaction(async (tx) => {
    await createEnteredArticle(tx, user, prepared, now);
    const revision = existing.revision + 1;
    const [declaration] = await tx
      .update(s.lossDeclarations)
      .set({ ...prepared.values, status: "corrigee", revision })
      .where(and(eq(s.lossDeclarations.id, id), eq(s.lossDeclarations.revision, existing.revision)))
      .returning();
    if (!declaration) throw new DeclarationConflictError();

    const after = await writeVersionLines(tx, declaration, prepared);
    await savePhotos(tx, user, id, prepared.photos, now, true);
    await tx.insert(s.declarationRevisions).values({
      declarationId: id,
      revision,
      status: "corrigee",
      data: after,
      changedBy: user.id,
      changedAt: now,
      reason,
    });
    await writeAudit(tx, {
      userId: user.id,
      action: "update",
      entity: "loss_declaration",
      entityId: id,
      before,
      after,
      reason,
      occurredAt: now,
    });
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
      containers: before.containers.map((c) => ({
        containerTareId: c.containerTareId,
        count: c.count,
        tareKg: c.tareKgSnapshot,
      })),
      destinations: before.destinations.map((d) => ({
        destinationId: d.destinationId,
        quantity: d.quantity,
        netKg: d.netKg,
        recoveredAmount: d.recoveredAmount,
        binNumber: d.binNumber,
      })),
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
    await writeAudit(tx, {
      userId: user.id,
      action: "cancel",
      entity: "loss_declaration",
      entityId: id,
      before,
      after,
      reason,
      occurredAt: now,
    });
  });
}

/**
 * Rattache des déclarations « hors liste » à un produit du référentiel (administration).
 * Chaque déclaration reçoit une nouvelle version : le nom libre saisi reste dans l'historique, les mesures
 * ne changent pas. Le poids en kg est recalculé avec les données du produit (poids unitaire, densité) quand
 * la quantité n'a pas été pesée. Tout ou rien : une déclaration déjà modifiée entre-temps fait tout échouer.
 */
export async function linkDeclarationsToProduct(
  db: Db,
  user: AuthUser,
  /** `fromProductId` : pertes d'un article saisi à la main, fusionné avec un article de la liste. */
  input: { declarationIds: string[]; productId: string; fromProductId?: string },
  now: Date = new Date(),
): Promise<number> {
  requirePermission(user, "referentiel.manage");
  const [product] = await db.select().from(s.products).where(eq(s.products.id, input.productId));
  if (!product || !product.active) throw new DeclarationError("Produit inconnu ou désactivé");
  const ids = [...new Set(input.declarationIds)];
  if (ids.length === 0) throw new DeclarationError("Aucune déclaration à rattacher");
  const reason = input.fromProductId
    ? `Article saisi à la main fusionné avec « ${product.name} »`
    : `Rattachement au produit du référentiel « ${product.name} »`;

  return db.transaction(async (tx) => {
    const rows = await tx.select().from(s.lossDeclarations).where(inArray(s.lossDeclarations.id, ids));
    if (
      rows.length !== ids.length ||
      rows.some(
        (d) =>
          d.status === "annulee" || (input.fromProductId ? d.productId !== input.fromProductId : !d.productUnlisted),
      )
    ) {
      throw new DeclarationConflictError();
    }
    for (const existing of rows) {
      const before = await currentSnapshot(tx, existing);
      let measurement: Pick<typeof existing, "netKg" | "kgStatus" | "conversionFactorUsed" | "measurementMethod"> = {
        netKg: existing.netKg,
        kgStatus: existing.kgStatus,
        conversionFactorUsed: existing.conversionFactorUsed,
        measurementMethod: existing.measurementMethod,
      };
      if (existing.tareTotalKg == null) {
        const [unit] = await tx.select().from(s.units).where(eq(s.units.code, existing.unitCode));
        const conversion = convertToKg(
          existing.quantity,
          { code: unit!.code, kind: unit!.kind as UnitKind, toBaseFactor: unit!.toBaseFactor },
          {
            isConsumable: isNonFoodCategory(product.category),
            unitWeightKg: product.unitWeightKg,
            densityKgPerL: product.densityKgPerL,
          },
        );
        const counted =
          existing.measurementMethod === "comptage" || existing.measurementMethod === "conversion_reference";
        measurement = {
          netKg: conversion.netKg,
          kgStatus: conversion.kgStatus,
          conversionFactorUsed: conversion.factorUsed,
          measurementMethod: counted
            ? conversion.kgStatus === "converti"
              ? "conversion_reference"
              : "comptage"
            : existing.measurementMethod,
        };
      } else if (isNonFoodCategory(product.category)) {
        throw new DeclarationError("Une pesée en gastros ne peut pas être rattachée à un consommable");
      }

      // Coût recalculé au prix du produit en vigueur à la date de la perte ; sans prix, le coût déjà connu (prix
      // indiqué pour la saisie « hors liste ») est gardé.
      const price = await materialPriceAt(tx, product.id, existing.occurredOn);
      const mould = product.category === "moule_plat_gratin";
      const priced = price
        ? costColumns(
            { ...existing, ...measurement },
            {
              item: {
                food: mould
                  ? { perKgEur: null, perUnitEur: null }
                  : { perKgEur: price.perKgEur, perUnitEur: price.perUnitEur },
                mouldPerPortionEur: null,
                moulds: [],
                portionKind: null,
                portionWeightKg: null,
                packagingItself: mould ? { perKgEur: price.perKgEur, perUnitEur: price.perUnitEur } : null,
              },
              importId: price.weeklyImportId,
              priceVersion: { id: price.id, source: price.source, validFrom: price.validFrom },
            },
            before.destinations,
            now,
          )
        : {};

      const revision = existing.revision + 1;
      const [declaration] = await tx
        .update(s.lossDeclarations)
        .set({
          ...priced,
          productId: product.id,
          productUnlisted: false,
          productCategory: product.category,
          productName: product.name,
          productExternalId: product.externalId,
          productCode: product.code,
          productVariant: product.variant,
          ...measurement,
          status: "corrigee",
          revision,
          updatedAt: now,
        })
        .where(and(eq(s.lossDeclarations.id, existing.id), eq(s.lossDeclarations.revision, existing.revision)))
        .returning();
      if (!declaration) throw new DeclarationConflictError();

      const kgPerUnit = declaration.netKg != null ? declaration.netKg / declaration.netQuantity : null;
      const after = await writeVersionLines(tx, declaration, {
        containers: before.containers.map((c) => ({
          containerTareId: c.containerTareId,
          count: c.count,
          tareKg: c.tareKgSnapshot,
        })),
        destinations: before.destinations.map((d) => ({
          destinationId: d.destinationId,
          quantity: d.quantity,
          netKg: kgPerUnit != null ? roundQuantity(d.quantity * kgPerUnit) : null,
          recoveredAmount: d.recoveredAmount,
          binNumber: d.binNumber,
        })),
      });
      await tx.insert(s.declarationRevisions).values({
        declarationId: existing.id,
        revision,
        status: "corrigee",
        data: after,
        changedBy: user.id,
        changedAt: now,
        reason,
      });
      await writeAudit(tx, {
        userId: user.id,
        action: "link_product",
        entity: "loss_declaration",
        entityId: existing.id,
        before,
        after,
        reason,
        occurredAt: now,
      });
    }
    return rows.length;
  });
}

/**
 * Prix d'achat indiqué après coup pour des saisies « hors liste » (décision du 20/11/2026) : chaque perte reçoit une
 * nouvelle version, au coût recalculé (poids ou nombre de la perte × prix). Le nom saisi ne change pas.
 */
export async function priceUnlistedDeclarations(
  db: Db,
  user: AuthUser,
  input: { declarationIds: string[]; price: unknown },
  now: Date = new Date(),
): Promise<number> {
  requirePermission(user, "referentiel.manage");
  const parsed = freePriceSchema.safeParse(input.price);
  if (!parsed.success) throw new DeclarationError(parsed.error.issues[0]?.message ?? "Prix invalide");
  const price = parsed.data;
  const ids = [...new Set(input.declarationIds)];
  if (ids.length === 0) throw new DeclarationError("Aucune déclaration à chiffrer");
  const reason = `Prix d'achat indiqué : ${price.amountEur.toLocaleString("fr-FR")} € / ${price.per === "kg" ? "kg" : "pièce"}`;

  return db.transaction(async (tx) => {
    const rows = await tx.select().from(s.lossDeclarations).where(inArray(s.lossDeclarations.id, ids));
    if (rows.length !== ids.length || rows.some((d) => !d.productUnlisted || d.status === "annulee")) {
      throw new DeclarationConflictError();
    }
    for (const existing of rows) {
      const before = await currentSnapshot(tx, existing);
      const revision = existing.revision + 1;
      const [declaration] = await tx
        .update(s.lossDeclarations)
        .set({
          ...costColumns(existing, freeCost(existing.productCategory, price), before.destinations, now),
          status: "corrigee",
          revision,
          updatedAt: now,
        })
        .where(and(eq(s.lossDeclarations.id, existing.id), eq(s.lossDeclarations.revision, existing.revision)))
        .returning();
      if (!declaration) throw new DeclarationConflictError();
      const after = await writeVersionLines(tx, declaration, {
        containers: before.containers.map((c) => ({
          containerTareId: c.containerTareId,
          count: c.count,
          tareKg: c.tareKgSnapshot,
        })),
        destinations: before.destinations.map((d) => ({
          destinationId: d.destinationId,
          quantity: d.quantity,
          netKg: d.netKg,
          recoveredAmount: d.recoveredAmount,
          binNumber: d.binNumber,
        })),
      });
      await tx.insert(s.declarationRevisions).values({
        declarationId: existing.id,
        revision,
        status: "corrigee",
        data: after,
        changedBy: user.id,
        changedAt: now,
        reason,
      });
      await writeAudit(tx, {
        userId: user.id,
        action: "price_unlisted",
        entity: "loss_declaration",
        entityId: existing.id,
        before,
        after,
        reason,
        occurredAt: now,
      });
    }
    return rows.length;
  });
}

/**
 * Saisit ou complète les montants encaissés des lignes de vente d'une déclaration (docs/PHASE3.md, étape 3.5) :
 * nouvelle version, recettes et coût net recalculés, coût brut inchangé. Mêmes droits qu'une correction.
 */
export async function setRecoveredAmounts(
  db: Db,
  user: AuthUser,
  id: string,
  input: { expectedRevision: number; amounts: Record<string, number | null> },
  now: Date = new Date(),
): Promise<void> {
  const { existing } = await loadForChange(
    db,
    user,
    id,
    { reason: "Recette encaissée", expectedRevision: input.expectedRevision },
    now,
  );
  const before = await currentSnapshot(db, existing);
  const destinationRows = await db
    .select()
    .from(s.destinations)
    .where(
      inArray(
        s.destinations.id,
        before.destinations.map((d) => d.destinationId),
      ),
    );
  for (const [destinationId, amount] of Object.entries(input.amounts)) {
    const row = destinationRows.find((r) => r.id === destinationId);
    if (!row || !before.destinations.some((d) => d.destinationId === destinationId))
      throw new DeclarationError("Ligne de destination introuvable");
    if (!row.financialRecovery) throw new DeclarationError(`« ${row.name} » ne rapporte pas de recette`);
    if (amount != null && (!Number.isFinite(amount) || amount < 0 || amount > 100_000))
      throw new DeclarationError("Montant invalide");
  }
  const lines = before.destinations.map((d) => ({
    destinationId: d.destinationId,
    quantity: d.quantity,
    netKg: d.netKg,
    recoveredAmount: d.destinationId in input.amounts ? (input.amounts[d.destinationId] ?? null) : d.recoveredAmount,
    binNumber: d.binNumber,
  }));

  await db.transaction(async (tx) => {
    const revision = existing.revision + 1;
    const [declaration] = await tx
      .update(s.lossDeclarations)
      .set({ ...netCost(existing.grossCostEur, lines), status: "corrigee", revision, updatedAt: now })
      .where(and(eq(s.lossDeclarations.id, id), eq(s.lossDeclarations.revision, existing.revision)))
      .returning();
    if (!declaration) throw new DeclarationConflictError();
    const after = await writeVersionLines(tx, declaration, {
      containers: before.containers.map((c) => ({
        containerTareId: c.containerTareId,
        count: c.count,
        tareKg: c.tareKgSnapshot,
      })),
      destinations: lines,
    });
    const reason = "Recette encaissée";
    await tx.insert(s.declarationRevisions).values({
      declarationId: id,
      revision,
      status: "corrigee",
      data: after,
      changedBy: user.id,
      changedAt: now,
      reason,
    });
    await writeAudit(tx, {
      userId: user.id,
      action: "recovered_amount",
      entity: "loss_declaration",
      entityId: id,
      before,
      after,
      reason,
      occurredAt: now,
    });
  });
}
