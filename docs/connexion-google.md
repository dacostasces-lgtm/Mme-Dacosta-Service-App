# Continuer avec Google

Le code est en place et inerte : le bouton ne s'affiche que si
`NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=1`. Tant que ce drapeau est absent, rien ne
change pour personne. Les trois étapes ci-dessous l'activent, dans cet ordre —
poser le drapeau en premier afficherait un bouton qui répond
« Unsupported provider ».

## 1. Un client OAuth chez Google

Console Google Cloud > *APIs & Services* > *Credentials* >
*Create credentials* > *OAuth client ID*, type **Web application**.

| Champ | Valeur |
|---|---|
| Authorized JavaScript origins | `https://madamedacostaservices.com` |
| Authorized redirect URIs | `https://<ref-du-projet>.supabase.co/auth/v1/callback` |

L'URI de redirection est celle de **Supabase**, pas celle du site : c'est
Supabase qui reçoit le retour de Google, puis nous renvoie sur
`/auth/confirm`. Se tromper ici produit un `redirect_uri_mismatch` que rien
dans l'application ne peut rattraper.

L'écran de consentement doit être publié (*In production*), sinon seuls les
comptes de test listés à la main peuvent se connecter.

## 2. Le fournisseur dans Supabase

Tableau de bord Supabase > *Authentication* > *Providers* > *Google* :
activer, coller le *Client ID* et le *Client Secret* de l'étape 1.

Vérifier au passage que *Authentication* > *URL Configuration* liste bien
`https://madamedacostaservices.com/**` dans les *Redirect URLs* — c'est déjà le
cas, voir [dns-domaines.md](dns-domaines.md), mais Supabase retombe
silencieusement sur le *Site URL* si l'adresse demandée n'y figure pas.

## 3. Le drapeau côté application

`NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=1` dans les variables d'environnement Vercel,
en production. C'est une variable `NEXT_PUBLIC_*`, donc figée à la
construction : **il faut redéployer** pour qu'elle prenne effet.

## Ce que Google ne donne pas

Ni rôle, ni quartier. Le rôle commande tout le reste — l'espace où la personne
atterrit, ce qu'elle peut publier, ce que la recherche remonte d'elle — et
`protect_profile_columns` le gèle après l'inscription.

D'où `profiles.onboarding_completed_at` et la page `/bienvenue`
(`20260929220000_oauth_onboarding.sql`) :

- le déclencheur d'inscription horodate la colonne quand le rôle vient de
  notre formulaire, et la laisse nulle sinon ;
- `requireUser` renvoie vers `/bienvenue` tant qu'elle est nulle ;
- `complete_onboarding()` écrit le rôle **une seule fois**, en `SECURITY
  DEFINER` pour passer outre le gel, et bascule la fiche de détail
  (`candidate_details` ↔ `employer_details`) si le choix diffère du défaut.

Les comptes existants sont rattrapés par la migration : ils ont tous choisi
leur rôle au formulaire, la porte ne les concerne pas.

Le quartier n'est pas demandé sur cet écran. Une seule question suffit à cette
étape, et le quartier reste modifiable depuis le profil — contrairement au
rôle.

## Pourquoi le bouton est sous le formulaire, pas au-dessus

C'est un raccourci, pas le chemin principal. Une bonne partie des candidates
n'a pas de compte Google, ni d'adresse email consultée — c'est la raison même
de l'inscription par numéro. Mettre Google en tête ferait passer le parcours
qui les concerne pour une solution de repli.
