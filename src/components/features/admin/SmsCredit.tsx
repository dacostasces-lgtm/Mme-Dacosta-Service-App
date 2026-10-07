import { AlertTriangle, CheckCircle2, MessageSquareWarning } from "lucide-react";

/**
 * Seuil d'alerte, en unités de la devise du compte.
 *
 * Un SMS vers le Congo coûte quelques centimes : en dessous de deux unités il
 * reste quelques dizaines d'envois, soit moins d'une journée d'inscriptions un
 * jour ordinaire. Assez tôt pour recharger sans précipitation, assez tard pour
 * ne pas crier au loup en permanence.
 */
const SEUIL_BAS = 2;

type Props = {
  /** null quand la vérification par SMS n'est pas configurée du tout. */
  solde: { balance: number; currency: string } | null;
  /** Message d'échec quand Infobip n'a pas répondu — une alerte en soi. */
  erreur: string | null;
  /** Profils portant un numéro que personne n'a confirmé. */
  numerosNonVerifies: number;
};

/**
 * Rend visible une panne qui ne se voit pas autrement.
 *
 * Quand le crédit s'épuise, l'envoi échoue, la personne prend l'échappatoire
 * et entre quand même : rien ne casse, mais plus aucun numéro n'est vérifié.
 * Comme le numéro est le seul canal par lequel un employeur joint une
 * candidate, le défaut ne se découvre qu'au premier appel qui n'aboutit pas —
 * des semaines plus tard, chez quelqu'un qui n'en dira rien.
 */
export function SmsCredit({ solde, erreur, numerosNonVerifies }: Props) {
  const bas = solde !== null && solde.balance < SEUIL_BAS;
  const alerte = erreur !== null || bas;

  return (
    <div
      className={`rounded-2xl border p-5 ${
        alerte ? "border-secondary/50 bg-secondary/5" : "border-border bg-card"
      }`}
    >
      <div className="flex items-start gap-3">
        {alerte ? (
          <AlertTriangle className="h-5 w-5 text-secondary shrink-0 mt-0.5" aria-hidden />
        ) : (
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" aria-hidden />
        )}

        <div className="min-w-0">
          <h2 className="font-semibold mb-1">Vérification par SMS</h2>

          {solde === null && erreur === null && (
            <p className="text-sm text-muted-foreground">
              Non configurée. Les numéros ne sont donc pas vérifiés, et aucune inscription
              n&apos;est arrêtée pour autant.
            </p>
          )}

          {erreur && (
            <p className="text-sm text-muted-foreground">
              Solde illisible : {erreur} Tant que cela dure, aucun code ne part et chacun
              entre par « continuer sans vérifier ».
            </p>
          )}

          {solde && (
            <p className="text-sm text-muted-foreground">
              Crédit Infobip :{" "}
              <strong className="text-foreground tabular-nums">
                {solde.balance.toFixed(2)} {solde.currency}
              </strong>
              {bas ? (
                <> — bientôt épuisé. À zéro, plus aucun numéro n&apos;est vérifié et rien ne
                  le signale. Le compte est partagé avec un autre projet.</>
              ) : (
                <>. Compte partagé avec un autre projet, donc à surveiller.</>
              )}
            </p>
          )}

          {numerosNonVerifies > 0 && (
            <p className="text-sm text-muted-foreground mt-2 flex items-start gap-2">
              <MessageSquareWarning className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
              <span>
                <strong className="text-foreground tabular-nums">{numerosNonVerifies}</strong>{" "}
                {numerosNonVerifies === 1 ? "profil porte" : "profils portent"} un numéro que
                personne n&apos;a confirmé.
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
