import { describe, expect, it } from "vitest";
import { cleanSupplierName, supplierKey } from "@/domain/fournisseurs";

describe("fournisseurs : nom et clé (26/11/2026)", () => {
  it("le nom affiché n'a jamais de n° SIRET", () => {
    expect(cleanSupplierName("Palais des Saveurs SIREN/SIRET : 39196881500038")).toBe("Palais des Saveurs");
    expect(cleanSupplierName("Bon vivant SIRET 519 264 352 00013")).toBe("Bon vivant");
    expect(cleanSupplierName("Passion Froid (BOF)")).toBe("Passion Froid (BOF)");
  });

  it("une même clé pour les variantes d'un fournisseur", () => {
    const key = supplierKey("Passion Froid");
    expect(supplierKey("Passion Froid (BOF)")).toBe(key);
    expect(supplierKey("passion froid")).toBe(key);
    expect(supplierKey("Moulin de sauret (Stock Sécu)")).toBe(supplierKey("Moulin de Sauret"));
    expect(supplierKey("Pro à Pro (Neg)")).toBe("pro a pro");
    expect(supplierKey("La Brigade des Epices (Stock Sécu)")).toBe(supplierKey("La Brigade des Épices"));
    expect(supplierKey("Palais des Saveurs SIREN/SIRET : 39196881500038")).toBe("palais des saveurs");
    expect(supplierKey("Metro")).not.toBe(supplierKey("Sysco"));
  });
});
