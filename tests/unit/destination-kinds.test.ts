import { describe, expect, it } from "vitest";
import { destinationKindEnum } from "@/db/schema";
import { DESTINATION_KINDS } from "@/modules/admin/destination-kinds";

describe("types de destination", () => {
  it("la liste utilisable dans le navigateur correspond à l'énumération de la base", () => {
    expect([...DESTINATION_KINDS]).toEqual(destinationKindEnum.enumValues);
  });
});

describe("types d'emballage et de portion", () => {
  it("les listes utilisables dans le navigateur correspondent aux énumérations de la base", async () => {
    const schema = await import("@/db/schema");
    const labels = await import("@/modules/admin/packaging-labels");
    expect([...labels.PACKAGING_KINDS]).toEqual(schema.packagingKindEnum.enumValues);
    expect([...labels.PORTION_KINDS]).toEqual(schema.portionKindEnum.enumValues);
  });
});
