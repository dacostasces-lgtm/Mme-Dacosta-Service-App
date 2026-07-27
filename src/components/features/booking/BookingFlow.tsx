"use client";
import { useActionState, useState } from "react";
import { CreditCard, Calendar, Clock, MapPin, CheckCircle2, Loader2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/routing";
import { createBooking, type BookingState } from "@/lib/bookings/actions";
import { formatFee } from "@/lib/bookings/constants";

const FEE_LABEL = formatFee();

export function BookingFlow({
  candidateId,
  candidateName,
}: {
  candidateId: string;
  candidateName: string;
}) {
  const action = createBooking.bind(null, candidateId);
  const [state, formAction, pending] = useActionState<BookingState, FormData>(action, {});
  const [step, setStep] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState("");

  // The server decides when the booking exists; the final step is driven by its
  // answer, never by the click that submitted the form.
  const done = Boolean(state.bookingId);
  const currentStep = done ? 3 : step;

  return (
    <div className="min-h-screen bg-background py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">

        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Réserver ce profil</h1>
          <p className="text-muted-foreground">
            Vous réservez <span className="font-medium text-foreground">{candidateName}</span>.
          </p>
        </div>

        {/* Progress Tracker */}
        <div className="flex items-center justify-between mb-12 relative">
          <div className="absolute top-1/2 left-0 w-full h-1 bg-border -z-10 -translate-y-1/2 rounded-full"></div>
          <div
            className="absolute top-1/2 left-0 h-1 bg-primary -z-10 -translate-y-1/2 rounded-full transition-all duration-300"
            style={{ width: currentStep === 1 ? "0%" : currentStep === 2 ? "50%" : "100%" }}
          ></div>

          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-10 w-10 rounded-full flex items-center justify-center font-bold border-4 border-background transition-colors ${
                currentStep >= s ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground"
              }`}
            >
              {s}
            </div>
          ))}
        </div>

        <div className="bg-card border border-border shadow-sm rounded-3xl p-8">
          {done ? (
            <div className="text-center py-8">
              <div className="h-24 w-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="h-12 w-12" />
              </div>
              <h2 className="text-3xl font-bold mb-4">Demande enregistrée</h2>
              <p className="text-muted-foreground mb-2 max-w-md mx-auto">
                Votre demande de réservation pour {candidateName} est enregistrée sous la référence{" "}
                <span className="font-mono text-foreground">{state.bookingId?.slice(0, 8)}</span>.
              </p>
              {/* No payment provider is connected yet, so the screen says so
                  rather than announcing a transaction that never happened. */}
              <div className="bg-surface border border-border rounded-2xl p-4 text-sm text-muted-foreground max-w-md mx-auto mb-8 flex gap-3 text-left">
                <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <p>
                  Le paiement de {FEE_LABEL} reste à effectuer : notre équipe vous contacte pour le
                  finaliser et vous mettre en relation. Aucun montant n&apos;a été débité.
                </p>
              </div>

              <div className="flex justify-center gap-4">
                <Link
                  href="/dashboard/employer"
                  className="inline-flex items-center justify-center h-11 px-8 rounded-full bg-primary text-primary-foreground font-medium hover:bg-primary/80 transition-colors"
                >
                  Voir mon tableau de bord
                </Link>
              </div>
            </div>
          ) : (
            <form action={formAction}>
              {/* Step 1 stays mounted while step 2 shows, so its values are still
                  submitted with the form. */}
              <div className={step === 1 ? "space-y-6" : "hidden"}>
                <h2 className="text-xl font-bold mb-4">Détails de la mission</h2>

                <div>
                  <label htmlFor="contractType" className="text-sm font-medium mb-2 block">
                    Type de contrat
                  </label>
                  <select
                    id="contractType"
                    name="contractType"
                    defaultValue="full_time"
                    className="w-full h-12 rounded-lg border border-input bg-background px-4"
                  >
                    <option value="full_time">Temps Plein</option>
                    <option value="part_time">Temps Partiel</option>
                    <option value="one_off">Mission ponctuelle</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="startDate" className="text-sm font-medium mb-2 block">
                      Date de début
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input id="startDate" name="startDate" type="date" className="pl-10 h-12" />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="schedule" className="text-sm font-medium mb-2 block">
                      Horaires souhaités
                    </label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input id="schedule" name="schedule" placeholder="Ex: 08:00 - 18:00" className="pl-10 h-12" />
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="address" className="text-sm font-medium mb-2 block">
                    Lieu de la mission
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="address"
                      name="address"
                      required
                      placeholder="Adresse complète"
                      className="pl-10 h-12"
                      defaultValue="Bacongo, Brazzaville"
                    />
                  </div>
                </div>

                <div className="pt-6 border-t border-border mt-8 flex justify-end">
                  <Button type="button" size="lg" onClick={() => setStep(2)}>
                    Continuer vers le paiement
                  </Button>
                </div>
              </div>

              <div className={step === 2 ? "space-y-6" : "hidden"}>
                <h2 className="text-xl font-bold mb-4">Paiement</h2>

                <div className="bg-surface p-6 rounded-2xl mb-8">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-muted-foreground">Frais de mise en relation</span>
                    <span className="font-bold">{FEE_LABEL}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-muted-foreground">
                    <span>Garantie de remplacement incluse (30 jours)</span>
                  </div>
                </div>

                <fieldset className="space-y-4">
                  <legend className="text-sm font-medium mb-2">Moyen de paiement souhaité</legend>

                  <label
                    className={`block p-4 border rounded-xl cursor-pointer transition-all ${
                      paymentMethod === "mobile_money"
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="mobile_money"
                      className="sr-only"
                      checked={paymentMethod === "mobile_money"}
                      onChange={() => setPaymentMethod("mobile_money")}
                    />
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center">
                        <span className="font-bold text-xs">MM</span>
                      </div>
                      <div>
                        <p className="font-bold">Mobile Money</p>
                        <p className="text-xs text-muted-foreground">MTN MoMo, Airtel Money</p>
                      </div>
                    </div>
                  </label>

                  <label
                    className={`block p-4 border rounded-xl cursor-pointer transition-all ${
                      paymentMethod === "card"
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="card"
                      className="sr-only"
                      checked={paymentMethod === "card"}
                      onChange={() => setPaymentMethod("card")}
                    />
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                        <CreditCard className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-bold">Carte Bancaire</p>
                        <p className="text-xs text-muted-foreground">Visa, Mastercard</p>
                      </div>
                    </div>
                  </label>
                </fieldset>

                <p className="text-xs text-muted-foreground">
                  Le paiement en ligne n&apos;est pas encore actif. Votre demande est enregistrée et
                  notre équipe vous contacte pour finaliser le règlement.
                </p>

                {state.error && (
                  <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">{state.error}</p>
                )}

                <div className="pt-6 border-t border-border flex justify-between mt-8">
                  <Button type="button" variant="ghost" onClick={() => setStep(1)} disabled={pending}>
                    Retour
                  </Button>
                  <Button type="submit" size="lg" disabled={!paymentMethod || pending}>
                    {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {pending ? "Enregistrement..." : "Enregistrer ma demande"}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
