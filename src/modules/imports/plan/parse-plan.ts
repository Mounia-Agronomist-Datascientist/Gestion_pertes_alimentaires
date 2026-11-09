/**
 * Lecture d'un onglet hebdomadaire du Google Sheet « Plan de production » (docs/PHASE2.md, étape 2.2).
 *
 * L'onglet est fourni sous forme de grille de textes (cellules telles qu'affichées). On y cherche :
 * - les blocs « Référence PLATS » (plats, puis petits-déjeuners) : une ligne par groupe de codes produit par
 *   une même équipe, avec le nombre de barquettes du groupe ;
 * - le bloc « barquettes par code », plus bas : code, barquettes de la semaine, barquettes du premier jour.
 * Les colonnes sont repérées par leur titre (« Nb de barq. », « Equipe ») et non par leur position, qui peut
 * changer d'une semaine à l'autre. Rien n'est deviné : ce qui manque est signalé dans `anomalies`.
 */

export type Grid = readonly (readonly string[])[];

export interface PlanGroup {
  /** Codes du groupe, dans l'ordre de l'onglet (« VI02/VI08/QD02 » → 3 codes). */
  codes: string[];
  /** Lettre de l'équipe, ou null si la colonne n'est pas encore remplie. */
  team: string | null;
  /** Colonne « Nb de barq. » du groupe. */
  barquettes: number | null;
  block: "plats" | "petits_dejeuners";
  /** Numéro de ligne dans l'onglet (1 = première ligne). */
  row: number;
}

export interface PlanVolume {
  code: string;
  weekBarquettes: number;
  firstDayBarquettes: number;
  row: number;
}

export interface PlanParseResult {
  /** Semaine lue dans le nom de l'onglet : « S45 » → 45. */
  week: number | null;
  groups: PlanGroup[];
  volumes: PlanVolume[];
  anomalies: string[];
}

const CODE = /^[A-Z]{2}\d{2}$/;
const TEAM = /^[A-H]$/;

const cell = (grid: Grid, row: number, col: number) => (grid[row]?.[col] ?? "").trim();

/** « 1 234 », « 2,4 » ou « 2.4 » → nombre ; vide ou texte → null. */
export function parsePlanNumber(text: string): number | null {
  const normalized = text.replace(/[\s  ]/g, "").replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : null;
}

const normalizeHeader = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

export function parsePlan(sheetName: string, grid: Grid): PlanParseResult {
  const anomalies: string[] = [];
  const weekMatch = sheetName.trim().match(/^S(?:\d{2})?(\d{2})$/i);
  const week = weekMatch ? Number(weekMatch[1]) : null;
  if (week == null) anomalies.push(`Nom d'onglet inattendu : « ${sheetName} » (attendu : S45, S2552…)`);

  // ─── Blocs « Référence PLATS » ──────────────────────────────────────────
  const groups: PlanGroup[] = [];
  const headerRows = grid.flatMap((row, i) => (normalizeHeader(row[0] ?? "") === "referenceplats" ? [i] : []));
  if (headerRows.length === 0) anomalies.push("Bloc « Référence PLATS » introuvable dans l'onglet");
  let lastBlockRow = 0;

  headerRows.forEach((header, blockIndex) => {
    const headers = grid[header]!.map(normalizeHeader);
    const barquettesCol = headers.findIndex((h) => h.startsWith("nbdebarq"));
    const teamCol = headers.findIndex((h) => h === "equipe");
    if (barquettesCol < 0 || teamCol < 0) {
      anomalies.push(`Ligne ${header + 1} : colonnes « Nb de barq. » ou « Equipe » introuvables`);
      return;
    }
    const block = blockIndex === 0 ? "plats" : "petits_dejeuners";
    const end = headerRows[blockIndex + 1] ?? grid.length;
    for (let r = header + 1; r < end; r++) {
      const first = cell(grid, r, 0);
      if (!first) continue;
      const codes = first.split("/").map((c) => c.trim().toUpperCase()).filter(Boolean);
      if (!codes.every((c) => CODE.test(c))) {
        // Fin du bloc (autre tableau de l'onglet) : on s'arrête à la première ligne qui n'est pas un groupe.
        if (groups.some((g) => g.block === block)) break;
        continue;
      }
      const teamText = cell(grid, r, teamCol).toUpperCase();
      const team = TEAM.test(teamText) ? teamText : null;
      if (!team) anomalies.push(`Ligne ${r + 1} (${first}) : ${teamText ? `équipe « ${teamText} » inconnue` : "équipe non renseignée"}`);
      groups.push({ codes, team, barquettes: parsePlanNumber(cell(grid, r, barquettesCol)), block, row: r + 1 });
      lastBlockRow = Math.max(lastBlockRow, r);
    }
  });

  const seen = new Map<string, PlanGroup>();
  for (const group of groups) {
    for (const code of group.codes) {
      const other = seen.get(code);
      if (other) anomalies.push(`Code ${code} présent dans deux groupes (lignes ${other.row} et ${group.row})`);
      else seen.set(code, group);
    }
  }

  // ─── Barquettes par code (bloc plus bas : code | semaine | premier jour) ─
  const volumes: PlanVolume[] = [];
  for (let r = lastBlockRow + 1; r < grid.length; r++) {
    const row = grid[r]!;
    for (let c = 0; c < row.length; c++) {
      const code = cell(grid, r, c).toUpperCase();
      if (!CODE.test(code)) continue;
      const weekCount = parsePlanNumber(cell(grid, r, c + 1));
      const firstDay = parsePlanNumber(cell(grid, r, c + 2));
      if (weekCount == null || firstDay == null) continue;
      volumes.push({ code, weekBarquettes: weekCount, firstDayBarquettes: firstDay, row: r + 1 });
      break;
    }
  }
  if (volumes.length === 0) anomalies.push("Bloc des barquettes par code introuvable");
  for (const v of volumes) {
    if (!seen.has(v.code)) anomalies.push(`Code ${v.code} : barquettes prévues mais aucun groupe ni équipe`);
  }

  return { week, groups, volumes, anomalies };
}
