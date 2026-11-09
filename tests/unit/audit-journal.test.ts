import { describe, expect, it } from "vitest";
import { changedFields, redact } from "@/modules/audit/journal";

describe("journal d'audit : affichage", () => {
  it("masque les empreintes de mot de passe et les jetons, à tous les niveaux", () => {
    expect(redact({ login: "a", passwordHash: "x", nested: [{ token: "t", ok: 1 }] })).toEqual({ login: "a", nested: [{ ok: 1 }] });
  });

  it("liste les champs modifiés, sans les champs techniques", () => {
    expect(changedFields({ name: "A", active: true, updatedAt: "1" }, { name: "B", active: true, updatedAt: "2" })).toEqual(["name"]);
    expect(changedFields({ declaration: { netKg: 2, revision: 1 }, containers: [] }, { declaration: { netKg: 3, revision: 2 } })).toEqual(["netKg"]);
    expect(changedFields(null, { name: "A" })).toBeNull();
  });
});
