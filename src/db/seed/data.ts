/**
 * Données initiales des référentiels.
 * Sources : cahier des charges v1.0 (§4, §5, §9, §10) et réponses validées du 06/11/2026.
 * Toute modification ultérieure se fait par l'administration, pas ici.
 */

export const UNITS = [
  { code: "kg", label: "kg", kind: "masse", toBaseFactor: 1 },
  { code: "g", label: "g", kind: "masse", toBaseFactor: 0.001 },
  { code: "l", label: "L", kind: "volume", toBaseFactor: 1 },
  { code: "ml", label: "mL", kind: "volume", toBaseFactor: 0.001 },
  { code: "piece", label: "pièce(s)", kind: "comptage", toBaseFactor: 1 },
  { code: "barquette", label: "barquette(s)", kind: "comptage", toBaseFactor: 1 },
  { code: "contenant", label: "contenant(s)", kind: "comptage", toBaseFactor: 1 },
  { code: "gastro", label: "gastro(s)", kind: "comptage", toBaseFactor: 1 },
] as const;

export const TEAMS = [
  { letter: "A", colorName: "Bleue", colorHex: "#2563eb", usualStart: "05:00", usualEnd: "12:00" },
  { letter: "B", colorName: "Rouge", colorHex: "#dc2626", usualStart: "06:15", usualEnd: "13:15" },
  { letter: "C", colorName: "Rose", colorHex: "#ec4899", usualStart: "07:30", usualEnd: "14:30" },
  { letter: "D", colorName: "Jaune", colorHex: "#eab308", usualStart: "08:45", usualEnd: "15:45" },
  { letter: "E", colorName: "Orange", colorHex: "#f97316", usualStart: "10:00", usualEnd: "17:00" },
  { letter: "F", colorName: "Violette", colorHex: "#7c3aed", usualStart: "11:15", usualEnd: "18:15" },
  { letter: "G", colorName: "Verte", colorHex: "#16a34a", usualStart: "12:30", usualEnd: "19:30" },
  { letter: "H", colorName: "Turquoise", colorHex: "#14b8a6", usualStart: "13:45", usualEnd: "20:45" },
] as const;

/**
 * team_mode validé le 06/11/2026 : un responsable par zone pour Réception, Stockage,
 * Conditionnement et Plonge ; une équipe par perte en Cuisine / Production (8 équipes).
 */
export const ZONES = [
  {
    code: "RECEPTION",
    name: "Réception",
    teamMode: "zone",
    subzones: [
      { code: "REC_RECEPTION", name: "Réception des marchandises" },
      { code: "REC_CONTROLE", name: "Contrôle des marchandises" },
    ],
  },
  {
    code: "STOCKAGE",
    name: "Stockage",
    teamMode: "zone",
    subzones: [
      { code: "STO_SEC_ENCAS", name: "Stockage sec hors épicerie – encas secs" },
      { code: "STO_SEC_PROD", name: "Stockage sec hors épicerie – produits secs de production" },
      {
        code: "STO_EPICERIE",
        name: "Épicerie",
        description: "Produits secs utilisés pour la production de la semaine ; rotation le mercredi",
      },
      { code: "STO_BOF", name: "Chambre BOF" },
      { code: "STO_LEGUMERIE", name: "Légumerie" },
      { code: "STO_NEGATIVE", name: "Chambre négative" },
      { code: "STO_ENCAS_FRAIS", name: "Local encas frais" },
    ],
  },
  {
    code: "CUISINE",
    name: "Cuisine / Production",
    teamMode: "equipe",
    subzones: [
      { code: "CUI_DEBOITAGE", name: "Déboîtage" },
      { code: "CUI_PREP_FROIDE", name: "Préparation froide" },
      { code: "CUI_CUISINE", name: "Cuisine" },
      { code: "CUI_SALLE_BLANCHE", name: "Salle blanche" },
    ],
  },
  {
    code: "CONDITIONNEMENT",
    name: "Conditionnement",
    teamMode: "zone",
    subzones: [
      { code: "CON_BARQUETTES", name: "Conditionnement des barquettes" },
      { code: "CON_AUTRES", name: "Conditionnement des autres produits" },
    ],
  },
  {
    code: "PLONGE",
    name: "Plonge",
    teamMode: "zone",
    subzones: [{ code: "PLO_LAVAGE", name: "Lavage des contenants et ustensiles" }],
  },
] as const;

type ZoneCode = (typeof ZONES)[number]["code"];

interface CauseSeed {
  code: string;
  name: string;
  description?: string;
  zones: readonly ZoneCode[];
  /** Restreint la cause à ces sous-zones ; absent = toutes les sous-zones des zones. */
  subzones?: readonly string[];
}

/** « Autres pertes » : toujours disponible, dans toutes les zones (§9.2). */
export const OTHER_CAUSE = {
  code: "AUTRES",
  name: "Autres pertes",
  description: "À préciser en commentaire",
} as const;

