"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, FileText, Globe2, Loader2, Send, Upload } from "lucide-react";
import { Link, useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { compresserImage } from "@/lib/images/compresser";
import { submitWithoutReset } from "@/lib/forms";
import { setCv } from "@/lib/profile/files";
import { CV_CHOISIR, CV_MAX, CV_TYPES } from "@/lib/candidates/cv";
import { REFERENCES_COUNT } from "@/lib/jobs/international";
import { applyToInternationalJob, type ApplicationState } from "@/lib/applications/actions";
import type { CandidateBlock } from "@/lib/profile/completeness";

/**
 * Postuler à une offre à l'international : le CV du profil (déposé ici s'il
 * manque, et gardé pour la suite) et deux références — des personnes à joindre,
 * avec leur téléphone et leur e-mail. Seule l'administration les lit.
 */
export function InternationalApplyForm({
  jobId,
  userId,
  hasCv,
  alreadyApplied = false,
  blocked = null,
}: {
  jobId: string;
  /** Le compte du candidat : son CV va dans son dossier du seau `cvs`. */
  userId: string;
  hasCv: boolean;
  alreadyApplied?: boolean;
  blocked?: CandidateBlock | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ApplicationState, FormData>(
    applyToInternationalJob,
    {}
  );
  const [cvReady, setCvReady] = useState(hasCv);
  const [cvBusy, setCvBusy] = useState(false);
  const [cvError, setCvError] = useState("");
  const cvInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  async function uploadCv(file: File) {
    setCvError("");
    setCvBusy(true);
    // Une photo de téléphone dépasse vite le plafond, et un iPhone la rend en
    // HEIC : réduite et réencodée ici, elle passe.
    const fichier = await compresserImage(file, CV_MAX);
    if (!CV_TYPES.includes(fichier.type)) {
      setCvBusy(false);
      setCvError("Format non accepté. Envoyez un PDF ou une photo du document.");
      return;
    }
    if (fichier.size > CV_MAX) {
      setCvBusy(false);
      setCvError(
        `Fichier trop lourd (${(fichier.size / 1024 / 1024).toFixed(1)} Mo). Maximum ${CV_MAX / 1024 / 1024} Mo.`
      );
      return;
    }
    // Même nom que depuis le profil : le remplacer écrase l'ancien.
    const extension = fichier.name.split(".").pop()?.toLowerCase() ?? "bin";
    const path = `${userId}/cv.${extension}`;
    const { error } = await createClient()
      .storage.from("cvs")
      .upload(path, fichier, { upsert: true, contentType: fichier.type });
    if (error) {
      setCvBusy(false);
      setCvError(`Envoi impossible : ${error.message}`);
      return;
    }
    const saved = await setCv(path);
    setCvBusy(false);
    if (saved.error) {
      setCvError(saved.error);
      return;
    }
    setCvReady(true);
  }

  if (state.ok) {
    return (
      <p
        role="status"
        className="mt-5 text-sm font-medium text-green-700 dark:text-green-400 bg-green-500/10 rounded-lg p-3 flex items-center gap-2"
      >
        <Check className="h-4 w-4 shrink-0" />
        Candidature envoyée. Notre équipe étudie votre dossier et vous recontacte.
      </p>
    );
  }

  if (alreadyApplied) {
    return (
      <p className="mt-5 text-sm font-medium text-muted-foreground flex items-center gap-2">
        <Check className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
        Vous avez déjà postulé à cette offre.
      </p>
    );
  }

  if (blocked) {
    return (
      <p className="mt-5 text-sm text-muted-foreground bg-muted rounded-lg p-3">
        {blocked.message}
        {blocked.reason === "incomplete" && (
          <>
            {" "}
            <Link href="/profil" className="font-semibold text-primary underline">
              Compléter mon profil
            </Link>
          </>
        )}
      </p>
    );
  }

  if (!open) {
    return (
      <Button type="button" className="rounded-full gap-2 mt-5" onClick={() => setOpen(true)}>
        <Globe2 className="h-4 w-4" />
        Postuler avec mon CV et mes références
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      onSubmit={submitWithoutReset(formAction)}
      className="mt-5 space-y-5 rounded-2xl border border-border p-4 sm:p-5"
    >
      <input type="hidden" name="jobId" value={jobId} />

      <section>
        <h3 className="font-semibold flex items-center gap-2 mb-1">
          <FileText className="h-4 w-4 text-primary" aria-hidden />
          Votre CV
        </h3>
        <input
          ref={cvInput}
          type="file"
          accept={CV_CHOISIR}
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) uploadCv(file);
            event.target.value = "";
          }}
        />
        {cvReady ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1 text-sm text-green-700 dark:text-green-400">
              <Check className="h-4 w-4" />
              Votre CV est joint : celui de votre profil.
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-full"
              disabled={cvBusy}
              onClick={() => cvInput.current?.click()}
            >
              {cvBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Changer de CV"}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Obligatoire pour une offre à l&apos;international. Un PDF ou une photo, 5 Mo maximum.
              Il sera aussi gardé dans votre profil.
            </p>
            <Button
              type="button"
              variant="outline"
              className="rounded-full gap-2"
              disabled={cvBusy}
              onClick={() => cvInput.current?.click()}
            >
              {cvBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Ajouter mon CV
            </Button>
          </div>
        )}
        {cvError && <p className="text-sm text-destructive mt-2">{cvError}</p>}
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="font-semibold">Deux références</h3>
          <p className="text-xs text-muted-foreground">
            Des personnes qui vous connaissent et que notre équipe peut appeler : une ancienne
            employeuse, un pasteur, un chef d&apos;équipe… Elles ne sont communiquées à personne
            d&apos;autre.
          </p>
        </div>
        {Array.from({ length: REFERENCES_COUNT }, (_, index) => index + 1).map((position) => (
          <fieldset key={position} className="space-y-3 rounded-xl bg-muted/40 p-3">
            <legend className="text-sm font-medium px-1">Référence {position}</legend>
            <div>
              <label htmlFor={`ref${position}-name`} className="text-xs font-medium mb-1 block">
                Nom complet
              </label>
              <Input
                id={`ref${position}-name`}
                name={`ref${position}_name`}
                required
                minLength={2}
                maxLength={120}
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor={`ref${position}-relation`} className="text-xs font-medium mb-1 block">
                Qui est-ce pour vous ?
              </label>
              <Input
                id={`ref${position}-relation`}
                name={`ref${position}_relation`}
                required
                minLength={2}
                maxLength={120}
                placeholder="Ancienne employeuse, pasteur…"
                autoComplete="off"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor={`ref${position}-phone`} className="text-xs font-medium mb-1 block">
                  Téléphone
                </label>
                <Input
                  id={`ref${position}-phone`}
                  name={`ref${position}_phone`}
                  type="tel"
                  inputMode="tel"
                  required
                  maxLength={32}
                  placeholder="06 717 30 30 ou +33 6…"
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor={`ref${position}-email`} className="text-xs font-medium mb-1 block">
                  E-mail
                </label>
                <Input
                  id={`ref${position}-email`}
                  name={`ref${position}_email`}
                  type="email"
                  required
                  maxLength={254}
                  placeholder="nom@exemple.com"
                  autoComplete="off"
                />
              </div>
            </div>
          </fieldset>
        ))}
      </section>

      <div>
        <label htmlFor={`message-${jobId}`} className="text-sm font-medium block mb-1">
          Votre message <span className="text-muted-foreground font-normal">(facultatif)</span>
        </label>
        <textarea
          id={`message-${jobId}`}
          name="message"
          rows={3}
          maxLength={1000}
          placeholder="Votre expérience, vos disponibilités pour partir…"
          className="w-full rounded-lg border border-input bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {state.error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">
          {state.error}
          {state.incompleteProfile && (
            <>
              {" "}
              <Link href="/profil" className="font-semibold underline">
                Compléter mon profil
              </Link>
            </>
          )}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="rounded-full gap-2" disabled={pending || cvBusy || !cvReady}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {pending ? "Envoi..." : "Envoyer ma candidature"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="rounded-full"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          Annuler
        </Button>
      </div>
      {!cvReady && (
        <p className="text-xs text-muted-foreground">Ajoutez votre CV pour pouvoir envoyer.</p>
      )}
    </form>
  );
}
