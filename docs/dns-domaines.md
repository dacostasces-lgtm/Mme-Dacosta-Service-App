# Domaines

## madamedacostaservices.com — domaine de production

Mis en service le 8 septembre 2026. C'est l'adresse publique du site.

Acheté chez Hostinger, DNS géré chez Hostinger (`byte.dns-parking.com`,
`pixel.dns-parking.com`).

| Nom | Type | Valeur | TTL |
|---|---|---|---|
| `@` | A | `216.198.79.1` | 300 |
| `www` | CNAME | `4d3f64804323daf7.vercel-dns-017.com.` | 300 |

Le CNAME est **propre à ce projet Vercel** : ne pas le remplacer par une valeur
trouvée ailleurs. Les replis génériques sont `76.76.21.21` et
`cname.vercel-dns.com.`.

Côté Vercel : les deux noms sont attachés au projet `mme-dacosta-service-app`,
`www` redirige en 308 vers la racine, certificat Let's Encrypt à renouvellement
automatique.

`NEXT_PUBLIC_SITE_URL=https://madamedacostaservices.com` est défini en
production. **Sans cette variable**, `metadataBase`, `robots.txt` et le sitemap
retombent sur l'adresse `vercel.app` et Google voit deux sites concurrents —
voir `src/lib/site.ts`.

### Les URL d'authentification Supabase suivent aussi le domaine

Réglées le 8 septembre 2026, elles étaient restées sur l'adresse `vercel.app`
après la mise en service :

| Réglage | Valeur |
|---|---|
| Site URL | `https://madamedacostaservices.com` |
| Redirect URLs | `https://madamedacostaservices.com/**`, `https://mme-dacosta-service-app.vercel.app/**` |

Elles vivent dans le tableau de bord Supabase (Authentication > URL
Configuration), pas dans ce dépôt — d'où cette trace. Supabase n'honore une
redirection que si elle figure dans la liste ; sinon il retombe silencieusement
sur le Site URL. Une inscription depuis le nouveau domaine renvoyait donc son
lien de confirmation vers `vercel.app`. L'entrée `vercel.app` est conservée pour
les déploiements de prévisualisation.

### Envoi d'emails — opérationnel depuis le 10 septembre 2026

Le domaine est vérifié chez **Resend** (région `eu-west-1`). Trois
enregistrements ajoutés par l'API Hostinger, en mode sans écrasement pour ne pas
toucher au `A` et au `CNAME` qui servent le site :

| Type | Nom | Valeur |
|---|---|---|
| TXT | `resend._domainkey` | clé DKIM (propre au compte Resend) |
| CNAME | `rsend` | `rsend-euw1.forge.rmta.net.` |
| CNAME | `send` | `send.forge.rmta.net.` |

Le point final sur les CNAME est délibéré : sans lui, un fournisseur peut
suffixer la zone et produire `send.forge.rmta.net.madamedacostaservices.com`.

**Supabase envoie par ce SMTP** — `smtp.resend.com:465`, utilisateur `resend`,
mot de passe = la clé API Resend. Réglé dans le tableau de bord (Authentication >
SMTP Settings), donc invisible du dépôt, d'où cette trace. La limite d'envoi est
passée de 2 à 100 par heure : les 2 par heure du service intégré rendaient toute
ouverture aux inscriptions impossible.

Les gabarits d'emails ont été traduits en français et repris à la charte
(confirmation, réinitialisation, lien de connexion, changement d'adresse). Ils
partaient en anglais, sur un site entièrement francophone. **Compter environ dix
minutes de propagation** après modification : la configuration est enregistrée
immédiatement mais GoTrue continue d'envoyer l'ancienne version entre-temps.

### Toujours pas de courrier entrant

La zone n'a **ni MX, ni SPF, ni DMARC** pour la réception.
`contact@madamedacostaservices.com`, affiché dans le pied de page et sur les
pages légales, peut désormais **envoyer** mais **ne reçoit rien**. Il faut une
boîte aux lettres — Hostinger en propose, ou un renvoi vers une adresse
existante.

## madamedacosta.com — ancien domaine, toujours sur Wix

Relevé le 12 août 2026, **pendant que le site Wix fonctionne**. Ce domaine
n'a pas été touché par la mise en service ci-dessus : il sert encore l'ancien
site Wix. Tant qu'il reste en ligne, deux sites se font concurrence aux yeux
des moteurs de recherche — à trancher : redirection vers le nouveau, ou arrêt. Sert de filet
avant de déplacer la gestion du DNS : tout ce qui existe aujourd'hui est ici, et
doit être recréé à l'identique chez le nouveau fournisseur **avant** de basculer
les serveurs de noms.

## État actuel

Serveurs de noms : `ns10.wixdns.net`, `ns11.wixdns.net` (Wix).

| Nom | Type | Valeur |
|---|---|---|
| `madamedacosta.com` | A | `185.230.63.107` |
| `madamedacosta.com` | A | `185.230.63.171` |
| `madamedacosta.com` | A | `185.230.63.186` |
| `www.madamedacosta.com` | CNAME | `cdn1.wixdns.net` |

C'est tout. La zone ne contient **ni MX, ni TXT, ni CAA, ni DMARC**.

Deux conséquences, indépendantes de tout projet de migration :

- **`contact@madamedacosta.com` ne reçoit rien.** Sans MX, le domaine n'accepte
  aucun courrier entrant. L'adresse affichée dans le pied de page de
  l'application renvoie donc une erreur à quiconque écrit dessus.
- **Aucune protection anti-usurpation.** Sans SPF ni DMARC, n'importe qui peut
  envoyer des emails prétendant venir de `@madamedacosta.com`. C'est ce que la
  vérification chez un fournisseur d'emails vient corriger au passage.

> Une requête MX ou TXT sur `www` renvoie la cible du CNAME : c'est le
> comportement normal du résolveur, pas un enregistrement réel. Seuls les quatre
> du tableau existent.

## Si le DNS est déplacé vers Cloudflare

1. Créer le site sur Cloudflare — il importe la zone automatiquement. **Comparer
   ce qu'il a trouvé avec le tableau ci-dessus** ; il manque souvent quelque
   chose.
2. Pour les trois A de la racine et le CNAME `www`, mettre le proxy sur **DNS
   only** (nuage gris). Le proxy de Cloudflare devant Wix casse le site.
3. Ajouter les enregistrements du fournisseur d'emails (TXT DKIM, TXT SPF, et le
   MX de retour si demandé — c'est celui que Wix refusait sur un sous-domaine).
4. Seulement ensuite, changer les serveurs de noms chez le registraire.
5. Vérifier que `madamedacosta.com` et `www` répondent toujours avant de
   considérer la bascule terminée.

La propagation prend jusqu'à 24 h, mais en pratique quelques minutes à quelques
heures. Pendant ce temps, les deux jeux de serveurs répondent : le site ne tombe
pas si la copie est fidèle.
