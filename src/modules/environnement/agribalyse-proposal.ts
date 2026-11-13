/**
 * Proposition de familles alimentaires et de facteurs d'émission (docs/PHASE5.md, étape 5.4), à valider avant
 * tout calcul.
 *
 * Valeurs reprises telles quelles du jeu de données officiel « AGRIBALYSE – Détail par étape » (ADEME, version
 * 3.2, data.ademe.fr, jeu `agribalyse-31-detail-par-etape`, téléchargé le 13/11/2026) : indicateur
 * « Changement climatique », en kg CO2e par kg de produit, pour chaque étape du cycle de vie. Pour chaque
 * famille, un produit cru représentatif est retenu (code AGB). Fichier généré, ne pas modifier à la main.
 */
import type { FactorStages } from "@/db/schema";

export const AGRIBALYSE_SOURCE = "AGRIBALYSE (ADEME), détail par étape";
export const AGRIBALYSE_VERSION = "3.2";
/** Dernière mise à jour du jeu de données sur data.ademe.fr. */
export const AGRIBALYSE_DATE = "2026-06-30";

export interface ProposedFamily {
  code: string;
  name: string;
  category: string;
  /** Produit Agribalyse retenu. */
  agb: string;
  product: string;
  /** Indice de qualité des données (DQR) d'Agribalyse : de 1 (très bonne) à 5. */
  dqr: number | null;
  stages: FactorStages;
}

