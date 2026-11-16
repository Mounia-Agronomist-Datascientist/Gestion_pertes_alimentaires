import { describe, expect, it } from "vitest";
import { type CauseWeight, recurringCause, topCause } from "@/domain/causes-recurrentes";

const c = (causeId: string, kg: number, events = 1): CauseWeight => ({ causeId, causeName: `Cause ${causeId}`, kg, events });

describe("causes récurrentes", () => {
  it("cause en tête : la plus lourde, puis la plus fréquente ; pas de cause en cas d'égalité parfaite", () => {
    expect(topCause([c("a", 2), c("b", 5)])?.causeId).toBe("b");
    expect(topCause([c("a", 0, 3), c("b", 0, 1)])?.causeId).toBe("a");
    expect(topCause([c("a", 4, 2), c("b", 4, 2)])).toBeNull();
    expect(topCause([])).toBeNull();
  });

  it("alerte quand la même cause est en tête des 3 dernières semaines", () => {
    const r = recurringCause([[c("b", 9)], [c("a", 6), c("b", 2)], [c("a", 4)], [c("a", 8), c("b", 7)]], 3);
    expect(r).toMatchObject({ causeId: "a", causeName: "Cause a" });
    expect(r!.weeks.map((w) => w.kg)).toEqual([6, 4, 8]);
  });

  it("pas d'alerte si une semaine n'a pas de perte, change de cause ou manque", () => {
    expect(recurringCause([[c("a", 6)], [], [c("a", 4)]], 3)).toBeNull();
    expect(recurringCause([[c("a", 6)], [c("b", 6)], [c("a", 4)]], 3)).toBeNull();
    expect(recurringCause([[c("a", 6)], [c("a", 4)]], 3)).toBeNull();
    // Réglage : 2 semaines suffisent.
    expect(recurringCause([[c("a", 6)], [c("a", 4)]], 2)?.causeId).toBe("a");
  });
});
