#!/usr/bin/env bash
# Sauvegarde chiffrée de la base (docs/HEBERGEMENT.md).
# Usage : DATABASE_URL=... BACKUP_PASSPHRASE=... scripts/backup.sh [dossier]
# Produit <dossier>/pertes-AAAAMMJJ-HHMM.dump.enc (format pg_dump personnalisé, chiffré AES-256).
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL manquant}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE manquant}"
dir="${1:-backups}"
mkdir -p "$dir"
file="$dir/pertes-$(date -u +%Y%m%d-%H%M).dump.enc"
pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$file"
echo "Sauvegarde : $file ($(wc -c < "$file" | tr -d ' ') octets)"
