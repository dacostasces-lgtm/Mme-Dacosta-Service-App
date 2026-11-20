"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BriefcaseBusiness, Check, IdCard, Loader2, MapPin, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { Link, useRouter } from "@/i18n/routing";
import { normalisePhone, PHONE_HINT } from "@/lib/phone";
import type { CityRef } from "@/lib/geo/locations";
import { GoogleButton } from "@/components/features/auth/GoogleButton";
import { CandidateFields, Field, SELECT } from "@/components/features/profile/CandidateFields";
import { registerAccount, sendSignupCode } from "@/lib/auth/register";
import { setDocument } from "@/lib/profile/documents";
import { compresserImage } from "@/lib/images/compresser";
import {
  DOCUMENT_KINDS,
  DOCUMENT_MAX,
  DOCUMENT_TYPES,
  DOCUMENTS_BUCKET,
  DOCUMENTS_CHOISIR,
  IDENTITY_TYPES,
  needsBackSide,
  needsDrivingLicense,
  type DocumentKind,
} from "@/lib/candidates/documents";

type Role = "candidate" | "employer";
type Step = "form" | "code" | "nocode";

/** Ce qui s'affiche dans « Il manque encore » pour une case sans étiquette. */
function labelOf(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  return (
    element.labels?.[0]?.textContent?.trim() ||
    element.getAttribute("aria-label") ||
    element.closest("fieldset")?.querySelector("legend")?.textContent?.trim() ||
    element.name
  );
}

/**
 * L'inscription, en une seule fois.
 *
 * Toutes les cases d'abord — pour un candidat, le profil entier et sa pièce
 * d'identité ; pour un employeur, le nom, le numéro et le quartier. Le bouton
 * « Créer mon compte » reste grisé tant qu'il en manque une, et dit laquelle.
 * Ensuite seulement le code par SMS, puis le compte.
 *
 * Avant, le compte se créait avec un nom et un mot de passe, et le reste était
 * à compléter plus tard : la modération recevait des inscriptions vides, sans
 * métier ni pièce, parfois sans numéro.
 */
