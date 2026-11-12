import { describe, expect, it } from "vitest";
import { tablesToCsv, toCsv } from "@/domain/csv";

describe("CSV pour Excel", () => {
  it("point-virgule, virgule décimale, guillemets et BOM", () => {
    expect(toCsv(["Semaine", "Kg"], [["S45-2026", 6.9], ['Cause "A"; B', null], ["=1+1", -2.5]])).toBe(
      '﻿Semaine;Kg\r\nS45-2026;6,9\r\n"Cause ""A""; B";\r\n\'=1+1;-2,5\r\n',
    );
  });

  it("plusieurs tableaux : titre, puis ligne vide entre deux ; un seul tableau sans titre", () => {
    const a = { title: "Causes", headers: ["Cause", "Kg"], rows: [["Casse", 1.5]] };
    const b = { title: "Destinations", headers: ["Destination", "Kg"], rows: [["Compost", 2]] };
    expect(tablesToCsv([a, b])).toBe("﻿Causes\r\nCause;Kg\r\nCasse;1,5\r\n\r\nDestinations\r\nDestination;Kg\r\nCompost;2\r\n");
    expect(tablesToCsv([a])).toBe(toCsv(a.headers, a.rows));
  });
});
