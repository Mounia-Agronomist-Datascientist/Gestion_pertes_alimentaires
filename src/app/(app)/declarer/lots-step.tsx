"use client";

/**
 * Étape « N° de lot et DLC » de la saisie (Réception, Stockage ; règle R37) : facultative, une ligne par lot ou DLC
 * avec sa quantité, et des photos de l'étiquette réduites sur l'appareil avant l'envoi.
 */
import { useRef, useState } from "react";
import {
  formatDlc,
  lotRemaining,
  MAX_LOT_LINES,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS,
  PHOTO_MAX_SIDE,
  parseDlc,
} from "@/domain/lots";

/** Ligne telle que tapée (texte, clavier français). */
export interface LotLineText {
  lotNumber: string;
  /** « 25/11/26 », « 25/11/2026 »… */
  dlc: string;
  quantity: string;
}

/** Photo déjà enregistrée (`photoId`) ou prise sur l'appareil (`dataUrl`) ; `src` sert à l'aperçu. */
export interface WizardPhoto {
  photoId?: string;
  dataUrl?: string;
  src: string;
}

const EMPTY_LINE: LotLineText = { lotNumber: "", dlc: "", quantity: "" };
const numberFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });
const fmt = (n: number) => numberFormat.format(n);
const longDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function parseNumber(value: string): number | null {
  const n = Number.parseFloat(value.replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
}

const isFilled = (l: LotLineText) => !!(l.lotNumber.trim() || l.dlc.trim());

/** Met les barres au fil de la frappe : « 251126 » → « 25/11/26 ». */
function formatDlcTyping(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join("/");
}

/** Lignes envoyées au serveur : une seule ligne porte toute la quantité. */
export function lotsPayload(lines: readonly LotLineText[], total: number, today: string) {
  const filled = lines.filter(isFilled);
  return filled.map((l) => ({
    lotNumber: l.lotNumber.trim() || null,
    dlc: l.dlc.trim() ? parseDlc(l.dlc, today) : null,
    quantity: filled.length === 1 ? total : (parseNumber(l.quantity) ?? 0),
  }));
}

/** Résumé pour le récapitulatif ; null si rien n'est noté. */
export function lotsSummary(lines: readonly LotLineText[], today: string, unitLabel: string): string | null {
  const filled = lines.filter(isFilled);
  if (!filled.length) return null;
  return filled
    .map((l) => {
      const dlc = l.dlc.trim() ? parseDlc(l.dlc, today) : null;
      const parts = [l.lotNumber.trim() && `Lot ${l.lotNumber.trim()}`, dlc && `DLC ${formatDlc(dlc)}`];
      return parts.filter(Boolean).join(" · ") + (filled.length > 1 ? ` : ${l.quantity} ${unitLabel}` : "");
    })
    .join(" ; ");
}

/** Réduit une photo (plus grand côté 1600 px, JPEG) pour qu'elle reste lisible et légère. */
async function resizePhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  let side = PHOTO_MAX_SIDE;
  for (;;) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.8, 0.7, 0.6, 0.5]) {
      const url = canvas.toDataURL("image/jpeg", quality);
      if ((url.length - url.indexOf(",") - 1) * 0.75 <= MAX_PHOTO_BYTES * 0.9) {
        bitmap.close();
        return url;
      }
    }
    side = Math.round(side * 0.75);
    if (side < 600) {
      bitmap.close();
      throw new Error("Photo trop lourde");
    }
  }
}