export function RegisterForm({ cities }: { cities: CityRef[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const [role, setRole] = useState<Role | null>(null);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  // Brazzaville d'abord : la ville du lancement, et l'essentiel du trafic.
  const [cityId, setCityId] = useState(cities[0]?.id ?? "");
  const [neighborhoodId, setNeighborhoodId] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsMessage, setGpsMessage] = useState("");

  const [jobTitle, setJobTitle] = useState("");
  const [identityType, setIdentityType] = useState("");
  const [files, setFiles] = useState<Partial<Record<DocumentKind, File>>>({});
  const [preparing, setPreparing] = useState<DocumentKind | null>(null);
  const [fileError, setFileError] = useState("");

  const [missing, setMissing] = useState<string[]>([]);
  const [step, setStep] = useState<Step>("form");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"sending" | "creating" | "uploading" | null>(null);
  const [error, setError] = useState("");
  /** Compte créé, mais une pièce n'est pas partie : elle se renvoie du profil. */
  const [createdWithWarning, setCreatedWithWarning] = useState("");

  const selectedCity = cities.find((city) => city.id === cityId) ?? cities[0];
  const phoneParsed = normalisePhone(phone);
  const isCandidate = role === "candidate";
  const passport = identityType === "passeport";
  const licenseNeeded = needsDrivingLicense(jobTitle);

  // Le numéro est vérifié en tapant : un numéro mal formé grise le bouton
  // comme une case vide, et l'étiquette dit pourquoi.
  const phoneInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    phoneInput.current?.setCustomValidity(
      phone.trim() === "" || phoneParsed.ok ? "" : phoneParsed.reason
    );
  }, [phone, phoneParsed]);

  // Même chose pour le mot de passe : `minLength` ne se juge qu'après une
  // frappe au clavier, pas après un remplissage automatique.
  const passwordInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    passwordInput.current?.setCustomValidity(
      password !== "" && password.length < 8 ? "Au moins 8 caractères." : ""
    );
  }, [password]);

  /**
   * Relit tout le formulaire et liste ce qui manque. Les cases natives se
   * jugent par le navigateur (`required`, longueur, format) ; les choix par
   * boutons (métier, compétences) portent chacun un champ que leur composant
   * rend invalide tant que rien n'est choisi. Restent les jours et les
   * fichiers, que le navigateur ne sait pas exiger.
   */
  const check = useCallback(() => {
    const form = formRef.current;
    if (!form) return;
    const labels: string[] = [];
    if (!role) labels.push("Votre profil");
    for (const element of Array.from(form.elements)) {
      if (
        !(
          element instanceof HTMLInputElement ||
          element instanceof HTMLSelectElement ||
          element instanceof HTMLTextAreaElement
        )
      ) {
        continue;
      }
      if (element.disabled || element.name === "code") continue;
      if (!element.validity.valid) labels.push(labelOf(element));
    }
    if (role === "candidate") {
      if (!form.querySelector('input[name="workDays"]:checked')) {
        labels.push("Jours où vous êtes disponible");
      }
      if (!files.identity_front) labels.push(passport ? "Page du passeport" : "Pièce d'identité (recto)");
      if (identityType && needsBackSide(identityType) && !files.identity_back) {
        labels.push("Pièce d'identité (verso)");
      }
      if (licenseNeeded && !files.driving_license) labels.push("Permis de conduire");
    }
    const unique = Array.from(new Set(labels));
    setMissing((current) =>
      current.length === unique.length && current.every((label, i) => label === unique[i])
        ? current
        : unique
    );
  }, [role, files, identityType, passport, licenseNeeded]);

  // Après chaque rendu de ce composant, et après chaque geste dans le
  // formulaire : les choix par boutons changent l'état de leurs propres
  // composants, que ce rendu-ci ne voit pas.
  useEffect(() => {
    check();
  });
  const checkSoon = useCallback(() => {
    window.setTimeout(check, 60);
  }, [check]);

  function changePhone(value: string) {
    setPhone(value);
    // Un autre numéro que celui qui a reçu le code : retour au formulaire,
    // le code envoyé ne vaut que pour l'ancien.
    const next = normalisePhone(value);
    if (step !== "form" && (!next.ok || next.value !== sentTo)) {
      setStep("form");
      setCode("");
    }
  }

  const complete = role !== null && missing.length === 0 && preparing === null;

  function requestGPS() {
    setGpsLoading(true);
    setGpsMessage("");
    if (!navigator.geolocation) {
      setGpsMessage("La géolocalisation n'est pas prise en charge par votre navigateur.");
      setGpsLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setCoords({ lat: latitude, lng: longitude });
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
          );
          const data = await res.json();
          const address = data?.address ?? {};
          // Le GPS présélectionne dans la liste, il n'écrit rien : un nom
          // que la liste ne connaît pas laisse le choix à la personne. Les
          // coordonnées sont gardées de toute façon : c'est elles qui servent
          // à la recherche par proximité.
          const cityName = address.city || address.town || address.village || "";
          const matchedCity =
            cities.find((city) => city.name.toLowerCase() === cityName.toLowerCase()) ??
            selectedCity;
          if (matchedCity) {
            setCityId(matchedCity.id);
            const quartierName = (address.suburb || address.neighbourhood || "").toLowerCase();
            const matched = matchedCity.neighborhoods.find((quartier) =>
              quartierName.includes(quartier.name.toLowerCase())
            );
            if (matched) setNeighborhoodId(matched.id);
            else if (quartierName) {
              setGpsMessage(
                "Position enregistrée, mais votre quartier n'a pas été reconnu : choisissez-le dans la liste."
              );
            }
          }
        } catch {
          setGpsMessage("Position enregistrée, mais l'adresse n'a pas pu être lue.");
        } finally {
          setGpsLoading(false);
        }
      },
      () => {
        setGpsMessage("Permission refusée. Choisissez votre ville et votre quartier ci-dessous.");
        setGpsLoading(false);
      }
    );
  }

  async function chooseFile(file: File, kind: DocumentKind) {
    setFileError("");
    // Réduite tout de suite : une carte photographiée au téléphone pèse
    // plusieurs méga-octets, et un iPhone la rend en HEIC, que le seau refuse.
    setPreparing(kind);
    const ready = await compresserImage(file, DOCUMENT_MAX);
    setPreparing(null);
    if (!DOCUMENT_TYPES.includes(ready.type)) {
      setFileError("Format non accepté. Envoyez une photo (JPG, PNG, WEBP) ou un PDF.");
      return;
    }
    if (ready.size > DOCUMENT_MAX) {
      setFileError(
        `Fichier trop lourd (${(ready.size / 1024 / 1024).toFixed(1)} Mo). Maximum ${
          DOCUMENT_MAX / 1024 / 1024
        } Mo.`
      );
      return;
    }
    setFiles((current) => ({ ...current, [kind]: ready }));
  }

  async function sendCode() {
    setError("");
    setBusy("sending");
    const result = await sendSignupCode(phone);
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (phoneParsed.ok) setSentTo(phoneParsed.value);
    setCode("");
    setStep(result.sent ? "code" : "nocode");
  }

  async function createAccount() {
    const form = formRef.current;
    if (!form || !role || !phoneParsed.ok) return;
    setError("");
    setBusy("creating");

    const formData = new FormData(form);
    formData.set("role", role);
    formData.set("code", code);
    const result = await registerAccount(formData);
    if (result.error || !result.ok) {
      setBusy(null);
      setError(result.error ?? "Création du compte impossible.");
      return;
    }

    // Le compte existe : le navigateur ouvre sa session, puis dépose les
    // pièces dans le dossier du candidat, comme depuis le profil.
    const supabase = createClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      phone: `+${phoneParsed.value.replace(/\D/g, "")}`,
      password,
    });
    if (signInError || !data.user) {
      setBusy(null);
      setCreatedWithWarning(
        "Votre compte est créé. Connectez-vous avec votre numéro et votre mot de passe."
      );
      return;
    }

    if (role === "candidate") {
      setBusy("uploading");
      const failed: string[] = [];
      const kinds: DocumentKind[] = ["identity_front"];
      if (needsBackSide(identityType)) kinds.push("identity_back");
      if (files.driving_license) kinds.push("driving_license");
      for (const kind of kinds) {
        const file = files[kind];
        if (!file) continue;
        const extension = file.name.split(".").pop()?.toLowerCase().slice(0, 5) || "jpg";
        const path = `${data.user.id}/${DOCUMENT_KINDS[kind].file}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from(DOCUMENTS_BUCKET)
          .upload(path, file, { upsert: true, contentType: file.type });
        const saved = uploadError ? { error: uploadError.message } : await setDocument(kind, path);
        if (saved.error) failed.push(DOCUMENT_KINDS[kind].label);
      }
      if (failed.length > 0) {
        setBusy(null);
        setCreatedWithWarning(
          `Votre compte est créé, mais ${failed.length > 1 ? "ces pièces n'ont" : "cette pièce n'a"} pas pu être envoyée${failed.length > 1 ? "s" : ""} : ${failed.join(", ")}. Renvoyez-la depuis votre profil.`
        );
        return;
      }
    }

    router.push(result.next ?? "/");
    router.refresh();
  }

  function slot(kind: DocumentKind, label: string, hint: string) {
    const file = files[kind];
    const inputId = `fichier-${kind}`;
    return (
      <div className="flex flex-wrap items-center gap-3">
        <input
          id={inputId}
          type="file"
          accept={DOCUMENTS_CHOISIR}
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            if (chosen) chooseFile(chosen, kind);
            event.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          className="rounded-full gap-2"
          disabled={preparing !== null || busy !== null}
          onClick={() => document.getElementById(inputId)?.click()}
        >
          {preparing === kind ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {file ? `Changer ${label}` : `Choisir ${label}`}
        </Button>
        {file && (
          <span className="flex items-center gap-1 text-sm text-green-700 dark:text-green-400 min-w-0">
            <Check className="h-4 w-4 shrink-0" />
            <span className="truncate max-w-[12rem]">{file.name}</span>
          </span>
        )}
        <p className="basis-full text-xs text-muted-foreground">{hint}</p>
      </div>
    );
  }

  if (createdWithWarning) {
    return (
      <div className="w-full max-w-md mx-auto p-8 bg-card rounded-2xl shadow-xl shadow-primary/5 text-center space-y-4">
        <Check className="h-12 w-12 mx-auto text-primary" />
        <p className="text-sm">{createdWithWarning}</p>
        <Button className="rounded-full" onClick={() => {
          router.push("/profil");
          router.refresh();
        }}>
          Continuer
        </Button>
      </div>
    );
  }

  const busyLabel =
    busy === "sending"
      ? "Envoi du code..."
      : busy === "creating"
        ? "Création du compte..."
        : busy === "uploading"
          ? "Envoi des pièces..."
          : null;

  return (
    <div className="w-full max-w-md mx-auto p-6 sm:p-8 bg-card rounded-2xl shadow-xl shadow-primary/5">
      <h2 className="text-3xl font-bold text-center mb-2 text-primary">Inscription</h2>
      <p className="text-sm text-center text-muted-foreground mb-6">
        Remplissez toutes les cases : le bouton « Créer mon compte » s&apos;active une fois tout
        rempli.
      </p>

      <form
        ref={formRef}
        noValidate
        onInput={checkSoon}
        onChange={checkSoon}
        onClick={checkSoon}
        onSubmit={(event) => {
          event.preventDefault();
          if (!complete || busy) return;
          if (step === "form") sendCode();
          else if (step === "nocode" || /^\d{6}$/.test(code)) createAccount();
        }}
        className="space-y-6"
      >
        <div>
          <p id="choix-profil" className="text-sm font-medium mb-2">
            Vous êtes ici pour…
          </p>
          <div role="group" aria-labelledby="choix-profil" className="grid grid-cols-2 gap-2">
            {(
              [
                ["candidate", "Je cherche un emploi", Search],
                ["employer", "Je recrute", BriefcaseBusiness],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                aria-pressed={role === value}
                onClick={() => setRole(value)}
                className={`flex flex-col items-center gap-1 rounded-2xl border-2 p-3 text-sm font-medium transition-colors ${
                  role === value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {role && (
          <>
            <section className="space-y-4">
              <h3 className="font-semibold">Vos informations</h3>

              <Field label="Nom complet" htmlFor="fullName">
                <Input
                  id="fullName"
                  name="fullName"
                  autoComplete="name"
                  placeholder="Awa Dacosta"
                  required
                  minLength={2}
                  maxLength={120}
                />
              </Field>

              <Field
                label="Téléphone"
                htmlFor="phone"
                hint={`${PHONE_HINT}. Un code vous sera envoyé par SMS pour le vérifier.`}
              >
                <Input
                  ref={phoneInput}
                  id="phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="06 717 30 30"
                  required
                  value={phone}
                  onChange={(event) => changePhone(event.target.value)}
                />
              </Field>
              {phone.trim() !== "" && !phoneParsed.ok && (
                <p className="text-xs text-destructive -mt-2">{phoneParsed.reason}</p>
              )}

              <Field label="Mot de passe" htmlFor="password" hint="Au moins 8 caractères.">
                <Input
                  ref={passwordInput}
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  required
                  minLength={8}
                  maxLength={72}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </Field>
            </section>

            <section className="space-y-4">
              <h3 className="font-semibold">Où vous trouver</h3>

              <Button
                type="button"
                variant="secondary"
                className="w-full text-primary"
                onClick={requestGPS}
                disabled={gpsLoading}
              >
                {gpsLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <MapPin className="mr-2 h-4 w-4" />
                )}
                {gpsLoading ? "Localisation en cours..." : "Utiliser ma position actuelle"}
              </Button>
              {gpsMessage && <p className="text-xs text-muted-foreground">{gpsMessage}</p>}
              {coords && (
                <>
                  <input type="hidden" name="lat" value={coords.lat} />
                  <input type="hidden" name="lng" value={coords.lng} />
                </>
              )}

              {cities.length === 0 ? (
                <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">
                  La liste des quartiers n&apos;a pas pu être chargée. Rechargez la page ou
                  réessayez dans un instant.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Ville" htmlFor="cityId">
                    <select
                      id="cityId"
                      name="cityId"
                      className={SELECT}
                      value={cityId}
                      onChange={(event) => {
                        setCityId(event.target.value);
                        // Un quartier de l'ancienne ville ne va pas avec la nouvelle.
                        setNeighborhoodId("");
                      }}
                    >
                      {cities.map((city) => (
                        <option key={city.id} value={city.id}>
                          {city.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Quartier" htmlFor="neighborhoodId">
                    <select
                      id="neighborhoodId"
                      name="neighborhoodId"
                      className={SELECT}
                      required
                      value={neighborhoodId}
                      onChange={(event) => setNeighborhoodId(event.target.value)}
                    >
                      <option value="">Choisir…</option>
                      {(selectedCity?.neighborhoods ?? []).map((quartier) => (
                        <option key={quartier.id} value={quartier.id}>
                          {quartier.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}

              {isCandidate && (
                <Field
                  label="Adresse précise"
                  htmlFor="address"
                  hint="Rue, numéro, repère. Visible seulement par vous et l'équipe Madame Dacosta, jamais sur votre fiche."
                >
                  <Input
                    id="address"
                    name="address"
                    required
                    minLength={3}
                    maxLength={200}
                    placeholder="Ex : 12 rue Mbochi, derrière l'église Saint-Pierre"
                  />
                </Field>
              )}
            </section>

            {isCandidate && (
              <>
                <section className="space-y-5">
                  <h3 className="font-semibold">Votre métier</h3>
                  <CandidateFields required familyEditable onJobTitleChange={setJobTitle} />
                </section>

                <section className="space-y-4">
                  <div>
                    <h3 className="font-semibold flex items-center gap-2">
                      <IdCard className="h-4 w-4 text-primary" />
                      Pièce d&apos;identité
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Notre équipe vérifie votre identité avant de publier votre profil. Visible
                      seulement de notre équipe, jamais des familles. Photo ou PDF.
                    </p>
                  </div>

                  <Field label="Type de pièce d'identité" htmlFor="identityType">
                    <select
                      id="identityType"
                      name="identityType"
                      className={SELECT}
                      required
                      value={identityType}
                      onChange={(event) => setIdentityType(event.target.value)}
                    >
                      <option value="">Choisir</option>
                      {IDENTITY_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </Field>

                  {identityType && (
                    <>
                      {passport
                        ? slot("identity_front", "la page du passeport", "La page avec la photo.")
                        : slot("identity_front", "le recto", "Le côté avec la photo.")}
                      {needsBackSide(identityType) &&
                        slot("identity_back", "le verso", "L'autre côté de la carte.")}
                    </>
                  )}

                  {licenseNeeded && (
                    <div className="border-t border-border pt-4 space-y-2">
                      <p className="font-medium text-sm">Permis de conduire</p>
                      {slot("driving_license", "le permis", "Obligatoire pour les chauffeurs.")}
                    </div>
                  )}

                  {fileError && (
                    <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">
                      {fileError}
                    </p>
                  )}
                </section>
              </>
            )}
          </>
        )}

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">{error}</p>
        )}

        {step === "form" && (
          <div className="space-y-2">
            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold"
              disabled={!complete || busy !== null}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {busyLabel ?? "Créer mon compte"}
            </Button>
            {role && !complete && missing.length > 0 && (
              <p className="text-xs text-muted-foreground" aria-live="polite">
                Il manque encore : {missing.slice(0, 6).join(", ")}
                {missing.length > 6 ? ` et ${missing.length - 6} autre${missing.length > 7 ? "s" : ""}` : ""}.
              </p>
            )}
          </div>
        )}

        {step === "code" && (
          <div className="space-y-3 rounded-2xl border-2 border-primary/40 bg-primary/5 p-4">
            <p className="text-sm">
              Nous avons envoyé un code par SMS au <strong className="whitespace-nowrap">{sentTo}</strong>.
              Tapez-le ici pour créer votre compte.
            </p>
            <Field label="Code reçu par SMS" htmlFor="code">
              <Input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                autoFocus
              />
            </Field>
            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold"
              disabled={!complete || busy !== null || !/^\d{6}$/.test(code)}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {busyLabel ?? "Valider le code et créer mon compte"}
            </Button>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <button
                type="button"
                className="text-primary hover:underline disabled:opacity-50"
                disabled={busy !== null}
                onClick={sendCode}
              >
                Renvoyer le code
              </button>
              <button
                type="button"
                className="text-muted-foreground hover:underline"
                disabled={busy !== null}
                onClick={() => {
                  setStep("form");
                  phoneInput.current?.focus();
                }}
              >
                Changer de numéro
              </button>
            </div>
          </div>
        )}

        {step === "nocode" && (
          <div className="space-y-3 rounded-2xl border-2 border-secondary bg-secondary/10 p-4">
            <p className="text-sm">
              Le SMS n&apos;a pas pu être envoyé au <strong className="whitespace-nowrap">{sentTo}</strong>.
              Votre compte sera créé quand même : notre équipe vous appellera pour confirmer votre
              numéro.
            </p>
            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold"
              disabled={!complete || busy !== null}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {busyLabel ?? "Terminer mon inscription"}
            </Button>
          </div>
        )}
      </form>

      {/* Après le formulaire, pas avant : c'est un raccourci pour ceux qui ont
          un compte Google, pas le chemin principal. Beaucoup de candidates
          n'en ont pas. */}
      <GoogleButton libelle="S'inscrire avec Google" />

      <p className="text-sm text-center text-muted-foreground mt-6">
        Déjà un compte ?{" "}
        <Link href="/login" className="text-primary font-medium hover:underline">
          Se connecter
        </Link>
      </p>
    </div>
  );
}
