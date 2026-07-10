"use client";
import { useState } from "react";
import { CreditCard, Calendar, Clock, MapPin, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function BookingPage({ params }: { params: { id: string } }) {
  const [step, setStep] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState("");

  return (
    <div className="min-h-screen bg-background py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Réserver ce profil</h1>
          <p className="text-muted-foreground">Sécurisez votre recrutement en quelques étapes simples.</p>
        </div>

        {/* Progress Tracker */}
        <div className="flex items-center justify-between mb-12 relative">
          <div className="absolute top-1/2 left-0 w-full h-1 bg-border -z-10 -translate-y-1/2 rounded-full"></div>
          <div className="absolute top-1/2 left-0 h-1 bg-primary -z-10 -translate-y-1/2 rounded-full transition-all duration-300" style={{ width: step === 1 ? '0%' : step === 2 ? '50%' : '100%' }}></div>
          
          {[1, 2, 3].map((s) => (
            <div key={s} className={`h-10 w-10 rounded-full flex items-center justify-center font-bold border-4 border-background transition-colors ${step >= s ? 'bg-primary text-primary-foreground' : 'bg-surface text-muted-foreground'}`}>
              {s}
            </div>
          ))}
        </div>

        <div className="bg-card border border-border shadow-sm rounded-3xl p-8">
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold mb-4">Détails de la mission</h2>
              
              <div>
                <label className="text-sm font-medium mb-2 block">Type de contrat</label>
                <select className="w-full h-12 rounded-lg border border-input bg-background px-4">
                  <option>Temps Plein</option>
                  <option>Temps Partiel</option>
                  <option>Mission ponctuelle</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Date de début</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input type="date" className="pl-10 h-12" />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Horaires souhaités</label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Ex: 08:00 - 18:00" className="pl-10 h-12" />
                  </div>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-2 block">Lieu de la mission</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Adresse complète" className="pl-10 h-12" defaultValue="Cocody Angré, Abidjan" />
                </div>
              </div>

              <div className="pt-6 border-t border-border mt-8 flex justify-end">
                <Button size="lg" onClick={() => setStep(2)}>Continuer vers le paiement</Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold mb-4">Paiement Sécurisé</h2>
              
              <div className="bg-surface p-6 rounded-2xl mb-8">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-muted-foreground">Frais de mise en relation</span>
                  <span className="font-bold">15 000 FCFA</span>
                </div>
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <span>Garantie de remplacement incluse (30 jours)</span>
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-sm font-medium mb-2 block">Méthode de paiement</label>
                
                <div 
                  className={`p-4 border rounded-xl cursor-pointer transition-all ${paymentMethod === 'mobile' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/50'}`}
                  onClick={() => setPaymentMethod('mobile')}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center">
                      <span className="font-bold text-xs">MM</span>
                    </div>
                    <div>
                      <p className="font-bold">Mobile Money</p>
                      <p className="text-xs text-muted-foreground">Wave, Orange, MTN, Moov</p>
                    </div>
                  </div>
                </div>

                <div 
                  className={`p-4 border rounded-xl cursor-pointer transition-all ${paymentMethod === 'card' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/50'}`}
                  onClick={() => setPaymentMethod('card')}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-bold">Carte Bancaire</p>
                      <p className="text-xs text-muted-foreground">Visa, Mastercard</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-border flex justify-between mt-8">
                <Button variant="ghost" onClick={() => setStep(1)}>Retour</Button>
                <Button size="lg" disabled={!paymentMethod} onClick={() => setStep(3)}>
                  Confirmer le paiement
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="text-center py-8">
              <div className="h-24 w-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="h-12 w-12" />
              </div>
              <h2 className="text-3xl font-bold mb-4">Réservation Confirmée !</h2>
              <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                Votre paiement a été traité avec succès. Le candidat a été notifié et vous contactera dans les plus brefs délais.
              </p>
              
              <div className="flex justify-center gap-4">
                <Button size="lg" onClick={() => window.location.href = '/dashboard/employer'}>
                  Voir mon tableau de bord
                </Button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
