import { describe, expect, it } from "vitest";
import { suggestFamily } from "@/domain/ingredients-familles";
import { AGRIBALYSE_PROPOSAL } from "@/modules/environnement/agribalyse-proposal";

const suggest = (label: string) => {
  const s = suggestFamily(label);
  return s?.kind === "famille" ? s.code : (s?.kind ?? null);
};

describe("suggestion de famille d'un ingrédient Melba", () => {
  it("reconnaît les libellés du tome", () => {
    expect(
      ["sel fin", "huile colza", "Huile d'olive extra vierge", "crème fraiche épaisse 30%", "fromage blanc 3,3 %mg", "oeuf entier liquide plein air", "Lait demi-écrémé 🔵", "eau au poids", "amidon de maïs maizena"].map(suggest),
    ).toEqual(["SEL", "HUILE_COLZA", "HUILE_OLIVE", "CREME", "YAOURT", "OEUF", "LAIT", "EAU", "AMIDON"]);
    expect(["Grana Padano râpé AOP 28,4% MG", "Dos de colin d'ALASKA MSC 110gr", "Haut de cuisse poulet 140/160G", "chou-fleur fleurette CE23/50 FR SG", "chou blanc émincé", "linguine"].map(suggest)).toEqual([
      "FROMAGE_PATE_DURE",
      "POISSON_BLANC",
      "POULET",
      "CHOU_FLEUR",
      "CHOU",
      "PATES",
    ]);
  });

  it("écarte les faux amis et les contenants", () => {
    expect(suggest("MOULE ROND INDIVIDUEL BIODEG 180mL")).toBe("non_alimentaire");
    expect(suggest("Petit plat à gratin format individuel")).toBe("non_alimentaire");
    expect(suggest("Pate de citron confit en poche")).toBe("CITRON");
    expect(suggest("muscade moulue")).toBe("EPICES");
    expect(suggest("noix de coco râpée")).toBeNull();
    expect(suggest("eau de vie de poire")).toBeNull();
    expect(suggest("Boulette soja tomate basilic 19/20G")).toBe("BOULETTE_VEGETALE");
    expect(suggest("PZB_Biscuits à la noix de coco")).toBe("BISCUIT");
    expect(suggest("romarin frais")).toBe("HERBES");
    expect(suggest("thym flocon")).toBe("HERBES_SECHEES");
    expect(suggest("champignon émincé")).toBeNull();
    expect(suggest("Préparation hachée de bœuf (15% MG)")).toBe("BOEUF");
    expect(suggest("pâte à lasagne")).toBe("PATES");
    expect(
      ["semoule de chou-fleur CE2 FR", "Assaisonnement Potatoes", "saucisse piment d'espelette 80gr", "Rösti aux oignons à l'huile de tournesol", "fond tartelette sucré carré 7*7", "Crackers aux pois chiches et romarin", "Financier amande", "Financier filet Dinde (haché de Dinde)"].map(suggest),
    ).toEqual(["CHOU_FLEUR", "EPICES", "PORC", "POMME_DE_TERRE", "PATE_BRISEE", "BISCUIT", "CAKE", "DINDE"]);
  });

  it("ne suggère que des familles de la proposition", () => {
    const codes = new Set(AGRIBALYSE_PROPOSAL.map((p) => p.code));
    expect(codes.size).toBe(AGRIBALYSE_PROPOSAL.length);
    const source = Object.values(import.meta.glob("/src/domain/ingredients-familles.ts", { query: "?raw", import: "default", eager: true }))[0] as string;
    const used = [...source.matchAll(/, "([A-Z_]+)"\]/g)].map((m) => m[1]!);
    expect(used.length).toBeGreaterThan(70);
    expect(used.filter((c) => !codes.has(c))).toEqual([]);
  });
});
