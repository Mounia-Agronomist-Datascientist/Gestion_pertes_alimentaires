"use client";

/** Ouvre l'impression du navigateur (la page est mise en page pour le papier : menus masqués). */
export function PrintButton() {
  return (
    <button type="button" className="btn-secondary w-full sm:w-auto print:hidden" onClick={() => window.print()}>
      Imprimer la synthèse
    </button>
  );
}
