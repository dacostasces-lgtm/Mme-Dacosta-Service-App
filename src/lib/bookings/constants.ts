/**
 * Connection fee, in XAF.
 *
 * Kept out of `actions.ts`: a `"use server"` module may only export async
 * functions, and exporting a plain constant from one silently strips every
 * export in the file. The server action remains the only thing that decides
 * what a booking actually costs — this is shared so the UI can display the
 * same figure without restating it.
 */
export const BOOKING_FEE_XAF = 15000;

export function formatFee(amount: number = BOOKING_FEE_XAF) {
  return `${new Intl.NumberFormat("fr-FR").format(amount)} FCFA`;
}
