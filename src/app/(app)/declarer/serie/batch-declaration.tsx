"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type { DeclarationOptions } from "@/modules/declarations/options";
import { type BatchResult, submitBatch } from "../actions";
import { type BatchLine, DeclarationWizard, type WizardInitial } from "../declaration-wizard";

interface Props {
  options: DeclarationOptions;
  userTeam: { letter: string; colorName: string; colorHex: string } | null;
  userId: string;
}

type View =
  | { kind: "list" }
  | { kind: "wizard"; key: number; initial?: Partial<WizardInitial>; startStep: "zone" | "product" | "recap"; editIndex: number | null };

/** Les lignes en cours sont gardées sur l'appareil (par compte) jusqu'à la validation du lot. */
const storageKey = (userId: string) => `pertes:serie:${userId}`;

function loadLines(userId: string): BatchLine[] {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    return raw ? (JSON.parse(raw) as BatchLine[]) : [];
  } catch {
    return [];
  }
}

function saveLines(userId: string, lines: BatchLine[]) {
  try {
    if (lines.length) window.localStorage.setItem(storageKey(userId), JSON.stringify(lines));
    else window.localStorage.removeItem(storageKey(userId));
  } catch {
    // Stockage indisponible : la liste reste en mémoire tant que la page est ouverte.
  }
}

export function BatchDeclaration({ options, userTeam, userId }: Props) {
  const [lines, setLines] = useState<BatchLine[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>({ kind: "list" });
  const [result, setResult] = useState<BatchResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [nextKey, setNextKey] = useState(1);

  useEffect(() => {
    const saved = loadLines(userId);
    setLines(saved);
    setLoaded(true);
    if (saved.length === 0) setView({ kind: "wizard", key: 0, startStep: "zone", editIndex: null });
  }, [userId]);

  useEffect(() => {
    if (loaded) saveLines(userId, lines);
  }, [loaded, userId, lines]);

  function openWizard(initial: Partial<WizardInitial> | undefined, startStep: "zone" | "product" | "recap", editIndex: number | null) {
    setResult(null);
    setView({ kind: "wizard", key: nextKey, initial, startStep, editIndex });
    setNextKey((k) => k + 1);
  }

  /** Nouvelle ligne au même endroit que la précédente (zone, poste, équipe et date réutilisés). */
  function addSamePlace() {
    const last = lines.at(-1)?.initial;
    if (!last) return openWizard(undefined, "zone", null);
    openWizard(
      { zoneId: last.zoneId, subzoneId: last.subzoneId, teamId: last.teamId, occurredOn: last.occurredOn, occurredTime: last.occurredTime },
      "product",
      null,
    );
  }

  function validate() {
    startTransition(async () => {
      const r = await submitBatch(lines.map((l) => l.payload));
      setResult(r);
      if (r.ok) setLines([]);
    });
  }

  if (view.kind === "wizard") {
    const editIndex = view.editIndex;
    return (
      <DeclarationWizard
        key={view.key}
        options={options}
        userTeam={userTeam}
        batch={{
          initial: view.initial,
          startStep: view.startStep,
          editing: editIndex !== null,
          onAdd: (line) => {
            setLines((prev) => (editIndex !== null ? prev.map((l, i) => (i === editIndex ? line : l)) : [...prev, line]));
            setResult(null);
            setView({ kind: "list" });
          },
          onCancel: () => setView({ kind: "list" }),
        }}
      />
    );
  }

  if (result?.ok) {
    return (
      <div className="flex flex-col gap-6">
        <div role="status" className="flex flex-col items-center gap-2 rounded-2xl bg-emerald-50 p-6 text-center text-emerald-900">
          <span aria-hidden className="flex size-16 items-center justify-center rounded-full bg-emerald-600 text-4xl text-white">
            ✓
          </span>
          <p className="text-xl font-semibold">
            {result.count} perte{result.count > 1 ? "s" : ""} enregistrée{result.count > 1 ? "s" : ""}
          </p>
        </div>
        <Link href="/historique" className="btn-primary flex items-center justify-center">
          Voir les pertes déclarées
        </Link>
        <button type="button" className="btn-secondary" onClick={() => openWizard(undefined, "zone", null)}>
          Nouvelle série
        </button>
        <Link href="/" className="text-center text-slate-600 underline">
          Terminer
        </Link>
      </div>
    );
  }

  const errorLine = result && !result.ok ? result.lineIndex : null;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Accueil
      </Link>
      <h1 className="text-2xl font-bold">Plusieurs pertes</h1>
      <p className="text-slate-600">
        Ajoutez les pertes une par une, vérifiez la liste, puis validez tout d&apos;un coup. La liste est gardée sur cet
        appareil tant qu&apos;elle n&apos;est pas validée.
      </p>

      {lines.length === 0 ? (
        <p className="rounded-2xl bg-white p-4 text-slate-600">Aucune perte dans la liste.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {lines.map((line, i) => (
            <li
              key={i}
              className={`flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm ${errorLine === i ? "ring-2 ring-red-600" : ""}`}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="font-semibold">
                  {i + 1}. {line.summary.productName}
                </span>
                <span className="whitespace-nowrap font-semibold">{line.summary.quantityLabel}</span>
              </span>
              <span className="text-sm text-slate-600">{line.summary.causeName}</span>
              <span className="text-sm text-slate-500">
                {line.summary.placeLabel} → {line.summary.destinationLabel}
              </span>
              <span className="flex gap-4">
                <button
                  type="button"
                  className="text-sm font-medium text-teal-800 underline"
                  onClick={() => openWizard(line.initial, "recap", i)}
                >
                  Modifier
                </button>
                <button
                  type="button"
                  className="text-sm font-medium text-red-800 underline"
                  onClick={() => {
                    if (window.confirm(`Retirer « ${line.summary.productName} » de la liste ?`)) {
                      setLines((prev) => prev.filter((_, j) => j !== i));
                      setResult(null);
                    }
                  }}
                >
                  Retirer
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}

      <button type="button" className="btn-secondary" onClick={addSamePlace}>
        {lines.length ? "+ Ajouter une perte (même endroit)" : "+ Ajouter une perte"}
      </button>
      {lines.length > 0 && (
        <button type="button" className="text-slate-700 underline" onClick={() => openWizard(undefined, "zone", null)}>
          + Ajouter une perte à un autre endroit
        </button>
      )}

      {result && !result.ok && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">
          {result.error} Rien n&apos;a été enregistré : corrigez la ligne puis validez à nouveau.
        </p>
      )}
      {lines.length > 0 && (
        <button type="button" className="btn-primary" disabled={pending} onClick={validate}>
          {pending ? "Enregistrement…" : lines.length > 1 ? `Valider les ${lines.length} pertes` : "Valider la perte"}
        </button>
      )}
    </div>
  );
}
