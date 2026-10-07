#!/usr/bin/env bash
#
# Refuse d'agir si le projet Supabase lié n'est pas celui de Madame Dacosta.
#
# Le 7 octobre 2026, la base de production a été écrasée : un `supabase db
# reset --linked` lancé depuis le dépôt d'un autre projet, alors que ce
# projet-ci était le projet lié, a supprimé le schéma `public`, vidé
# `auth.users` et rejoué les migrations de l'autre dépôt. Aucune sauvegarde
# n'existait. Les cinq comptes, les offres et les messages sont perdus.
#
# `--linked` ne désigne rien de stable : il lit supabase/.temp/project-ref,
# écrit par le dernier `supabase link` passé par là. Rien dans la commande ne
# nomme sa cible, et rien ne la montre avant qu'elle n'agisse.
#
# Ce script nomme la cible attendue et compare. À appeler avant toute commande
# distante destructrice :
#
#   ./scripts/verifier-projet.sh && supabase db push
#
# Il ne protège que ce dépôt. La seule protection contre la même erreur commise
# ailleurs est une sauvegarde — voir docs/incident-2026-10-07.md.
set -euo pipefail

cd "$(dirname "$0")/.."

ATTENDU_FICHIER="supabase/projet-production"
LIE_FICHIER="supabase/.temp/project-ref"

if [[ ! -f "$ATTENDU_FICHIER" ]]; then
  echo "ABANDON : $ATTENDU_FICHIER est absent — impossible de savoir quel projet est le bon." >&2
  exit 1
fi

ATTENDU=$(tr -d '[:space:]' < "$ATTENDU_FICHIER")

if [[ ! -f "$LIE_FICHIER" ]]; then
  echo "ABANDON : aucun projet lié. Lancez d'abord : supabase link --project-ref $ATTENDU" >&2
  exit 1
fi

LIE=$(tr -d '[:space:]' < "$LIE_FICHIER")

if [[ "$LIE" != "$ATTENDU" ]]; then
  cat >&2 <<MSG
ABANDON : le projet lié n'est pas celui de Madame Dacosta.

  attendu : $ATTENDU
  lié     : $LIE

Une commande distante lancée maintenant viserait le mauvais projet. C'est
exactement ce qui a effacé la production le 7 octobre 2026.

Pour corriger : supabase link --project-ref $ATTENDU
MSG
  exit 1
fi

echo "→ projet lié vérifié : $LIE"