export const CAUSES: readonly CauseSeed[] = [
  // Réception
  { code: "REC_ARRIVE_CASSE", name: "Produit arrivé cassé / ouvert", zones: ["RECEPTION"] },
  { code: "REC_CASSE_MANIP", name: "Cassé / ouvert pendant la manipulation", zones: ["RECEPTION"] },
  { code: "REC_DESSOUVIDE", name: "Produit arrivé dessouvidé", description: "Perte du sous-vide à la livraison", zones: ["RECEPTION"] },

  // Stockage
  { code: "STO_FIN_PROD", name: "Fin de production non utilisable", zones: ["STOCKAGE"] },
  { code: "STO_DLC_COURTE", name: "DLC trop courte", zones: ["STOCKAGE"] },
  { code: "STO_ABIME", name: "Produit abîmé / pourri", zones: ["STOCKAGE"] },
  { code: "STO_OUVERT", name: "Produit ouvert", zones: ["STOCKAGE"] },
  {
    code: "STO_MAL_RETOURNE",
    name: "Mal retourné",
    description: "Retour dans la mauvaise chambre, mal filmé ou mal daté",
    zones: ["STOCKAGE"],
  },
  // Ajoutées le 06/11/2026 depuis le §12 du cahier des charges
  { code: "STO_PEREMPTION", name: "Péremption (date dépassée)", zones: ["STOCKAGE"] },
  { code: "STO_CHAINE_FROID", name: "Rupture de la chaîne du froid", zones: ["STOCKAGE"] },
  { code: "STO_ROTATION", name: "Mauvaise rotation", zones: ["STOCKAGE"] },
  { code: "STO_MAUVAIS_STOCKAGE", name: "Mauvais stockage", zones: ["STOCKAGE"] },
  { code: "STO_EXCEDENT", name: "Stock excédentaire", zones: ["STOCKAGE"] },

  // Stockage et Cuisine
  {
    code: "ERREUR_PREPARATION",
    name: "Erreur de préparation",
    description: "Trop / pas assez cuit, mauvais ingrédients…",
    zones: ["STOCKAGE", "CUISINE"],
  },

  // Cuisine / Production
  { code: "CUI_FOUR_SALE", name: "Four mal nettoyé (miettes sales)", zones: ["CUISINE"] },
  { code: "CUI_CHUTE_GASTRO", name: "Chute de gastro", description: "Gastro tombé", zones: ["CUISINE"] },
  {
    code: "CUI_CHUTES_DECOUPE",
    name: "Chutes de découpe",
    description: "Parures et chutes non réutilisables",
    zones: ["CUISINE"],
    subzones: ["CUI_DEBOITAGE"],
  },
  {
    code: "CUI_SURPLUS_NON_REUTILISABLE",
    name: "Surplus non réutilisable (week-end / fin de semaine de production)",
    zones: ["CUISINE"],
  },

  // Cuisine et Conditionnement
  {
    code: "NON_CONFORMITE_QUALITE",
    name: "Non-conformité qualité",
    description: "Ex. : panna cotta qui ne fige pas",
    zones: ["CUISINE", "CONDITIONNEMENT"],
  },

  // Conditionnement (réponses du 06/11/2026 + §9.4 du cahier des charges)
  { code: "CON_SURPRODUCTION", name: "Surplus de production", zones: ["CONDITIONNEMENT"] },
  { code: "CON_CHUTE", name: "Chute de produit", description: "Barquette ou produit tombé", zones: ["CONDITIONNEMENT"] },
  { code: "CON_DOSEUSE", name: "Pertes liées à la doseuse", zones: ["CONDITIONNEMENT"] },
  { code: "CON_SCELLAGE", name: "Défaut de scellage", zones: ["CONDITIONNEMENT"] },
  { code: "CON_TEST_OXYGENE", name: "Barquettes de test d'oxygène", zones: ["CONDITIONNEMENT"] },
  { code: "CON_ETIQUETAGE", name: "Erreur d'étiquetage", zones: ["CONDITIONNEMENT"] },
  { code: "CON_POIDS", name: "Poids non conforme", zones: ["CONDITIONNEMENT"] },
  { code: "CON_ASPECT", name: "Défaut d'aspect", zones: ["CONDITIONNEMENT"] },
  { code: "CON_BARQUETTE_ABIMEE", name: "Barquette abîmée", zones: ["CONDITIONNEMENT"] },
  { code: "CON_ERREUR_PRODUCTION", name: "Erreur de production", zones: ["CONDITIONNEMENT"] },
  {
    code: "CON_PERSONNEL_NON_CONSOMME",
    name: "Barquette conforme remise au personnel, non consommée puis jetée",
    zones: ["CONDITIONNEMENT"],
  },

  // Conditionnement et Plonge
  {
    code: "FOND_GASTRO",
    name: "Fond de gastro",
    description: "À la plonge, il ne doit normalement plus rester grand-chose à jeter",
    zones: ["CONDITIONNEMENT", "PLONGE"],
  },
];

