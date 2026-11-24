/**
 * Le CV d'un candidat : un PDF ou une photo du document, dans le seau privé
 * `cvs`, sous `<auth.uid()>/cv.<ext>`. Partagé par le profil (FileUploads) et
 * la candidature à une offre internationale, qui le demande.
 */
export const CV_MAX = 5 * 1024 * 1024;

export const CV_TYPES = ["application/pdf", "image/jpeg", "image/png"];

/**
 * Ce que le sélecteur de fichiers laisse choisir, plus large que ce que le seau
 * accepte : un iPhone range ses photos en HEIC, réencodées en JPEG avant
 * l'envoi (src/lib/images/compresser.ts).
 */
export const CV_CHOISIR = [...CV_TYPES, "image/webp", "image/heic", "image/heif"].join(",");
