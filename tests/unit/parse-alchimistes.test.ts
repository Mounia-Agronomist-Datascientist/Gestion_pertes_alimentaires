import { describe, expect, it } from "vitest";
import { csvToGrid, parseAlchimistes, parseCollectionDate, parseWeight } from "@/modules/imports/alchimistes/parse-alchimistes";

const HEADER =
  "Date\tType de rdv\tRégion\tNom du client\tNom de l'établissement\tNombre de contenant\tType de contenant\tPoids net (contenu déchets)\tQualite\tIncident de collecte\tType de matière\tCorrespondance aux semaines de prod";
const row = (date: string, type: string, kg: string, week = "S19", extra: { count?: string; quality?: string; incident?: string } = {}) =>
  [date, type, "Région", "Client test", "Site test", extra.count ?? "1", type === "collect" ? "120L biofiltre" : "", kg, extra.quality ?? "3", extra.incident ?? "", type === "collect" ? "Déchets en vrac" : "", week].join("\t");

describe("fichier des Alchimistes", () => {
  it("garde les collectes, ignore les livraisons et calcule la période", () => {
    const text = [HEADER, row("2026-04-30", "collect", "21,4"), row("2026-04-30", "collect", "21,4"), row("2026-04-30", "delivery", "0"), row("2026-05-04", "collect", "48"), ""].join("\n");
    const r = parseAlchimistes(csvToGrid(text));
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.deliveries).toBe(1);
    expect(r.periodFrom).toBe("2026-04-30");
    expect(r.periodTo).toBe("2026-05-04");
    // Deux bacs de même poids le même jour : deux collectes.
    expect(r.collections.map((c) => [c.date, c.netKg])).toEqual([
      ["2026-04-30", 21.4],
      ["2026-04-30", 21.4],
      ["2026-05-04", 48],
    ]);
    expect(r.collections[0]).toMatchObject({ containerType: "120L biofiltre", quality: 3, material: "Déchets en vrac", fileWeek: "S19", containerNumber: null, incident: null });
    // Les noms du client et de l'établissement ne sont jamais repris.
    expect(JSON.stringify(r)).not.toMatch(/Client test|Site test|Région/);
  });

  it("signale une semaine écrite à la main différente de celle de la date", () => {
    const r = parseAlchimistes(csvToGrid([HEADER, row("2026-05-07", "collect", "30", "S19")].join("\n")));
    expect(r.collections).toHaveLength(1);
    expect(r.warnings).toEqual(["Semaine différente (1 bac) — 2026-05-07 : « S19 » dans le fichier, S20-2026 d'après la date. La semaine calculée est gardée."]);
  });

  it("refuse une date ou un poids illisible et un fichier sans les bonnes colonnes", () => {
    const r = parseAlchimistes(csvToGrid([HEADER, row("30 avril", "collect", "21"), row("2026-04-30", "collect", "beaucoup")].join("\n")));
    expect(r.errors).toEqual(["Ligne 2 : date illisible « 30 avril ».", "Ligne 3 : poids illisible « beaucoup »."]);
    expect(parseAlchimistes([["Nom", "Poids"]]).errors[0]).toMatch(/introuvables/);
    expect(parseAlchimistes(csvToGrid([HEADER, row("2026-04-30", "delivery", "0")].join("\n"))).errors).toEqual(["Aucune collecte dans ce fichier."]);
  });

  it("lit le n° du bac quand la colonne existe, et prévient pour un 0 kg ou plusieurs contenants", () => {
    const text = ["Date;Type de rdv;Identifiant du contenant;Poids net (contenu déchets);Nombre de contenant", "30/04/2026;collect;#3610;34,2;1", "30/04/2026;collect;3835;0;2"].join("\r\n");
    const r = parseAlchimistes(csvToGrid(text));
    expect(r.collections.map((c) => [c.containerNumber, c.netKg])).toEqual([
      ["#3610", 34.2],
      ["3835", 0],
    ]);
    expect(r.warnings).toEqual(["Ligne 3 (2026-04-30) : collecte à 0 kg.", "Ligne 3 (2026-04-30) : 2 contenants sur une seule ligne, poids gardé tel quel."]);
  });

  it("lit les dates et poids des différents formats", () => {
    expect(parseCollectionDate("2026-04-30")).toBe("2026-04-30");
    expect(parseCollectionDate("2026-04-30 09:41:00")).toBe("2026-04-30");
    expect(parseCollectionDate("4/5/2026")).toBe("2026-05-04");
    expect(parseCollectionDate("46142")).toBe("2026-04-30");
    expect(parseCollectionDate("2026-02-30")).toBeNull();
    expect(parseWeight("21,4")).toBe(21.4);
    expect(parseWeight("65.6 kg")).toBe(65.6);
    expect(parseWeight("-3")).toBeNull();
  });

  it("découpe un CSV avec guillemets", () => {
    expect(csvToGrid('﻿a,b\n"x, y","il dit ""oui"""\n')).toEqual([
      ["a", "b"],
      ["x, y", 'il dit "oui"'],
    ]);
  });
});
