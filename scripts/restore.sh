#!/usr/bin/env bash
# Restaure une sauvegarde chiffrée dans la base TARGET_URL (son contenu est remplacé).
# Usage : TARGET_URL=... BACKUP_PASSPHRASE=... RESTORE_CONFIRM=oui scripts/restore.sh <fichier.dump.enc>
set -euo pipefail
: "${TARGET_URL:?TARGET_URL manquant (base à remplacer)}"
case "$TARGET_URL" in
  postgres://*|postgresql://*) ;;
  *) echo "TARGET_URL doit commencer par postgresql:// (sans guillemets, espace ni texte avant)" >&2; exit 1 ;;
esac
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE manquant}"
file="${1:?Fichier de sauvegarde manquant}"
if [ "${RESTORE_CONFIRM:-}" != "oui" ]; then
  echo "Refusé : la restauration remplace le contenu de la base cible. Relancez avec RESTORE_CONFIRM=oui." >&2
  exit 1
fi
# Déchiffrement d'abord dans un fichier temporaire : une phrase secrète erronée arrête tout avant la base.
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
if ! openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$file" -out "$tmp" 2>/dev/null; then
  echo "Échec du déchiffrement : phrase secrète incorrecte ou fichier abîmé. La base n'a pas été modifiée." >&2
  exit 1
fi
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$TARGET_URL" "$tmp"
echo "Restauration terminée dans la base cible."
