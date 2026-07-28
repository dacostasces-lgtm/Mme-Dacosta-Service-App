"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/routing";
import { Camera, FileText, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { setAvatar, setCv } from "@/lib/profile/files";

const AVATAR_MAX = 2 * 1024 * 1024;
const CV_MAX = 5 * 1024 * 1024;

const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];
const CV_TYPES = ["application/pdf", "image/jpeg", "image/png"];

type Props = {
  userId: string;
  isCandidate: boolean;
  avatarUrl: string | null;
  fullName: string;
  hasCv: boolean;
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function FileUploads({ userId, isCandidate, avatarUrl, fullName, hasCv }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"avatar" | "cv" | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<"avatar" | "cv" | null>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const cvInput = useRef<HTMLInputElement>(null);

  // Local preview so the new photo appears immediately: revalidatePath refreshes
  // the server components, but the CDN can still serve the previous image.
  const [preview, setPreview] = useState<string | null>(null);

  async function upload(
    file: File,
    kind: "avatar" | "cv",
    bucket: string,
    accepted: string[],
    maxBytes: number
  ) {
    setError("");
    setDone(null);

    if (!accepted.includes(file.type)) {
      setError(
        kind === "avatar"
          ? "Format non accepté. Utilisez une photo JPG, PNG ou WEBP."
          : "Format non accepté. Envoyez un PDF ou une photo du document."
      );
      return;
    }
    if (file.size > maxBytes) {
      setError(
        `Fichier trop lourd (${(file.size / 1024 / 1024).toFixed(1)} Mo). Maximum ${
          maxBytes / 1024 / 1024
        } Mo.`
      );
      return;
    }

    setBusy(kind);

    // Stable name per user and bucket, so replacing overwrites rather than
    // piling up files nobody will ever clean out.
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "bin";
    const path = `${userId}/${kind}.${extension}`;

    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      setBusy(null);
      setError(
        uploadError.message.includes("Bucket not found")
          ? "Le stockage n'est pas encore configuré sur cette base (migration 20260728030000)."
          : `Envoi impossible : ${uploadError.message}`
      );
      return;
    }

    if (kind === "avatar") setPreview(URL.createObjectURL(file));

    startTransition(async () => {
      const result = kind === "avatar" ? await setAvatar(path) : await setCv(path);
      setBusy(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDone(kind);
      router.refresh();
    });
  }

  const shown = preview ?? avatarUrl;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-5">
        <span className="h-24 w-24 rounded-2xl overflow-hidden shrink-0 grid place-items-center bg-gradient-to-br from-primary to-primary/70 text-primary-foreground font-display text-3xl font-bold">
          {shown ? (
            // Supabase storage host varies with the environment, so this stays
            // a plain <img> like the rest of the app's avatars.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="" className="h-full w-full object-cover" />
          ) : (
            initials(fullName)
          )}
        </span>

        <div>
          <p className="font-medium mb-1">Photo de profil</p>
          <p className="text-sm text-muted-foreground mb-3">
            {isCandidate
              ? "Un visage rassure. Les fiches avec photo sont bien plus consultées."
              : "Facultatif."}{" "}
            JPG, PNG ou WEBP, 2 Mo maximum.
          </p>
          <input
            ref={avatarInput}
            type="file"
            accept={AVATAR_TYPES.join(",")}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) upload(file, "avatar", "avatars", AVATAR_TYPES, AVATAR_MAX);
              event.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="rounded-full gap-2"
            disabled={busy !== null || pending}
            onClick={() => avatarInput.current?.click()}
          >
            {busy === "avatar" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
            {shown ? "Changer la photo" : "Ajouter une photo"}
          </Button>
        </div>
      </div>

      {isCandidate && (
        <div className="border-t border-border pt-6">
          <p className="font-medium mb-1 flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Curriculum vitæ
          </p>
          <p className="text-sm text-muted-foreground mb-3">
            PDF ou photo du document, 5 Mo maximum. Il reste privé : seule notre équipe y accède
            pour vérifier votre dossier.
          </p>
          <input
            ref={cvInput}
            type="file"
            accept={CV_TYPES.join(",")}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) upload(file, "cv", "cvs", CV_TYPES, CV_MAX);
              event.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="rounded-full gap-2"
            disabled={busy !== null || pending}
            onClick={() => cvInput.current?.click()}
          >
            {busy === "cv" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            {hasCv ? "Remplacer mon CV" : "Envoyer mon CV"}
          </Button>
          {hasCv && !done && (
            <p className="text-xs text-muted-foreground mt-2">Un CV est déjà enregistré.</p>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">{error}</p>
      )}
      {done && !error && (
        <p className="text-sm text-green-700 dark:text-green-400 bg-green-500/10 rounded-lg p-3 flex items-center gap-2">
          <Check className="h-4 w-4 shrink-0" />
          {done === "avatar" ? "Photo enregistrée." : "CV enregistré."}
        </p>
      )}
    </div>
  );
}
