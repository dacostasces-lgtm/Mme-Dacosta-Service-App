import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import {
  DIRECTORY_SELECT,
  ROLE_LABELS,
  loadCandidateAddresses,
  type AdminContact,
  type DirectoryRow,
} from "@/lib/admin/contacts";

/**
 * Export de la base de contacts, pour l'administration seulement.
 *
 * Point-virgule et BOM UTF-8 : c'est ce qu'Excel en français ouvre
 * directement, accents et colonnes compris. Une virgule mettrait tout dans la
 * première colonne.
 */
const BATCH = 500;

function cell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  // Une cellule commençant par = + - @ serait exécutée comme une formule par
  // Excel : un nom saisi à l'inscription ne doit rien pouvoir exécuter.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") {
    return new NextResponse("Réservé aux administrateurs.", { status: 403 });
  }

  const roleParam = request.nextUrl.searchParams.get("role");
  const role = roleParam === "candidate" || roleParam === "employer" ? roleParam : null;

  const supabase = await createClient();
  const lines = [
    [
      "Nom",
      "Rôle",
      "Téléphone",
      "Numéro confirmé par SMS",
      "WhatsApp",
      "Email",
      "Quartier",
      "Ville",
      "Adresse précise",
      "Métier",
      "Expérience",
      "Publié",
      "Premium",
      "Inscrit le",
    ].join(";"),
  ];

  for (let from = 0; ; from += BATCH) {
    let query = supabase
      .from("profiles")
      .select(DIRECTORY_SELECT)
      .order("created_at", { ascending: false })
      .range(from, from + BATCH - 1);
    if (role) query = query.eq("role", role);

    const { data, error } = await query;
    if (error) return new NextResponse(`Export impossible : ${error.message}`, { status: 500 });
    const rows = (data ?? []) as unknown as DirectoryRow[];
    if (rows.length === 0) break;

    const { data: contactData, error: contactError } = await supabase.rpc(
      "admin_profile_contacts",
      { p_ids: rows.map((row) => row.id) }
    );
    if (contactError) {
      return new NextResponse(`Coordonnées indisponibles : ${contactError.message}`, { status: 500 });
    }
    const contacts = new Map(
      ((contactData ?? []) as AdminContact[]).map((row) => [row.profile_id, row])
    );
    const addresses = await loadCandidateAddresses(
      supabase,
      rows.filter((row) => row.role === "candidate").map((row) => row.id)
    );

    for (const row of rows) {
      const contact = contacts.get(row.id);
      lines.push(
        [
          row.full_name,
          ROLE_LABELS[row.role] ?? row.role,
          contact?.phone,
          contact?.phone ? (contact.phone_verified ? "oui" : "non") : "",
          contact?.whatsapp,
          contact?.email,
          row.neighborhoods?.name,
          row.neighborhoods?.cities?.name,
          addresses?.get(row.id),
          row.candidate_details?.job_title,
          row.candidate_details?.experience,
          row.is_validated ? "oui" : "non",
          row.is_premium ? "oui" : "non",
          new Date(row.created_at).toLocaleDateString("fr-FR"),
        ]
          .map(cell)
          .join(";")
      );
    }

    if (rows.length < BATCH) break;
  }

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="madame-dacosta-contacts-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
