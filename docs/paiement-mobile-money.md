# Encaissement Mobile Money

## 0. PawaPay (le chemin normal depuis le 31 octobre 2026)

L'acheteur saisit le numéro qui paie, reçoit une demande d'autorisation sur son
téléphone, tape son code Mobile Money. L'achat se règle seul. Les quatre achats
passent par là : déblocage d'un numéro d'employeur, déblocage d'un numéro de
candidate, publication d'une offre, abonnement Premium.

Ce que cela a remplacé : un virement que l'acheteur faisait lui-même vers le
numéro de la plateforme en citant une référence, puis déclarait, et qu'une
personne rapprochait du relevé dans l'une des quatre files. Et cela règle au
passage l'absence de numéro marchand Airtel : il n'y a plus de numéro marchand
du tout, l'opérateur se déduit du numéro de l'acheteur.

### Variables

| Variable | Rôle |
| --- | --- |
| `PAWAPAY_API_TOKEN` | Jeton du tableau de bord PawaPay. Celui du bac à sable et celui de la production diffèrent. |
| `PAWAPAY_ENV` | `production` pour encaisser réellement. Toute autre valeur vise le bac à sable — une variable oubliée ne doit pas faire sonner de vrais téléphones. |

L'adresse de rappel se déclare chez PawaPay, pas ici :
`https://madamedacostaservices.com/api/pawapay/callback`

### Les deux règles qui tiennent la sécurité

**Le montant ne vient jamais du navigateur.** `start_pawapay_deposit` le lit sur
la ligne achetée et le rend au serveur. La fonction n'a pas de paramètre de
montant : un acheteur qui trafique sa requête ne peut pas se faire un Premium
Employeur à 100 FCFA.

**Le contenu d'un rappel n'est jamais cru.** PawaPay signe ses rappels en
RFC 9421, mais la signature se désactive depuis leur tableau de bord, sa
vérification est délicate à faire juste, et l'adresse est publique. Le serveur
ne retient du rappel que l'identifiant du versement, puis redemande son état à
PawaPay avec notre jeton. Un faux rappel disant « COMPLETED » ne déclenche au
pire qu'une vérification qui répond la vérité.

La page de l'acheteur interroge aussi l'état, toutes les trois secondes pendant
qu'il tape son code. Les deux chemins mènent à `settle_pawapay_deposit`, qui est
rejouable : un achat ne se règle qu'une fois.

### Ce qu'un versement échoué laisse

Rien n'est perdu : l'achat reste `pending_payment`, donc payable de nouveau. Le
versement échoué sort de l'index « un seul en vol », ce qui autorise la reprise.

## 1. Relais SMS (hérité, réservations seules)

Ne règle que les réservations, qu'on ne peut plus créer depuis le retrait de
« Réserver ce candidat ». Conservé pour les lignes antérieures.



Le téléphone qui porte la SIM marchand reçoit un SMS de confirmation à chaque
paiement. Une application de relais transfère ces SMS vers l'application, qui
règle la réservation dès que la référence **et** le montant correspondent
exactement.

### Contrat de la route

```
POST /api/momo/sms
x-momo-relay-secret: <MOMO_RELAY_SECRET>
Content-Type: application/json

{ "from": "MobileMoney", "body": "<texte brut du SMS>" }
```

Réponses : `401` si le secret est faux, `503` si le serveur n'est pas
configuré, `500` si la base a échoué — dans ce dernier cas seulement, le relais
doit réessayer. Sinon `200`, avec l'issue dans le corps :

| `outcome` | Signification |
| --- | --- |
| `matched` | Réservation réglée automatiquement. |
| `amount_mismatch` | Bonne référence, mauvais montant. Laissé à la vérification manuelle. |
| `unmatched` | Aucune réservation impayée ne porte cette référence. |
| `duplicate` | SMS déjà traité. Sans effet. |
| `ignored` | Expéditeur non fiable, ou message qui n'est pas un crédit. |

### Installation sur le téléphone

N'importe quelle application capable de relayer un SMS vers une URL convient
(SMS Forwarder, MacroDroid, Tasker…). Il faut :

1. Ne relayer que les SMS des expéditeurs Mobile Money, pas tous les SMS.
2. Envoyer le **texte brut**, sans reformatage : l'analyse s'appuie dessus.
3. Ajouter l'en-tête `x-momo-relay-secret`.
4. Laisser le téléphone allumé et connecté. C'est la fragilité du procédé.

### Variables d'environnement

| Variable | Rôle |
| --- | --- |
| `MOMO_RELAY_SECRET` | Secret partagé. `openssl rand -hex 32`. Sans lui la route répond `503`. |
| `MOMO_SMS_SENDERS` | Expéditeurs acceptés, séparés par des virgules. Vide = tous. |
| `SUPABASE_SERVICE_ROLE_KEY` | Contourne la RLS pour écrire le règlement. **Jamais** préfixée `NEXT_PUBLIC_`. |

## 2. Déclaration par l'employeur (manuel)

Quand le relais ne trouve rien — client qui oublie la référence, SMS perdu,
téléphone éteint — l'employeur saisit lui-même l'identifiant de transaction lu
dans son SMS. Un admin rapproche avec le relevé et confirme dans `/admin`.

Rien n'est jamais réglé sur la seule parole du client.

## Ce qui protège l'argent

- **Le montant doit être exact.** Un paiement partiel n'est jamais accepté
  automatiquement : il tomberait sinon en dessous des frais de mise en relation.
- **Les SMS de débit sont ignorés.** Une SIM marchand reçoit aussi des retraits
  et des soldes ; les régler marquerait des réservations payées quand l'argent
  sort du compte.
- **Rejeu impossible.** Chaque SMS est empreinté (sha256 de l'expéditeur et du
  corps) et un doublon est sans effet.
- **La RPC de règlement n'est exécutable que par `service_role`.** La clé `anon`
  part dans le navigateur : lui donner ce droit permettrait à n'importe qui de
  marquer sa propre réservation payée.
- **Un SMS est falsifiable.** L'expéditeur n'est qu'un second filtre derrière le
  secret partagé, pas une frontière de sécurité à lui seul.

## Journal

`/admin/momo` liste les cent derniers SMS reçus avec leur issue et leur texte
brut. C'est là qu'on diagnostique un paiement introuvable, et c'est le texte
brut qui sert à retoucher les expressions d'analyse dans
`src/lib/payments/sms.ts` quand un opérateur change sa formulation.

## Et après

Le relais SMS est un tremplin, pas une destination. Avec une SIM marchand, la
voie propre est l'[Open API de MTN Congo](https://www.mtn.cg/momo/momo-entreprise/open-api/) :
les identifiants de production sont délivrés via le tableau de bord OVA après
le KYC, et `RequestToPay` pousse alors la demande directement sur le téléphone
du client, sans téléphone relais à maintenir.
