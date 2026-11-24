/**
 * Familles de causes racines et pertes évitables (décision du 23/11/2026, d'après le référentiel des pertes
 * agroalimentaires : causes C01–C37 regroupées en familles). Réglées par l'administration sur chaque cause
 * (Administration → Causes) ; jamais demandées aux équipes à la saisie.
 */
export const CAUSE_FAMILIES = [
  "organisation",
  "equipement_process",
  "fournisseur_matiere",
  "conservation",
  "hygiene",
  "surproduction",
  "inherente",
  "autre",
] as const;
export type CauseFamily = (typeof CAUSE_FAMILIES)[number];

export const CAUSE_FAMILY_LABELS: Record<CauseFamily, string> = {
  organisation: "Organisation / erreur humaine",
  equipement_process: "Équipement / process",
  fournisseur_matiere: "Fournisseur / matière première",
  conservation: "Conservation / stockage",
  hygiene: "Hygiène / contamination",
  surproduction: "Surproduction / planification",
  inherente: "Inhérente au procédé / contrôle qualité",
  autre: "Autre / à préciser",
};

/** Ce que regroupe chaque famille (causes du référentiel), affiché à l'administration. */
export const CAUSE_FAMILY_HINTS: Record<CauseFamily, string> = {
  organisation: "Erreur humaine, manipulation, pesée, dosage, recette, étiquetage, communication, formation",
  equipement_process: "Réglage, panne, arrêt ou redémarrage, changement de série, fuite, paramètre de cuisson",
  fournisseur_matiere: "Défaut fournisseur, transport amont, qualité de la matière reçue",
  conservation: "Chaîne du froid, conditions de stockage, DLC/DDM, rotation FIFO/FEFO, surstock",
  hygiene: "Contamination microbiologique, chimique ou allergène, corps étranger, nuisibles",
  surproduction: "Surproduction, prévision ou planification, refus client",
  inherente: "Partie non consommable (épluchures, os, parures), contrôle qualité, nettoyage",
  autre: "Cause inconnue ou à investiguer",
};

export const AVOIDABILITIES = ["evitable", "inevitable", "a_evaluer"] as const;
export type Avoidability = (typeof AVOIDABILITIES)[number];
export const AVOIDABILITY_LABELS: Record<Avoidability, string> = {
  evitable: "Évitable",
  inevitable: "Inévitable",
  a_evaluer: "À évaluer",
};

/** Clé de regroupement d'une cause pas encore classée. */
export const UNCLASSIFIED = "a_classer";
export const UNCLASSIFIED_LABEL = "Cause pas encore classée";

/**
 * Classement proposé le 23/11/2026 pour les causes connues (par code), à confirmer par l'administration ; repris
 * à l'identique par la migration 0034 pour les bases existantes.
 */
export const PROPOSED_CAUSE_CLASSIFICATION: Record<string, [CauseFamily, Avoidability]> = {
  CUI_CHUTE_GASTRO: ["organisation", "evitable"],
  REC_CASSE_MANIP: ["organisation", "evitable"],
  CON_CHUTE: ["organisation", "evitable"],
  CON_BARQUETTE_ABIMEE: ["organisation", "evitable"],
  CON_ERREUR_PRODUCTION: ["organisation", "evitable"],
  CON_ETIQUETAGE: ["organisation", "evitable"],
  ERREUR_PREPARATION: ["organisation", "evitable"],
  STO_MAL_RETOURNE: ["organisation", "evitable"],
  CON_DOSEUSE: ["equipement_process", "evitable"],
  CON_SCELLAGE: ["equipement_process", "evitable"],
  CON_POIDS: ["equipement_process", "evitable"],
  CON_ASPECT: ["equipement_process", "evitable"],
  NON_CONFORMITE_QUALITE: ["equipement_process", "evitable"],
  REC_ARRIVE_CASSE: ["fournisseur_matiere", "evitable"],
  REC_DESSOUVIDE: ["fournisseur_matiere", "evitable"],
  STO_DLC_COURTE: ["conservation", "evitable"],
  STO_ABIME: ["conservation", "evitable"],
  STO_CHAINE_FROID: ["equipement_process", "evitable"],
  STO_EXCEDENT: ["conservation", "evitable"],
  STO_MAUVAIS_STOCKAGE: ["conservation", "evitable"],
  STO_OUVERT: ["conservation", "evitable"],
  STO_PEREMPTION: ["conservation", "evitable"],
  STO_ROTATION: ["conservation", "evitable"],
  CUI_SURPLUS_NON_REUTILISABLE: ["surproduction", "evitable"],
  CON_SURPRODUCTION: ["surproduction", "evitable"],
  CON_PERSONNEL_NON_CONSOMME: ["surproduction", "evitable"],
  STO_FIN_PROD: ["surproduction", "evitable"],
  CON_TEST_OXYGENE: ["inherente", "inevitable"],
  FOND_GASTRO: ["inherente", "inevitable"],
  AUTRES: ["autre", "a_evaluer"],
  // Étape 2 (décision du 23/11/2026, migration 0035)
  STO_NUISIBLES: ["hygiene", "evitable"],
  STO_MANUTENTION: ["organisation", "evitable"],
  CUI_SURCUISSON: ["equipement_process", "evitable"],
  PANNE_EQUIPEMENT: ["equipement_process", "evitable"],
  REC_CORPS_ETRANGER: ["hygiene", "evitable"],
  CON_REGLAGE_LIGNE: ["equipement_process", "a_evaluer"],
  // Retours du futur utilisateur (décision du 23/11/2026, migration 0037)
  REC_ETIQUETAGE: ["fournisseur_matiere", "evitable"],
  STO_RETOUR_INUTILISABLE: ["conservation", "evitable"],
  // Cuisine / Production (décision du 24/11/2026, migration 0039)
  CUI_NC_POIDS: ["organisation", "evitable"],
  CUI_NC_INGREDIENT: ["fournisseur_matiere", "evitable"],
  CUI_OUBLI_ECHELLE: ["organisation", "evitable"],
  CUI_PROTECTION_GASTRO: ["hygiene", "evitable"],
  CUI_CONTAMINATION: ["hygiene", "evitable"],
  CUI_PANNE_MACHINE: ["equipement_process", "evitable"],
  CUI_PREVISIONNEL: ["surproduction", "evitable"],
};
