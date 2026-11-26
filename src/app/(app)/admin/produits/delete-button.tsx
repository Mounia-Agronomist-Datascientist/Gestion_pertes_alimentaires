"use client";

/**
 * Bouton « Supprimer » d'un article sans historique : demande confirmation avant d'envoyer le formulaire (intent
 * « delete », avec le productId du formulaire parent).
 */
export function DeleteButton({ name, className }: { name: string; className: string }) {
  return (
    <button
      type="submit"
      name="intent"
      value="delete"
      className={className}
      onClick={(e) => {
        if (!window.confirm(`Supprimer définitivement l'article « ${name} » ? Il n'a aucune perte enregistrée.`))
          e.preventDefault();
      }}
    >
      Supprimer
    </button>
  );
}
