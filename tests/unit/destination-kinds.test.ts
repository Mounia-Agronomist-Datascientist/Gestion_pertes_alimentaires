import { describe, expect, it } from "vitest";
import { destinationKindEnum } from "@/db/schema";
import { DESTINATION_KINDS } from "@/modules/admin/destination-kinds";

describe("types de destination", () => {
  it("la liste utilisable dans le navigateur correspond à l'énumération de la base", () => {
    expect([...DESTINATION_KINDS]).toEqual(destinationKindEnum.enumValues);
  });
});
