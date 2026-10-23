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
supabase start -x studio,imgproxy,vector,logflare,edge-runtime,realtime >/dev/null

echo "→ remise à zéro de la base (migrations rejouées)"
supabase db reset >/dev/null

# `supabase db reset` redémarre les conteneurs et rend la main avant qu'ils
# soient repartis. Les tests commençaient alors pendant la remise en route, et
# le premier appel d'authentification échouait en AuthRetryableFetchError — un
# échec qui ressemble à un bug du code testé, et n'en est pas un.
echo "→ attente que l'authentification et l'API REST répondent"
for _ in $(seq 1 60); do
  auth=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:54321/auth/v1/health || true)
  rest=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:54321/rest/v1/ || true)
  if [ "$auth" = "200" ] && [ "$rest" = "200" ]; then
    echo "  prêtes"
    break
  fi
  sleep 2
done
if [ "${auth:-}" != "200" ] || [ "${rest:-}" != "200" ]; then
  echo "ABANDON : la pile locale n'est pas prête (auth=$auth rest=$rest)" >&2
  exit 1
fi

STATUS=$(supabase status -o json)
export NEXT_PUBLIC_SUPABASE_URL=$(node -e "process.stdout.write(JSON.parse(process.argv[1]).API_URL)" "$STATUS")
export NEXT_PUBLIC_SUPABASE_ANON_KEY=$(node -e "process.stdout.write(JSON.parse(process.argv[1]).ANON_KEY)" "$STATUS")
# Sert à fabriquer un compte sans rôle — ce que produit une connexion Google —
# sans dépendre d'un vrai aller-retour chez Google. Clé de la pile locale,
# publique et identique chez tout le monde : elle n'est jamais passée au
# serveur de test, seulement aux specs.
export SUPABASE_SERVICE_ROLE_KEY=$(node -e "process.stdout.write(JSON.parse(process.argv[1]).SERVICE_ROLE_KEY)" "$STATUS")

# Le relais de SMS Mobile Money. Sans ces deux variables l'endpoint refuse
# toute requête en 503 — à dessein : une variable oubliée ne doit pas ouvrir la
# table des réservations. Valeurs de test, pour la pile locale seulement.
export MOMO_RELAY_SECRET="secret-de-test-du-relais-momo-0000"
export MOMO_SMS_SENDERS="MobileMoney,MTNMoMo"
# Relevé pour les tests : le plafond réel (10 par jour) est un garde-fou contre
# les SMS usurpés, et son compteur — `consume_rate_limit` — est déjà couvert par
# securite-moyennes.spec.ts. Le laisser à 10 ferait échouer la suite au gré de
# l'ordre des tests, sans rien prouver de plus.
export MOMO_PLAFOND_AUTO_QUOTIDIEN=50

case "$NEXT_PUBLIC_SUPABASE_URL" in
  *127.0.0.1*|*localhost*) ;;
  *) echo "ABANDON : l'URL Supabase n'est pas locale ($NEXT_PUBLIC_SUPABASE_URL)"; exit 1 ;;
esac

echo "→ base locale : $NEXT_PUBLIC_SUPABASE_URL"
npx playwright test "$@"
