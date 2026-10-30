/**
 * Réduire une photo dans le navigateur avant de l'envoyer.
 *
 * Pourquoi c'est nécessaire, et pas un confort. Les seaux posent des plafonds —
 * 2 Mo pour la photo de profil, 5 pour le CV, 10 pour une pièce d'identité — et
 * l'application refusait tout fichier au-dessus. Or une photo prise avec un
 * téléphone d'aujourd'hui pèse couramment 3 à 6 Mo : la photo de profil était
 * donc refusée à presque tout le monde, et les gens disaient avec raison
 * « je mets tout, et ça ne passe pas ». Le plafond n'était pas le problème ; ne
 * rien faire du fichier avant de l'envoyer l'était.
 *
 * Un iPhone rend en plus volontiers du HEIC, qu'aucun seau n'accepte. Passer
 * l'image par un canevas la réencode en JPEG : c'est iOS qui sait décoder le
 * HEIC, et c'est précisément là qu'il apparaît. Le format ne se pose donc plus.
 *
 * Ce qui n'est pas touché :
 *   - un PDF, rendu tel quel. Une pièce peut légitimement en être un ;
 *   - une image déjà petite et déjà dans un format accepté, qu'il serait vain
 *     de réencoder — on perdrait de la qualité sans rien gagner ;
 *   - une image que le navigateur ne sait pas décoder : on rend l'original, et
 *     l'écran affiche le refus comme avant. Mieux vaut l'ancien message qu'une
 *     exception.
 */

/** Au-delà, une pièce d'identité reste lisible et le fichier tient en poche. */
const COTE_MAX = 2000;

/** Qualités tentées dans l'ordre, jusqu'à passer sous le plafond. */
const QUALITES = [0.85, 0.7, 0.55, 0.4];

/** En deçà, réencoder coûterait de la qualité pour rien. */
const DEJA_PETIT = 600 * 1024;

/** Extensions qui valent image quand le type MIME manque. */
const EXTENSIONS_IMAGE = /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i;

/**
 * iOS rend parfois un type vide pour une photo choisie dans l'application
 * Fichiers. Sans ce repli sur l'extension, le fichier n'était pas réduit, puis
 * refusé par le contrôle de format : la personne voyait « format non accepté »
 * devant une photo parfaitement ordinaire.
 */
function estUneImage(file: File) {
  if (file.type.startsWith("image/")) return true;
  return file.type === "" && EXTENSIONS_IMAGE.test(file.name);
}

async function enCanevas(file: File) {
  // createImageBitmap décode hors du fil principal et gère l'orientation EXIF
  // avec `imageOrientation`, sans quoi une photo prise à la verticale
  // ressortirait couchée.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

  const facteur = Math.min(1, COTE_MAX / Math.max(bitmap.width, bitmap.height));
  const largeur = Math.round(bitmap.width * facteur);
  const hauteur = Math.round(bitmap.height * facteur);

  const canevas = document.createElement("canvas");
  canevas.width = largeur;
  canevas.height = hauteur;
  const contexte = canevas.getContext("2d");
  if (!contexte) {
    bitmap.close();
    return null;
  }
  // Le JPEG n'a pas de transparence : sans ce fond, un PNG transparent
  // ressortirait sur du noir.
  contexte.fillStyle = "#ffffff";
  contexte.fillRect(0, 0, largeur, hauteur);
  contexte.drawImage(bitmap, 0, 0, largeur, hauteur);
  bitmap.close();
  return canevas;
}

function versBlob(canevas: HTMLCanvasElement, qualite: number) {
  return new Promise<Blob | null>((resolve) => {
    canevas.toBlob((blob) => resolve(blob), "image/jpeg", qualite);
  });
}

/**
 * Rend un fichier prêt à partir : JPEG réduit si c'était une image, l'original
 * sinon. Ne lève jamais — un échec rend l'original, et l'appelant garde son
 * contrôle de taille et de format comme dernier filet.
 */
export async function compresserImage(file: File, plafondOctets: number): Promise<File> {
  if (!estUneImage(file)) return file;
  // Un fichier déjà petit et déjà dans un format que le seau accepte : on n'y
  // touche pas. Le HEIC et le type manquant, eux, doivent passer par le canevas
  // quelle que soit leur taille — c'est leur format qui pose problème, pas leur
  // poids.
  const formatSur =
    file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp";
  if (file.size <= DEJA_PETIT && formatSur) return file;

  try {
    const canevas = await enCanevas(file);
    if (!canevas) return file;

    for (const qualite of QUALITES) {
      const blob = await versBlob(canevas, qualite);
      if (!blob) break;
      if (blob.size <= plafondOctets) {
        const nom = file.name.replace(/\.[^.]+$/, "") || "photo";
        return new File([blob], `${nom}.jpg`, { type: "image/jpeg" });
      }
    }
    return file;
  } catch {
    // HEIC sur un navigateur qui ne sait pas le lire, image corrompue, canevas
    // refusé : on rend l'original et le message de refus habituel s'affiche.
    return file;
  }
}
