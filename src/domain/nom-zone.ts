/**
 * Nom d'une zone sans son numéro : l'administration peut écrire « 1. Réception » ; les écrans qui ajoutent déjà le
 * numéro de la zone (choix du lieu, logigramme) l'enlèvent du nom pour ne pas l'afficher deux fois (24/11/2026).
 */
export const zoneNameWithoutNumber = (name: string) => name.replace(/^\s*\d+\s*[.)–-]\s*/, "");