export const DESTINATIONS = [
  { code: "ALCHIMISTES", name: "Les Alchimistes – compost", kind: "compost", financialRecovery: false, binNumberMode: "facultatif" },
  { code: "ORDURES", name: "Ordures ménagères", kind: "destruction", financialRecovery: false },
  { code: "PERSONNEL", name: "Personnel", kind: "personnel", financialRecovery: false },
  { code: "DON", name: "Association / don", kind: "don", financialRecovery: false },
  { code: "TGTG", name: "Too Good To Go", kind: "vente", financialRecovery: true },
  { code: "VENTE_FLASH", name: "Vente flash", kind: "vente", financialRecovery: true },
  { code: "REUTILISATION", name: "Réutilisation dans une autre préparation", kind: "reutilisation", financialRecovery: false },
  { code: "RETOUR_FOURNISSEUR", name: "Retour fournisseur", kind: "retour_fournisseur", financialRecovery: false },
  { code: "AUTRE", name: "Autre destination", kind: "autre", financialRecovery: false },
] as const;

/** Fichier « Multiplication des gastros » transmis le 06/11/2026. */
export const TARE_SOURCE = "Fichier « Multiplication des gastros » (06/11/2026)";
export const TARE_VALID_FROM = "2026-11-06";

export const CONTAINERS = [
  { code: "GASTRO_1", name: "Gastro 1 – fin", kind: "gastro", maxCount: 40, unitTareKg: 1.1 },
  { code: "GASTRO_1TR", name: "Gastro 1TR – fin à trous", kind: "gastro", maxCount: 40, unitTareKg: 1.15 },
  { code: "GASTRO_2", name: "Gastro 2 – moyen", kind: "gastro", maxCount: 30, unitTareKg: 1.25 },
  { code: "GASTRO_2TR", name: "Gastro 2TR – moyen à trous", kind: "gastro", maxCount: 30, unitTareKg: 1.3 },
  { code: "GASTRO_3", name: "Gastro 3 – moyen profond", kind: "gastro", maxCount: 30, unitTareKg: 1.75 },
  { code: "GASTRO_4", name: "Gastro 4 – profond", kind: "gastro", maxCount: 30, unitTareKg: 2.25 },
  { code: "ECHELLE_CLASSIQUE", name: "Échelle classique", kind: "support", maxCount: 1, unitTareKg: 21 },
  { code: "ECHELLE_FOUR", name: "Échelle à four", kind: "support", maxCount: 1, unitTareKg: 52 },
] as const;

export const ROLES = [
  { code: "equipe", label: "Compte équipe" },
  { code: "resp_zone", label: "Responsable de zone" },
  { code: "resp_production", label: "Responsable de production" },
  { code: "admin", label: "Administrateur" },
  { code: "direction", label: "Direction" },
] as const;

export const PERMISSIONS = [
  { code: "declaration.create", label: "Déclarer une perte" },
  { code: "declaration.read.team", label: "Lire les déclarations de son équipe" },
  { code: "declaration.read.zone", label: "Lire les déclarations de ses zones" },
  { code: "declaration.read.all", label: "Lire toutes les déclarations" },
  { code: "declaration.correct.team", label: "Corriger les déclarations de son équipe" },
  { code: "declaration.correct.zone", label: "Corriger les déclarations de ses zones" },
  { code: "declaration.correct.all", label: "Corriger toutes les déclarations" },
  { code: "cause.propose", label: "Proposer une nouvelle cause" },
  { code: "cause.review", label: "Valider les causes proposées" },
  { code: "stats.global", label: "Statistiques globales simplifiées" },
  { code: "stats.compare_teams", label: "Comparer les équipes" },
  { code: "referentiel.manage", label: "Gérer les référentiels" },
  { code: "user.manage", label: "Gérer les comptes" },
  { code: "audit.read", label: "Consulter le journal d'audit" },
  { code: "indicators.read", label: "Indicateurs économiques et environnementaux" },
  { code: "alerts.read.all", label: "Voir les alertes « rien de noté » de toutes les équipes" },
  { code: "alerts.resolve", label: "Lever une alerte « rien de noté » avec motif" },
] as const;

type PermissionCode = (typeof PERMISSIONS)[number]["code"];
type RoleCode = (typeof ROLES)[number]["code"];

/** Matrice d'autorisation (docs/SECURITE.md §1). */
export const ROLE_PERMISSIONS: Record<RoleCode, readonly PermissionCode[]> = {
  equipe: ["declaration.create", "declaration.read.team", "declaration.correct.team", "cause.propose", "stats.global"],
  resp_zone: ["declaration.create", "declaration.read.zone", "declaration.correct.zone", "cause.propose", "stats.global"],
  resp_production: [
    "declaration.create",
    "declaration.read.all",
    "declaration.correct.all",
    "cause.propose",
    "stats.global",
    "stats.compare_teams",
    "audit.read",
    "indicators.read",
    "alerts.read.all",
    "alerts.resolve",
  ],
  admin: PERMISSIONS.map((p) => p.code),
  direction: ["stats.global", "stats.compare_teams", "indicators.read"],
};

/** Années de production pré-générées dans le calendrier. */
export const CALENDAR_YEARS = [2025, 2026, 2027, 2028] as const;
