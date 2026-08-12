# DNS de madamedacosta.com

Relevé le 12 août 2026, **pendant que le site Wix fonctionne**. Sert de filet
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
