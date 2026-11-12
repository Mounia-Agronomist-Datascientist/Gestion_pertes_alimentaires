import { describe, expect, it } from "vitest";
import { toCsv } from "@/domain/csv";

describe("CSV pour Excel", () => {
  it("point-virgule, virgule décimale, guillemets et BOM", () => {
    expect(toCsv(["Semaine", "Kg"], [["S45-2026", 6.9], ['Cause "A"; B', null], ["=1+1", -2.5]])).toBe(
      '﻿Semaine;Kg\r\nS45-2026;6,9\r\n"Cause ""A""; B";\r\n\'=1+1;-2,5\r\n',
    );
  });
});
