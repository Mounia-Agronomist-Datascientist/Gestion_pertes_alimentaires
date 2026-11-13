/**
 * Suggestion de famille alimentaire pour un ingrédient du tome Melba (docs/PHASE5.md, étape 5.5).
 *
 * Simple recherche de mots-clés dans le libellé normalisé (sans accents ni ligatures, en minuscules) : la première règle qui
 * correspond l'emporte, les plus précises sont donc placées en premier. Ce n'est qu'une suggestion : rien n'est
 * rattaché sans validation.
 */

export type IngredientSuggestion = { kind: "famille"; code: string } | { kind: "non_alimentaire" };

/** Règles dans l'ordre : code de famille, « non_alimentaire », ou null pour écarter un faux ami (« eau de vie »). */
const RULES: readonly (readonly [RegExp, string | null])[] = [
  // Contenants et ustensiles listés dans les recettes : pas des aliments.
  [/\b(moule (rond|rectangulaire|individuel)|plat a gratin|barquette|papier cuisson|film)\b/, "non_alimentaire"],
  // Pâtes à tarte, biscuits, plats végétariens et épices : avant les mots qu'ils contiennent (« noix de coco », « tomate »…).
  [/\bpate a lasagne/, "PATES"],
  // Le produit l'emporte sur l'ingrédient qui le décrit (« semoule de chou-fleur », « rösti à l'huile »…).
  [/\b(semoule|riz) de chou fleur\b/, "CHOU_FLEUR"],
  [/\brosti\b/, "POMME_DE_TERRE"],
  [/\bsaucisses?\b/, "PORC"],
  [/\bassaisonnement\b/, "EPICES"],
  [/\bfinanciers? (amande|nature|pistache|noisette)/, "CAKE"],
  [/\b(pate brisee|tartelette brise)/, "PATE_BRISEE"],
  [/\bpate feuilletee\b/, "PATE_FEUILLETEE"],
  [/\b(cookies?|biscuits?|sables?|monka|crackers?|barres? de cereales)\b/, "BISCUIT"],
  [/\bfond (de )?tartelette\b/, "PATE_BRISEE"],
  [/\bcake\b/, "CAKE"],
  [/\bfalafels?\b/, "FALAFEL"],
  [/\b(boulettes? (vege|soja|vegetale)|steak vegetal)/, "BOULETTE_VEGETALE"],
  [/\b(poivre|cumin|curry|paprika|cannelle|muscade|ras el hanout|colombo|piment|epices|rubs?)\b/, "EPICES"],
  [/\bromarin frais\b/, "HERBES"],
  [/\b(herbes de provence|thym|origan|romarin|zaatar)\b/, "HERBES_SECHEES"],
  [/\bgingembre\b/, "GINGEMBRE"],
  [/\blevure\b/, "LEVURE"],
  [/\beau de vie\b/, null],
  [/\beau\b/, "EAU"],
  [/\b(gros sel|fleur de sel|sel)\b/, "SEL"],
  [/\bhuile( d)? ?olive\b/, "HUILE_OLIVE"],
  [/\bhuile( de)? colza\b/, "HUILE_COLZA"],
  [/\bhuile( de)? tournesol\b/, "HUILE_TOURNESOL"],
  [/\b(lait|creme) de coco\b/, "LAIT_COCO"],
  [/\bbeurre de cacahuete/, "BEURRE_CACAHUETE"],
  [/\bcreme (fraiche|liquide|epaisse|entiere|legere)\b|\bcreme \d/, "CREME"],
  [/\b(fromage blanc|yaourt|yogourt|skyr)\b/, "YAOURT"],
  [/\bchevre\b/, "FROMAGE_CHEVRE"],
  [/\b(fromage frais|saint moret|ricotta|mascarpone|cream cheese)\b/, "FROMAGE_FRAIS"],
  [/\bmozzarella\b/, "MOZZARELLA"],
  [/\b(emmental|comte|grana|parmesan|beaufort|cantal|morbier|raclette|mimolette|gruyere|tomme|reblochon)\b/, "FROMAGE_PATE_DURE"],
  [/\bbeurre\b/, "BEURRE"],
  [/\blait\b/, "LAIT"],
  [/\b(oeuf|oeufs|jaune d oeuf|blanc d oeuf)\b/, "OEUF"],
  [/\b(boeuf|vbf|bovin)\b/, "BOEUF"],
  [/\bveau\b/, "VEAU"],
  [/\bagneau\b/, "AGNEAU"],
  [/\bjambon\b/, "JAMBON_CUIT"],
  [/\blardons?\b/, "LARDONS"],
  [/\b(porc|echine|filet mignon)\b/, "PORC"],
  [/\bdinde\b/, "DINDE"],
  [/\bcanard\b/, "CANARD"],
  [/\b(poulet|volaille)\b/, "POULET"],
  [/\bsaumon\b/, "SAUMON"],
  [/\b(colin|cabillaud|merlu|lieu|poisson blanc|eglefin|limande|merlan)\b/, "POISSON_BLANC"],
  [/\bthon\b/, "THON"],
  [/\b(crevettes?|gambas)\b/, "CREVETTE"],
  [/\briz\b/, "RIZ"],
  [/\b(pates|lasagnes?|papillons?|linguine|spaghetti|penne|macaroni|coquillettes?|tagliatelles?|fusilli|farfalle|orzo)\b/, "PATES"],
  [/\bsemoule\b/, "SEMOULE"],
  [/\bfarine\b/, "FARINE"],
  [/\b(pain|chapelure)\b/, "PAIN"],
  [/\b(pommes? de terre|potatoes)\b/, "POMME_DE_TERRE"],
  [/\blentilles?\b/, "LENTILLES"],
  [/\bpois chiches?\b/, "POIS_CHICHES"],
  [/\bquinoa\b/, "QUINOA"],
  [/\bboulgour\b/, "BOULGOUR"],
  [/\bepeautre\b/, "EPEAUTRE"],
  [/\bpolenta\b/, "POLENTA"],
  [/\b(amidon|maizena|fecule)\b/, "AMIDON"],
  [/\bavoine\b/, "AVOINE"],
  [/\bharicots? (blancs?|rouges?)\b/, "HARICOTS_CONSERVE"],
  [/\bmais\b/, "MAIS"],
  [/\btomates?\b/, "TOMATE"],
  [/\bcarottes?\b/, "CAROTTE"],
  [/\boignons?\b/, "OIGNON"],
  [/\bechalotes?\b/, "ECHALOTE"],
  [/\bail\b/, "AIL"],
  [/\bcourgettes?\b/, "COURGETTE"],
  [/\baubergines?\b/, "AUBERGINE"],
  [/\bpoivrons?\b/, "POIVRON"],
  [/\bpoireaux?\b/, "POIREAU"],
  [/\b(courge|butternut|potiron|potimarron)\b/, "COURGE"],
  [/\bepinards?\b/, "EPINARD"],
  [/\bbrocolis?\b/, "BROCOLI"],
  [/\bchou fleur\b/, "CHOU_FLEUR"],
  [/\bchoux?\b/, "CHOU"],
  [/\bharicots? verts?\b/, "HARICOT_VERT"],
  [/\bpetits? pois\b/, "PETITS_POIS"],
  [/\b(salade|laitue|mesclun|roquette)\b/, "SALADE"],
  [/\bconcombres?\b/, "CONCOMBRE"],
  [/\bceleri\b/, "CELERI"],
  [/\bnavets?\b/, "NAVET"],
  [/\bpanais\b/, "PANAIS"],
  [/\bfenouil\b/, "FENOUIL"],
  [/\bartichauts?\b/, "ARTICHAUT"],
  [/\bolives?\b/, "OLIVE"],
  [/\bpruneaux?\b/, "PRUNEAU"],
  [/\braisins? secs?\b/, "RAISIN_SEC"],
  [/\bpommes?\b/, "POMME"],
  [/\bbananes?\b/, "BANANE"],
  [/\boranges?\b/, "ORANGE"],
  [/\bcitrons?\b/, "CITRON"],
  [/\bfraises?\b/, "FRAISE"],
  [/\bpoires?\b/, "POIRE"],
  [/\babricots?\b/, "ABRICOT"],
  [/\b(myrtilles?|framboises?|cassis|fruits rouges|mures?)\b/, "MYRTILLE"],
  [/\b(sucre|cassonade|vergeoise)\b/, "SUCRE"],
  [/\bmiel\b/, "MIEL"],
  [/\bchocolat\b/, "CHOCOLAT"],
  [/\bcacao\b/, "CACAO"],
  [/\bamandes?\b/, "AMANDE"],
  [/\bnoix de cajou\b/, "NOIX_CAJOU"],
  [/\bnoix de coco\b/, null],
  [/\bnoisettes?\b/, "NOISETTE"],
  [/\b(sesame|graines? de tournesol|pavot)\b/, "GRAINES"],
  [/\b(noix|cerneaux)\b/, "NOIX"],
  [/\bvinaigre\b/, "VINAIGRE"],
  [/\bvin\b/, "VIN"],
  [/\bmoutarde\b/, "MOUTARDE"],
  [/\b(persil|basilic|aneth|ciboulette|coriandre|menthe|estragon|cerfeuil)\b/, "HERBES"],
];

const normalize = (label: string) =>
  label
    .replace(/œ/gi, "oe")
    .replace(/æ/gi, "ae")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Suggestion pour un libellé du tome ; null quand aucune règle ne correspond ou qu'une règle l'écarte. */
export function suggestFamily(label: string): IngredientSuggestion | null {
  const key = normalize(label);
  const rule = RULES.find(([pattern]) => pattern.test(key));
  if (!rule?.[1]) return null;
  return rule[1] === "non_alimentaire" ? { kind: "non_alimentaire" } : { kind: "famille", code: rule[1] };
}
