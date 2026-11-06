import { describe, expect, it } from "vitest";
import {
  computeProductionWeek,
  findProductionWeek,
  formatProductionWeek,
  generateProductionCalendar,
  isLateDeclaration,
  isoWeekOf,
  productionWeekStart,
  toProductionLocalDate,
} from "@/domain/semaine-production";

describe("semaine ISO (contrôle de l'outil interne)", () => {
  it("le jeudi 05/11/2026 est en ISO 45 — d'où l'interdiction d'utiliser l'ISO directement", () => {
    expect(isoWeekOf("2026-11-05")).toEqual({ year: 2026, number: 45 });
  });

  it("gère les années à 53 semaines ISO", () => {
    expect(isoWeekOf("2026-12-28")).toEqual({ year: 2026, number: 53 });
    expect(isoWeekOf("2027-01-04")).toEqual({ year: 2027, number: 1 });
  });
});

describe("semaine de production jeudi → mercredi", () => {
  it("exemple du cahier des charges : jeudi 05/11/2026 = S46", () => {
    expect(computeProductionWeek("2026-11-05")).toEqual({
      year: 2026,
      number: 46,
      startDate: "2026-11-05",
      endDate: "2026-11-11",
    });
  });

  it("le mercredi appartient encore à la semaine commencée le jeudi précédent", () => {
    expect(computeProductionWeek("2026-11-11").number).toBe(46);
  });

  it("le jeudi suivant ouvre la semaine suivante", () => {
    expect(computeProductionWeek("2026-11-12").number).toBe(47);
  });

  it.each([
    ["2026-11-05", "2026-11-05"], // jeudi
    ["2026-11-06", "2026-11-05"], // vendredi
    ["2026-11-08", "2026-11-05"], // dimanche
    ["2026-11-09", "2026-11-05"], // lundi
    ["2026-11-11", "2026-11-05"], // mercredi
  ])("le %s appartient à la semaine débutant le %s", (date, start) => {
    expect(productionWeekStart(date)).toBe(start);
  });

  it("du 24/12/2026 au 30/12/2026 : S53-2026 (validé)", () => {
    expect(computeProductionWeek("2026-12-24")).toMatchObject({ year: 2026, number: 53, endDate: "2026-12-30" });
    expect(computeProductionWeek("2026-12-30")).toMatchObject({ year: 2026, number: 53 });
  });

  it("le 31/12/2026 ouvre la S01-2027 (validé)", () => {
    expect(computeProductionWeek("2026-12-31")).toEqual({
      year: 2027,
      number: 1,
      startDate: "2026-12-31",
      endDate: "2027-01-06",
    });
    expect(computeProductionWeek("2027-01-06").number).toBe(1);
  });

  it("refuse une date mal formée ou inexistante", () => {
    expect(() => computeProductionWeek("05/11/2026")).toThrow(/format/);
    expect(() => computeProductionWeek("2026-02-30")).toThrow(/invalide/);
  });
});

describe("génération du calendrier", () => {
  it("2026 compte 53 semaines, de S01 (jeudi 25/12/2025) à S53, contiguës", () => {
    const weeks = generateProductionCalendar(2026);
    expect(weeks).toHaveLength(53);
    // S01-2026 contient le lundi 29/12/2025, premier lundi de la semaine ISO 1 de 2026.
    expect(weeks[0]).toMatchObject({ number: 1, startDate: "2025-12-25", endDate: "2025-12-31" });
    expect(weeks[1]).toMatchObject({ number: 2, startDate: "2026-01-01" });
    expect(weeks.at(-1)).toMatchObject({ number: 53, startDate: "2026-12-24" });
    weeks.forEach((w, i) => expect(w.number).toBe(i + 1));
  });

  it("2027 compte 52 semaines et commence le 31/12/2026", () => {
    const weeks = generateProductionCalendar(2027);
    expect(weeks).toHaveLength(52);
    expect(weeks[0]?.startDate).toBe("2026-12-31");
    expect(weeks.at(-1)?.endDate).toBe("2027-12-29");
    expect(generateProductionCalendar(2028)[0]?.startDate).toBe("2027-12-30");
  });

  it("les années s'enchaînent sans trou ni chevauchement", () => {
    const all = [2025, 2026, 2027, 2028].flatMap(generateProductionCalendar);
    for (let i = 1; i < all.length; i++) {
      const prevEnd = new Date(`${all[i - 1]!.endDate}T00:00:00Z`).getTime();
      const start = new Date(`${all[i]!.startDate}T00:00:00Z`).getTime();
      expect(start - prevEnd).toBe(86_400_000);
    }
  });
});

describe("recherche dans le calendrier stocké", () => {
  const calendar = generateProductionCalendar(2026);

  it("retrouve la semaine d'une date", () => {
    expect(formatProductionWeek(findProductionWeek(calendar, "2026-11-09"))).toBe("S46-2026");
  });

  it("utilise le calendrier stocké, même corrigé par l'administrateur", () => {
    const corrected = calendar.map((w) => (w.number === 46 ? { ...w, number: 99 } : w));
    expect(findProductionWeek(corrected, "2026-11-09").number).toBe(99);
  });

  it("lève une erreur si la date n'est pas couverte", () => {
    expect(() => findProductionWeek(calendar, "2027-03-01")).toThrow(/Aucune semaine/);
  });
});

describe("déclaration tardive", () => {
  const s45 = computeProductionWeek("2026-10-29");
  const s46 = computeProductionWeek("2026-11-05");

  it("même semaine : non tardive", () => {
    expect(isLateDeclaration(s46, s46)).toBe(false);
  });

  it("saisie la semaine suivante : tardive", () => {
    expect(isLateDeclaration(s45, s46)).toBe(true);
  });
});

describe("date locale de production", () => {
  it("une saisie à 00h30 heure de Paris compte pour le jour même, pas la veille UTC", () => {
    // 23h30 UTC le mercredi 11/11 = 00h30 le jeudi 12/11 à Paris (UTC+1)
    expect(toProductionLocalDate(new Date("2026-11-11T23:30:00Z"))).toBe("2026-11-12");
  });
});

describe("écart en jours", () => {
  it("compte les jours entre deux dates, y compris d'une année à l'autre", async () => {
    const { daysBetween } = await import("@/domain/semaine-production");
    expect(daysBetween("2026-11-12", "2026-11-12")).toBe(0);
    expect(daysBetween("2026-11-12", "2026-11-19")).toBe(7);
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
  });
});
