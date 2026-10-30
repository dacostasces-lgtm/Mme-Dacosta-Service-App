"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/routing";
import { Check, IdCard, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { compresserImage } from "@/lib/images/compresser";
import { setDocument, setIdentityType } from "@/lib/profile/documents";
import {
  DOCUMENT_KINDS,
  DOCUMENT_MAX,
  DOCUMENT_TYPES,
  DOCUMENTS_CHOISIR,
  DOCUMENTS_BUCKET,
  IDENTITY_TYPES,
  documentHref,
  needsBackSide,
  needsDrivingLicense,
  type DocumentKind,
  type DocumentsRow,
} from "@/lib/candidates/documents";

const SELECT =
  "w-full h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type Save = { error?: string; ok?: boolean };

type Props = {
  /** Le compte du candidat : ses pièces vont dans son dossier du seau. */
  userId: string;
  profileId: string;
  documents: DocumentsRow | null;
  /** Le métier enregistré : un chauffeur doit aussi envoyer son permis. */
  jobTitle: string | null;
  /** « admin » : la modération dépose les pièces d'un candidat qu'elle saisit
   *  (NewCandidateForm), avec ses propres actions et un autre texte. */
  audience?: "candidate" | "admin";
  saveDocument?: (kind: DocumentKind, path: string) => Promise<Save>;
  saveType?: (identityType: string) => Promise<Save>;
};

/**
 * Pièce d'identité (recto et verso, une page pour un passeport) et permis de
 * conduire pour les chauffeurs.
 *
 * Même chemin que la photo et le CV (FileUploads) : le fichier part du
 * navigateur vers le seau privé `pieces`, sous le dossier du candidat, puis
 * le serveur retient son chemin. Rien ne se montre aux familles.
 */
export function IdentityDocuments({
  userId,
  profileId,
  documents,
  jobTitle,
  audience = "candidate",
  saveDocument = setDocument,
  saveType = setIdentityType,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<DocumentKind | "type" | null>(null);
  const [error, setError] = useState("");
  // Le choix s'affiche tout de suite ; l'enregistrement suit.
  const [identityType, setType] = useState(documents?.identity_type ?? "");
  // Envoyées pendant cette visite : la page du formulaire d'ajout ne se
  // recharge pas, et l'état « envoyé » ne doit pas attendre le serveur.
  const [sentNow, setSentNow] = useState<Partial<Record<DocumentKind, boolean>>>({});
  const inputs = {
    identity_front: useRef<HTMLInputElement>(null),
    identity_back: useRef<HTMLInputElement>(null),
    driving_license: useRef<HTMLInputElement>(null),
  };

  const passport = identityType === "passeport";
  const licenseNeeded = needsDrivingLicense(jobTitle);

  function chooseType(value: string) {
    setType(value);
    setError("");
    setBusy("type");
    startTransition(async () => {
      const result = await saveType(value);
      setBusy(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  async function upload(file: File, kind: DocumentKind) {
    setError("");

    // Réduite d'abord : une carte d'identité photographiée au téléphone pèse
    // plusieurs méga-octets, et un iPhone la rend volontiers en HEIC, que le
    // seau refuse. Le canevas la réencode en JPEG de 2000 pixels de côté —
    // assez pour qu'elle reste lisible à la modération. Les deux contrôles
    // ci-dessous restent en dernier filet.
    setBusy(kind);
    const fichier = await compresserImage(file, DOCUMENT_MAX);
    setBusy(null);

    if (!DOCUMENT_TYPES.includes(fichier.type)) {
      setError("Format non accepté. Envoyez une photo (JPG, PNG, WEBP) ou un PDF.");
      return;
    }
    if (fichier.size > DOCUMENT_MAX) {
      setError(
        `Fichier trop lourd (${(fichier.size / 1024 / 1024).toFixed(1)} Mo). Maximum ${
          DOCUMENT_MAX / 1024 / 1024
        } Mo.`
      );
      return;
    }

    setBusy(kind);
    // Un nom stable par pièce : la remplacer écrase l'ancienne.
    const extension = fichier.name.split(".").pop()?.toLowerCase().slice(0, 5) || "jpg";
    const path = `${userId}/${DOCUMENT_KINDS[kind].file}.${extension}`;

    const { error: uploadError } = await createClient()
      .storage.from(DOCUMENTS_BUCKET)
      .upload(path, fichier, { upsert: true, contentType: fichier.type });

    if (uploadError) {
      setBusy(null);
      setError(
        uploadError.message.includes("Bucket not found")
          ? "L'envoi des pièces n'est pas encore activé sur cette base (migration 20261028100000)."
          : `Envoi impossible : ${uploadError.message}`
      );
      return;
    }

    startTransition(async () => {
      const result = await saveDocument(kind, path);
      setBusy(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSentNow((current) => ({ ...current, [kind]: true }));
      router.refresh();
    });
  }

  function slot(kind: DocumentKind, label: string, hint?: string) {
    const sent = Boolean(documents?.[kind]) || Boolean(sentNow[kind]);
    return (
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputs[kind]}
          type="file"
          accept={DOCUMENTS_CHOISIR}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) upload(file, kind);
            event.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          className="rounded-full gap-2"
          // Le type d'abord : il dit s'il faut un verso.
          disabled={busy !== null || pending || (kind !== "driving_license" && !identityType)}
          onClick={() => inputs[kind].current?.click()}
        >
          {busy === kind ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {sent ? `Remplacer ${label}` : `Envoyer ${label}`}
        </Button>
        {sent && (
          <span className="flex items-center gap-1 text-sm text-green-700 dark:text-green-400">
            <Check className="h-4 w-4" />
            Envoyé ·{" "}
            <a
              href={documentHref(profileId, kind)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              voir
            </a>
          </span>
        )}
        {hint && <p className="basis-full text-xs text-muted-foreground">{hint}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="font-medium mb-1 flex items-center gap-2">
          <IdCard className="h-4 w-4 text-primary" />
          Pièce d&apos;identité
        </p>
        <p className="text-sm text-muted-foreground">
          {audience === "admin"
            ? "Facultatif ici, mais le candidat devra les fournir s'il se connecte. Visibles seulement de l'administration. Photo ou PDF, 10 Mo maximum."
            : "Obligatoire. Notre équipe vérifie votre identité avant de publier votre profil. Visible seulement de notre équipe, jamais des familles. Photo ou PDF, 10 Mo maximum."}
        </p>
      </div>

      <div>
        <label htmlFor="identityType" className="text-sm font-medium mb-1 block">
          Type de pièce d&apos;identité
        </label>
        <select
          id="identityType"
          className={SELECT}
          value={identityType}
          disabled={busy === "type"}
          onChange={(event) => chooseType(event.target.value)}
        >
          <option value="" disabled>
            Choisir
          </option>
          {IDENTITY_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>

      {passport
        ? slot("identity_front", "la page du passeport", "La page avec la photo.")
        : slot("identity_front", "le recto", "Le côté avec la photo.")}
      {needsBackSide(identityType) && slot("identity_back", "le verso", "L'autre côté de la carte.")}

      <div className="border-t border-border pt-5">
        <p className="font-medium mb-1">Permis de conduire</p>
        <p className="text-sm text-muted-foreground mb-3">
          {licenseNeeded
            ? "Obligatoire pour les chauffeurs."
            : audience === "admin"
              ? "Seulement pour un chauffeur."
              : "Seulement si vous êtes chauffeur."}
        </p>
        {slot("driving_license", "le permis")}
      </div>

      {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">{error}</p>}
    </div>
  );
}