export function LotsStep({
  total,
  unitLabel,
  today,
  lines: storedLines,
  onLinesChange,
  photos,
  onPhotosChange,
  onContinue,
}: {
  total: number;
  unitLabel: string;
  today: string;
  lines: LotLineText[];
  onLinesChange: (lines: LotLineText[]) => void;
  /** null : pas de photos (série). */
  photos: WizardPhoto[] | null;
  onPhotosChange: (photos: WizardPhoto[]) => void;
  onContinue: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lines = storedLines.length ? storedLines : [EMPTY_LINE];
  const filled = lines.filter(isFilled);
  const several = lines.length > 1;

  const update = (index: number, patch: Partial<LotLineText>) =>
    onLinesChange(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  const remove = (index: number) => onLinesChange(lines.filter((_, i) => i !== index));

  const quantities = filled.map((l) => parseNumber(l.quantity));
  const remaining = several
    ? lotRemaining(
        total,
        quantities.map((q) => ({ quantity: q ?? 0 })),
      )
    : 0;
  const badDlc = lines.some((l) => l.dlc.trim() && !parseDlc(l.dlc, today));
  const missingQuantity = several && filled.some((_, i) => !(quantities[i]! > 0));
  const splitWrong = several && filled.length > 0 && Math.abs(remaining) > 0.001;
  const blocked = badDlc || missingQuantity || splitWrong;

  async function addPhotos(files: FileList | null) {
    if (!files?.length || !photos) return;
    setPhotoError(null);
    setBusy(true);
    try {
      const added: WizardPhoto[] = [];
      for (const file of Array.from(files).slice(0, MAX_PHOTOS - photos.length)) {
        const dataUrl = await resizePhoto(file);
        added.push({ dataUrl, src: dataUrl });
      }
      onPhotosChange([...photos, ...added]);
    } catch {
      setPhotoError("Photo illisible : reprenez-la.");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">N° de lot et DLC</h1>
      <p className="text-slate-600">
        Facultatif. Plusieurs lots ou DLC pour ce produit ? Ajoutez une ligne par lot et répartissez la quantité (
        {fmt(total)} {unitLabel}).
      </p>

      {photos && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {photos.map((p, i) => (
              <div key={p.photoId ?? i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- aperçu local ou photo privée */}
                <img
                  src={p.src}
                  alt={`Photo ${i + 1} de l'étiquette`}
                  className="size-24 rounded-lg border border-slate-200 object-cover"
                />
                <button
                  type="button"
                  className="absolute -top-2 -right-2 flex size-8 items-center justify-center rounded-full bg-brun-700 text-white shadow"
                  aria-label={`Retirer la photo ${i + 1}`}
                  onClick={() => onPhotosChange(photos.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          {photos.length < MAX_PHOTOS && (
            <label className="btn-secondary flex cursor-pointer items-center justify-center gap-2">
              <span aria-hidden>📷</span>
              {busy ? "Préparation de la photo…" : photos.length ? "Ajouter une photo" : "Photographier l'étiquette"}
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                disabled={busy}
                onChange={(e) => addPhotos(e.target.files)}
              />
            </label>
          )}
          {photoError && (
            <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">
              {photoError}
            </p>
          )}
          <p className="text-sm text-slate-500">
            {MAX_PHOTOS} photos au plus, gardées 3 mois. Tapez quand même le n° de lot et la DLC ci-dessous.
          </p>
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {lines.map((l, i) => {
          const dlc = l.dlc.trim() ? parseDlc(l.dlc, today) : null;
          return (
            <li key={i} className="flex flex-col gap-2 rounded-2xl bg-white p-3 shadow-sm">
              {several && (
                <div className="flex items-center justify-between">
                  <span className="font-medium">Lot {i + 1}</span>
                  <button
                    type="button"
                    className="text-sm font-medium text-rouge-700 underline"
                    onClick={() => remove(i)}
                  >
                    Retirer
                  </button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">N° de lot</span>
                  <input
                    className="field"
                    value={l.lotNumber}
                    autoCapitalize="characters"
                    autoComplete="off"
                    maxLength={60}
                    aria-label={several ? `N° de lot ${i + 1}` : "N° de lot"}
                    onChange={(e) => update(i, { lotNumber: e.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">DLC</span>
                  <input
                    className="field"
                    inputMode="numeric"
                    placeholder="JJ/MM/AA"
                    value={l.dlc}
                    aria-label={several ? `DLC ${i + 1}` : "DLC"}
                    onChange={(e) => update(i, { dlc: formatDlcTyping(e.target.value) })}
                  />
                </label>
              </div>
              {l.dlc.trim() &&
                (dlc ? (
                  <span className="text-sm text-slate-600">{longDate.format(new Date(`${dlc}T12:00:00Z`))}</span>
                ) : (
                  <span className="text-sm text-red-700">Date inconnue : JJ/MM/AA</span>
                ))}
              {several && (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2">
                    <span className="text-sm font-medium">Quantité</span>
                    <input
                      className="field w-28"
                      inputMode="decimal"
                      value={l.quantity}
                      aria-label={`Quantité du lot ${i + 1}`}
                      onChange={(e) => update(i, { quantity: e.target.value })}
                    />
                    <span className="text-sm">{unitLabel}</span>
                  </label>
                  {!l.quantity.trim() && remaining > 0 && (
                    <button
                      type="button"
                      className="text-sm font-medium text-rouge-700 underline"
                      onClick={() => update(i, { quantity: String(remaining).replace(".", ",") })}
                    >
                      Mettre le reste ({fmt(remaining)} {unitLabel})
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {lines.length < MAX_LOT_LINES && (
        <button
          type="button"
          className="self-start font-medium text-rouge-700 underline"
          onClick={() => onLinesChange([...lines, EMPTY_LINE])}
        >
          + Ajouter un autre lot ou une autre DLC
        </button>
      )}

      {several && filled.length > 0 && (
        <p
          className={`rounded-xl p-3 ${splitWrong ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900"}`}
          role="status"
        >
          {remaining > 0.001
            ? `Reste à répartir : ${fmt(remaining)} ${unitLabel}`
            : remaining < -0.001
              ? `${fmt(-remaining)} ${unitLabel} de trop`
              : `Total réparti : ${fmt(total)} ${unitLabel}`}
        </p>
      )}

      <button type="button" className="btn-primary" disabled={blocked || busy} onClick={onContinue}>
        {filled.length || photos?.length ? "Continuer" : "Passer (rien à noter)"}
      </button>
    </section>
  );
}
