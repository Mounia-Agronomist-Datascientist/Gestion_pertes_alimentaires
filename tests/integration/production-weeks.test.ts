import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { productionWeeks } from "@/db/schema";
import { generateProductionCalendar } from "@/domain/semaine-production";
import { createTestDb } from "../helpers/test-db";

describe("table production_weeks", () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>;

  beforeAll(async () => {
    testDb = await createTestDb();
  });

  afterAll(async () => {
    await testDb.close();
  });

  it("accepte le calendrier généré pour 2026 et 2027", async () => {
    const weeks = [...generateProductionCalendar(2026), ...generateProductionCalendar(2027)];
    await testDb.db.insert(productionWeeks).values(weeks);
    const rows = await testDb.db.select().from(productionWeeks);
    expect(rows).toHaveLength(53 + 52);
  });

  it("refuse une semaine qui ne commence pas un jeudi", async () => {
    await expect(
      testDb.db.insert(productionWeeks).values({ year: 2030, number: 10, startDate: "2030-03-04", endDate: "2030-03-10" }),
    ).rejects.toThrow();
  });

  it("refuse une semaine qui ne dure pas 7 jours", async () => {
    await expect(
      testDb.db.insert(productionWeeks).values({ year: 2030, number: 10, startDate: "2030-03-07", endDate: "2030-03-14" }),
    ).rejects.toThrow();
  });

  it("refuse un doublon année/numéro", async () => {
    await expect(
      testDb.db.insert(productionWeeks).values({ year: 2026, number: 46, startDate: "2030-03-07", endDate: "2030-03-13" }),
    ).rejects.toThrow();
  });
});
