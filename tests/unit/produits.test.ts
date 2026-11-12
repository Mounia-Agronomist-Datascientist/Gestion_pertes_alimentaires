import { describe, expect, it } from "vitest";
import { productLabel } from "@/domain/produits";

describe("nom affiché d'un produit", () => {
  it("met le code Melba devant le nom d'un plat", () => {
    expect(productLabel("Ragoût de porc", "VI04")).toBe("VI04_Ragoût de porc");
    expect(productLabel("Carottes", null)).toBe("Carottes");
  });
});
