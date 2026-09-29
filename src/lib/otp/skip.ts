import "server-only";

import { cookies } from "next/headers";

/**
 * Report de la vérification du numéro.
 *
 * La porte posée dans requireUser est une incitation d'usage, pas une barrière
 * de sécurité : l'exigence réelle pèse à la validation du profil, que la
 * modération refuse tant que le numéro n'est pas confirmé. Un cookie suffit
 * donc, et le fait qu'il soit falsifiable ne change rien — se l'octroyer ne
 * rend personne vérifié.
 *
 * Ce report existe parce qu'un SMS n'arrive pas toujours, et que l'utilisatrice
 * n'y peut rien. Sans lui, un envoi qui échoue enferme quelqu'un hors de son
 * propre compte, définitivement.
 */
const NAME = "md-verif-reportee";
const DUREE = 60 * 60 * 24 * 7; // une semaine : de quoi réessayer sans harceler

export async function hasSkippedVerification() {
  return (await cookies()).get(NAME)?.value === "1";
}

export async function rememberSkip() {
  (await cookies()).set(NAME, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: DUREE,
    path: "/",
  });
}

export async function forgetSkip() {
  (await cookies()).delete(NAME);
}