export const AGRIBALYSE_PROPOSAL: readonly ProposedFamily[] = [
  { code: "BOEUF", name: "Bœuf", category: "Viandes", agb: "6111", product: "Boeuf, faux-filet, cru", dqr: 2.85, stages: { agriculture: 28.3, transformation: 0.116, emballage: 0.2, transport: 0.293, distribution: 0.0406, consommation: 0.00683 } },
  { code: "VEAU", name: "Veau", category: "Viandes", agb: "6521", product: "Veau, escalope, crue", dqr: 2.87, stages: { agriculture: 22.5, transformation: 0.109, emballage: 0.2, transport: 0.286, distribution: 0.0406, consommation: 0.00683 } },
  { code: "AGNEAU", name: "Agneau", category: "Viandes", agb: "21502", product: "Agneau, gigot, cru", dqr: 2.97, stages: { agriculture: 40.6, transformation: 0.067, emballage: 0.251, transport: 0.368, distribution: 0.0507, consommation: 0.0892 } },
  { code: "PORC", name: "Porc", category: "Viandes", agb: "28201", product: "Porc, filet, maigre, cru", dqr: 2.85, stages: { agriculture: 6.06, transformation: 5.8e-05, emballage: 0.2, transport: 0.26, distribution: 0.0406, consommation: 0.00683 } },
  { code: "POULET", name: "Poulet", category: "Viandes", agb: "36017", product: "Poulet, filet, sans peau, cru", dqr: 2.09, stages: { agriculture: 3.75, transformation: 1.09, emballage: 0.378, transport: 0.317, distribution: 0.0406, consommation: 0.00683 } },
  { code: "DINDE", name: "Dinde", category: "Viandes", agb: "36304", product: "Dinde, escalope, crue", dqr: 2.13, stages: { agriculture: 3.75, transformation: 1.09, emballage: 0.378, transport: 0.317, distribution: 0.0406, consommation: 0.00683 } },
  { code: "CANARD", name: "Canard", category: "Viandes", agb: "36201", product: "Canard, viande, crue", dqr: 2.98, stages: { agriculture: 6.05, transformation: 1.04, emballage: 0.472, transport: 0.359, distribution: 0.0507, consommation: 0.0892 } },
  { code: "JAMBON_CUIT", name: "Jambon cuit", category: "Viandes", agb: "28910", product: "Jambon cuit, choix", dqr: 2.97, stages: { agriculture: 6.44, transformation: 0.16, emballage: 0.701, transport: 0.291, distribution: 0.0406, consommation: 0.00683 } },
  { code: "LARDONS", name: "Lardons", category: "Viandes", agb: "28501", product: "Lardon nature, cru", dqr: 2.84, stages: { agriculture: 6.06, transformation: 5.8e-05, emballage: 0.718, transport: 0.286, distribution: 0.0406, consommation: 0.00683 } },
  { code: "SAUMON", name: "Saumon", category: "Poissons et fruits de mer", agb: "26036", product: "Saumon, cru, élevage", dqr: 2.52, stages: { agriculture: 4.16, transformation: 0.0275, emballage: 0.469, transport: 0.853, distribution: 0.0406, consommation: 0.00683 } },
  { code: "POISSON_BLANC", name: "Poisson blanc (cabillaud, colin)", category: "Poissons et fruits de mer", agb: "26043", product: "Cabillaud, cru", dqr: 3.07, stages: { agriculture: 10.3, transformation: 5.8e-05, emballage: 0.469, transport: 1.27, distribution: 0.0406, consommation: 0.00683 } },
  { code: "THON", name: "Thon", category: "Poissons et fruits de mer", agb: "26053", product: "Thon, cru", dqr: 2.9, stages: { agriculture: 3.61, transformation: 0, emballage: 0.469, transport: 0.857, distribution: 0.0406, consommation: 0.00683 } },
  { code: "CREVETTE", name: "Crevettes", category: "Poissons et fruits de mer", agb: "10021", product: "Crevette, crue", dqr: 3.83, stages: { agriculture: 17.9, transformation: 0.000128, emballage: 0.685, transport: 1.26, distribution: 0.0901, consommation: 0.41 } },
  { code: "OEUF", name: "Œufs", category: "Œufs et produits laitiers", agb: "22000", product: "Oeuf, cru", dqr: 2.44, stages: { agriculture: 1.49, transformation: 8e-05, emballage: 0.109, transport: 0.189, distribution: 0.00933, consommation: 0.0806 } },
  { code: "LAIT", name: "Lait", category: "Œufs et produits laitiers", agb: "19041", product: "Lait demi-écrémé, UHT", dqr: 1.24, stages: { agriculture: 0.934, transformation: 0.0124, emballage: 0.0959, transport: 0.216, distribution: 0.0162, consommation: 0 } },
  { code: "CREME", name: "Crème", category: "Œufs et produits laitiers", agb: "19415", product: "Crème de lait, 30% MG, semi-épaisse, UHT", dqr: 1.24, stages: { agriculture: 3.11, transformation: 0.183, emballage: 0.25, transport: 0.186, distribution: 0.0162, consommation: 0 } },
  { code: "BEURRE", name: "Beurre", category: "Œufs et produits laitiers", agb: "16400", product: "Beurre à 82% MG, doux", dqr: 1.09, stages: { agriculture: 7.32, transformation: 0.0496, emballage: 0.124, transport: 0.407, distribution: 0.0403, consommation: 0.00683 } },
  { code: "FROMAGE_PATE_DURE", name: "Fromage à pâte dure (emmental, comté, parmesan)", category: "Œufs et produits laitiers", agb: "12115", product: "Emmental ou emmenthal", dqr: 1.77, stages: { agriculture: 5.24, transformation: 0.354, emballage: 0.338, transport: 0.24, distribution: 0.0368, consommation: 0.00683 } },
  { code: "MOZZARELLA", name: "Mozzarella", category: "Œufs et produits laitiers", agb: "19590", product: "Mozzarella au lait de vache", dqr: 1.78, stages: { agriculture: 3.82, transformation: 0.249, emballage: 0.35, transport: 0.252, distribution: 0.0368, consommation: 0.00683 } },
  { code: "YAOURT", name: "Yaourt et fromage blanc", category: "Œufs et produits laitiers", agb: "19593", product: "Yaourt, lait fermenté ou spécialité laitière, nature", dqr: 1.22, stages: { agriculture: 1.03, transformation: 0.152, emballage: 0.422, transport: 0.247, distribution: 0.0369, consommation: 0.00683 } },
  { code: "RIZ", name: "Riz", category: "Féculents et légumineuses", agb: "9100", product: "Riz blanc, cru", dqr: 3.85, stages: { agriculture: 1.61, transformation: 0.000181, emballage: 0.0381, transport: 0.346, distribution: 0.0203, consommation: 0 } },
  { code: "PATES", name: "Pâtes sèches", category: "Féculents et légumineuses", agb: "9810", product: "Pâtes sèches standard, crues", dqr: 3.08, stages: { agriculture: 0.752, transformation: 0.989, emballage: 0.0556, transport: 0.156, distribution: 0.0269, consommation: 0 } },
  { code: "SEMOULE", name: "Semoule", category: "Féculents et légumineuses", agb: "9610", product: "Semoule de blé dur, crue", dqr: 2.7, stages: { agriculture: 0.684, transformation: 0.604, emballage: 0.308, transport: 0.14, distribution: 0.0176, consommation: 0 } },
  { code: "FARINE", name: "Farine de blé", category: "Féculents et légumineuses", agb: "9435", product: "Farine de blé tendre ou froment T65", dqr: 2.87, stages: { agriculture: 0.556, transformation: 0.0379, emballage: 0.0188, transport: 0.15, distribution: 0.0287, consommation: 0 } },
  { code: "PAIN", name: "Pain", category: "Féculents et légumineuses", agb: "7001", product: "Pain, baguette, courante", dqr: 2.34, stages: { agriculture: 0.387, transformation: 0.181, emballage: 0.0486, transport: 0.148, distribution: 0.0121, consommation: 0 } },
  { code: "POMME_DE_TERRE", name: "Pomme de terre", category: "Féculents et légumineuses", agb: "4008", product: "Pomme de terre, sans peau, crue", dqr: 2.26, stages: { agriculture: 0.113, transformation: 6.7e-05, emballage: 0.454, transport: 0.193, distribution: 0.0189, consommation: 0.00997 } },
  { code: "LENTILLES", name: "Lentilles", category: "Féculents et légumineuses", agb: "20504", product: "Lentille, sèche", dqr: 2.55, stages: { agriculture: 0.141, transformation: 0.000643, emballage: 0.129, transport: 0.244, distribution: 0.0669, consommation: 0 } },
  { code: "POIS_CHICHES", name: "Pois chiches", category: "Féculents et légumineuses", agb: "20516", product: "Pois chiche, sec", dqr: 3.68, stages: { agriculture: 0.4, transformation: 0.000643, emballage: 0.129, transport: 0.302, distribution: 0.0669, consommation: 0 } },
  { code: "TOMATE", name: "Tomate", category: "Légumes", agb: "20047_1", product: "Tomate, crue", dqr: 2.77, stages: { agriculture: 0.325, transformation: 0, emballage: 0, transport: 0.319, distribution: 0.025, consommation: 0.0806 } },
  { code: "CAROTTE", name: "Carotte", category: "Légumes", agb: "20009", product: "Carotte, crue", dqr: 2.24, stages: { agriculture: 0.0828, transformation: 6.7e-05, emballage: 0, transport: 0.262, distribution: 0.0189, consommation: 0.0323 } },
  { code: "OIGNON", name: "Oignon", category: "Légumes", agb: "20034", product: "Oignon, cru", dqr: 2.39, stages: { agriculture: 0.101, transformation: 6.8e-05, emballage: 0, transport: 0.268, distribution: 0.0191, consommation: 0.0323 } },
  { code: "AIL", name: "Ail", category: "Légumes", agb: "11000", product: "Ail, cru", dqr: 2.88, stages: { agriculture: 0.0841, transformation: 0.000193, emballage: 0, transport: 0.198, distribution: 0.0206, consommation: 0.0806 } },
  { code: "COURGETTE", name: "Courgette", category: "Légumes", agb: "20020", product: "Courgette, pulpe et peau, crue", dqr: 2.95, stages: { agriculture: 0.181, transformation: 0.000107, emballage: 0, transport: 0.262, distribution: 0.0231, consommation: 0.0323 } },
  { code: "AUBERGINE", name: "Aubergine", category: "Légumes", agb: "20053", product: "Aubergine, crue", dqr: 2.72, stages: { agriculture: 0.181, transformation: 0.000107, emballage: 0, transport: 0.262, distribution: 0.0231, consommation: 0.00583 } },
  { code: "POIVRON", name: "Poivron", category: "Légumes", agb: "20041", product: "Poivron, vert, jaune ou rouge, cru", dqr: 3.11, stages: { agriculture: 0.247, transformation: 0, emballage: 0, transport: 0.357, distribution: 0.0308, consommation: 0.0806 } },
  { code: "POIREAU", name: "Poireau", category: "Légumes", agb: "20039", product: "Poireau, cru", dqr: 2.52, stages: { agriculture: 0.211, transformation: 7.8e-05, emballage: 0, transport: 0.298, distribution: 0.0217, consommation: 0.0806 } },
  { code: "COURGE", name: "Courge", category: "Légumes", agb: "20139", product: "Courge, crue", dqr: 2.74, stages: { agriculture: 0.205, transformation: 0, emballage: 0, transport: 0.325, distribution: 0.0276, consommation: 0.0806 } },
  { code: "EPINARD", name: "Épinard", category: "Légumes", agb: "20059", product: "Épinard, cru", dqr: 2.58, stages: { agriculture: 0.12, transformation: 0, emballage: 0, transport: 0.246, distribution: 0.0466, consommation: 0.00997 } },
  { code: "BROCOLI", name: "Brocoli", category: "Légumes", agb: "20057", product: "Brocoli, cru", dqr: 3.27, stages: { agriculture: 0.537, transformation: 0.000205, emballage: 0, transport: 0.298, distribution: 0.0349, consommation: 0.0806 } },
  { code: "CHOU_FLEUR", name: "Chou-fleur", category: "Légumes", agb: "20016", product: "Chou-fleur, cru", dqr: 2.1, stages: { agriculture: 0.307, transformation: 0.000205, emballage: 0, transport: 0.298, distribution: 0.0349, consommation: 0.0806 } },
  { code: "HARICOT_VERT", name: "Haricot vert", category: "Légumes", agb: "20061_1", product: "Haricot vert, cru", dqr: 2.09, stages: { agriculture: 0.117, transformation: 0.000157, emballage: 0, transport: 0.262, distribution: 0.0282, consommation: 0.0391 } },
  { code: "PETITS_POIS", name: "Petits pois", category: "Légumes", agb: "20072", product: "Petits pois, crus", dqr: 3.33, stages: { agriculture: 0.436, transformation: 0.000161, emballage: 0, transport: 0.238, distribution: 0.0276, consommation: 0 } },
  { code: "SALADE", name: "Salade", category: "Légumes", agb: "20031", product: "Laitue, crue", dqr: 2.26, stages: { agriculture: 0.181, transformation: 0.000545, emballage: 0, transport: 0.397, distribution: 0.0746, consommation: 0.215 } },
  { code: "CONCOMBRE", name: "Concombre", category: "Légumes", agb: "20019", product: "Concombre, pulpe et peau, cru", dqr: 2.64, stages: { agriculture: 0.196, transformation: 9.5e-05, emballage: 0, transport: 0.262, distribution: 0.0219, consommation: 0.0323 } },
  { code: "POMME", name: "Pomme", category: "Fruits", agb: "13039", product: "Pomme, pulpe et peau, crue", dqr: 2.01, stages: { agriculture: 0.0919, transformation: 9.5e-05, emballage: 0, transport: 0.262, distribution: 0.0219, consommation: 0.0323 } },
  { code: "BANANE", name: "Banane", category: "Fruits", agb: "13005", product: "Banane, pulpe, crue", dqr: 2.61, stages: { agriculture: 0.295, transformation: 0.000123, emballage: 0, transport: 0.447, distribution: 0.0284, consommation: 0.138 } },
  { code: "ORANGE", name: "Orange", category: "Fruits", agb: "13034", product: "Orange, pulpe, crue", dqr: 3.1, stages: { agriculture: 0.198, transformation: 8.4e-05, emballage: 0, transport: 0.378, distribution: 0.021, consommation: 0.0806 } },
  { code: "CITRON", name: "Citron", category: "Fruits", agb: "13009", product: "Citron, pulpe, cru", dqr: 2.72, stages: { agriculture: 0.194, transformation: 9.6e-05, emballage: 0, transport: 0.406, distribution: 0.0255, consommation: 0.138 } },
  { code: "FRAISE", name: "Fraise", category: "Fruits", agb: "13014_1", product: "Fraise, crue", dqr: 2.41, stages: { agriculture: 0.24, transformation: 0, emballage: 0, transport: 0.27, distribution: 0.0131, consommation: 0.00997 } },
  { code: "HUILE_OLIVE", name: "Huile d'olive", category: "Matières grasses, sucre et autres", agb: "17270", product: "Huile d'olive vierge extra", dqr: 2.21, stages: { agriculture: 0.535, transformation: 0.0699, emballage: 0.666, transport: 0.337, distribution: 0.0179, consommation: 0 } },
  { code: "HUILE_TOURNESOL", name: "Huile de tournesol", category: "Matières grasses, sucre et autres", agb: "17440", product: "Huile de tournesol", dqr: 1.77, stages: { agriculture: 1.76, transformation: 0.209, emballage: 0.116, transport: 0.255, distribution: 0.0181, consommation: 0 } },
  { code: "SUCRE", name: "Sucre", category: "Matières grasses, sucre et autres", agb: "31016", product: "Sucre blanc", dqr: 3.09, stages: { agriculture: 0.593, transformation: 0, emballage: 0.0158, transport: 0.116, distribution: 0.0211, consommation: 0 } },
  { code: "CHOCOLAT", name: "Chocolat noir", category: "Matières grasses, sucre et autres", agb: "31085", product: "Chocolat noir à 40% de cacao minimum, à pâtisser, tablette", dqr: 1.93, stages: { agriculture: 14.2, transformation: 0.197, emballage: 0.705, transport: 0.316, distribution: 0.0209, consommation: 0 } },
  { code: "LAIT_COCO", name: "Lait de coco", category: "Matières grasses, sucre et autres", agb: "18041", product: "Lait de coco ou Crème de coco", dqr: 2.6, stages: { agriculture: 0.0703, transformation: 0.0934, emballage: 0.251, transport: 0.227, distribution: 0.0336, consommation: 0.00683 } },
];
