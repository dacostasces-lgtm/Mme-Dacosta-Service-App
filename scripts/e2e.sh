#!/usr/bin/env bash
#
# Lance les tests end-to-end contre une pile Supabase LOCALE.
#
# Réinitialise la base : à n'utiliser que sur la pile locale, jamais sur un
# projet hébergé. Le garde-fou dans playwright.config.ts refuse de démarrer si
# l'URL Supabase n'est pas locale, mais la première protection est ce script.
#
#   ./scripts/e2e.sh              # toute la suite
#   ./scripts/e2e.sh candidate    # un seul fichier
set -euo pipefail

cd "$(dirname "$0")/.."

echo "→ démarrage de la pile Supabase locale"
supabase start -x studio,imgproxy,vector >/dev/null

echo "→ remise à zéro de la base (migrations rejouées)"
supabase db reset >/dev/null

STATUS=$(supabase status -o json)
export NEXT_PUBLIC_SUPABASE_URL=$(node -e "process.stdout.write(JSON.parse(process.argv[1]).API_URL)" "$STATUS")
export NEXT_PUBLIC_SUPABASE_ANON_KEY=$(node -e "process.stdout.write(JSON.parse(process.argv[1]).ANON_KEY)" "$STATUS")

case "$NEXT_PUBLIC_SUPABASE_URL" in
  *127.0.0.1*|*localhost*) ;;
  *) echo "ABANDON : l'URL Supabase n'est pas locale ($NEXT_PUBLIC_SUPABASE_URL)"; exit 1 ;;
esac

echo "→ base locale : $NEXT_PUBLIC_SUPABASE_URL"
npx playwright test "$@"
