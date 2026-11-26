/**
 * Articles saisis à la main en Réception ou en Stockage (décision du 23/11/2026) : déjà dans la liste des articles,
 * à valider par l'administration (valider, ouvrir la fiche pour corriger, ou fusionner avec un article existant).
 */
import Link from "next/link";
import { PRODUCT_CATEGORY_LABELS } from "@/modules/declarations/input";
import { enteredArticleAction } from "../actions";
import { DeleteButton } from "./delete-button";

type Category = keyof typeof PRODUCT_CATEGORY_LABELS;

export interface EnteredArticle {
  id: string;
  name: string;
  category: Category;
  supplier: string | null;
  supplierId: string | null;
  supplierToValidate: boolean;
  enteredBy: string | null;
  comment: string | null;
  createdAt: Date;
  declarations: number;
  /** Sans aucune perte ni historique : peut être supprimé. */
  deletable: boolean;
}

const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });

export function EnteredArticles({
  articles,
  candidates,
}: {
  articles: EnteredArticle[];
  /** Articles validés de la liste, par type, pour une fusion. */
  candidates: { id: string; name: string; category: Category }[];
}) {
  if (articles.length === 0) return null;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
      <h2 className="text-lg font-semibold">Articles saisis à la main — à valider ({articles.length})</h2>
      <p className="text-sm text-amber-950">
        Ajoutés en Réception ou en Stockage par les opérateurs, ils sont déjà proposés à la saisie. Validez-les,
        corrigez leur fiche (nom, poids, prix, fournisseur), ou fusionnez-les avec l&apos;article existant s&apos;il
        s&apos;agit d&apos;un doublon : leurs pertes passent alors sur cet article. Un article ajouté par erreur et sans
        aucune perte peut être supprimé.
      </p>
      <ul className="flex flex-col gap-3">
        {articles.map((a) => (
          <li key={a.id} className="flex flex-col gap-2 rounded-xl bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold">{a.name}</span>
              <span className="text-sm text-slate-600">{PRODUCT_CATEGORY_LABELS[a.category]}</span>
            </div>
            <p className="text-sm text-slate-600">
              Fournisseur : {a.supplier ?? "non indiqué"}
              {a.supplierToValidate && " (nouveau, à valider)"} · saisi par {a.enteredBy ?? "—"} le{" "}
              {day.format(a.createdAt)} · {a.declarations} perte{a.declarations > 1 ? "s" : ""}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <form action={enteredArticleAction}>
                <input type="hidden" name="intent" value="validate" />
                <input type="hidden" name="productId" value={a.id} />
                <button type="submit" className="rounded-xl bg-brun-700 px-4 py-2 font-semibold text-white">
                  Valider l&apos;article
                </button>
              </form>
              {a.supplierToValidate && a.supplierId && (
                <form action={enteredArticleAction}>
                  <input type="hidden" name="intent" value="validate_supplier" />
                  <input type="hidden" name="supplierId" value={a.supplierId} />
                  <button type="submit" className="rounded-xl border-2 border-brun-700 px-4 py-2 font-semibold">
                    Valider le fournisseur
                  </button>
                </form>
              )}
              <Link href={`/admin/produits/${a.id}`} className="px-2 font-medium text-rouge-700 underline">
                Ouvrir la fiche
              </Link>
              {a.deletable ? (
                <form action={enteredArticleAction}>
                  <input type="hidden" name="productId" value={a.id} />
                  <DeleteButton name={a.name} className="px-2 font-medium text-red-800 underline" />
                </form>
              ) : (
                <span className="text-sm text-slate-500">
                  Pas de suppression : il a des pertes (fusionnez-le ou validez-le).
                </span>
              )}
            </div>
            <form action={enteredArticleAction} className="flex flex-col gap-1">
              <input type="hidden" name="intent" value="comment" />
              <input type="hidden" name="productId" value={a.id} />
              <label className="flex flex-col gap-1 text-sm">
                <span>Commentaire</span>
                <textarea
                  name="comment"
                  className="field min-h-16 w-full"
                  maxLength={1000}
                  defaultValue={a.comment ?? ""}
                  placeholder="ex. demander le poids du colis à la réception"
                />
              </label>
              <button type="submit" className="self-start text-sm font-medium text-rouge-700 underline">
                Enregistrer le commentaire
              </button>
            </form>
            <form action={enteredArticleAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="intent" value="merge" />
              <input type="hidden" name="productId" value={a.id} />
              <label className="flex w-full min-w-0 flex-col gap-1 text-sm">
                <span>Doublon ? Fusionner avec :</span>
                <select name="targetId" className="field w-full min-w-0" defaultValue="" required>
                  <option value="" disabled>
                    Choisir l&apos;article existant…
                  </option>
                  {candidates
                    .filter((c) => c.category === a.category && c.id !== a.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
              <button type="submit" className="rounded-xl border-2 border-brun-700 px-4 py-2 font-semibold">
                Fusionner
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
