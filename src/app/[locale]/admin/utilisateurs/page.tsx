import type { Metadata } from "next";
import { Download, MessageCircle, Phone } from "lucide-react";
import { Link } from "@/i18n/routing";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { telLink, whatsappLink } from "@/lib/contact/unlock";
import {
  DIRECTORY_SELECT,
  ROLE_LABELS,
  type AdminContact,
  type DirectoryRow,
} from "@/lib/admin/contacts";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Base de données",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 100;

/**
 * Tous les inscrits, avec leurs coordonnées : la base de contacts de
 * l'administration. Les numéros viennent d'admin_profile_contacts(), qui
 * refuse tout appelant non administrateur.
 */
export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; q?: string; page?: string }>;
}) {
  await requireUser({ role: "admin" });
  const params = await searchParams;
  const role = params.role === "candidate" || params.role === "employer" ? params.role : "";
  const q = (params.q ?? "").trim().slice(0, 80);
  const page = Math.max(1, Number(params.page) || 1);

  const supabase = await createClient();
  let query = supabase
    .from("profiles")
    .select(DIRECTORY_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (role) query = query.eq("role", role);
  if (q) query = query.ilike("full_name", `%${q}%`);

  const { data, count, error } = await query;
  const rows = (data ?? []) as unknown as DirectoryRow[];

  const contacts = new Map<string, AdminContact>();
  let contactsError: string | null = null;
  if (rows.length > 0) {
    const result = await supabase.rpc("admin_profile_contacts", {
      p_ids: rows.map((row) => row.id),
    });
    if (result.error) contactsError = result.error.message;
    for (const row of (result.data ?? []) as AdminContact[]) contacts.set(row.profile_id, row);
  }

  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (overrides: Record<string, string>) => {
    const next = new URLSearchParams({ ...(role && { role }), ...(q && { q }), ...overrides });
    return `/admin/utilisateurs?${next.toString()}`;
  };
  const exportHref = `/api/admin/contacts${role ? `?role=${role}` : ""}`;

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          ← Espace de modération
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4 mt-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold">Base de données</h1>
            <p className="text-muted-foreground">
              {total} inscrit{total > 1 ? "s" : ""}
              {role ? ` · ${ROLE_LABELS[role]}s` : ""} — coordonnées visibles de
              l&apos;administration seulement.
            </p>
          </div>
          {/* Lien simple, pas le Link de next-intl : c'est un téléchargement
              servi par une route API, hors des pages localisées. */}
          <a
            href={exportHref}
            className={cn(buttonVariants({ variant: "outline" }), "rounded-full gap-2")}
          >
            <Download className="h-4 w-4" />
            Télécharger (Excel / CSV)
          </a>
        </div>

        <form className="flex flex-wrap gap-3 mb-6">
          <Input name="q" defaultValue={q} placeholder="Rechercher un nom" className="max-w-xs" />
          <select
            name="role"
            defaultValue={role}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Tout le monde</option>
            <option value="candidate">Candidats</option>
            <option value="employer">Employeurs</option>
          </select>
          <button type="submit" className={cn(buttonVariants(), "rounded-full")}>
            Filtrer
          </button>
        </form>

        {(error || contactsError) && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3 mb-6">
            {error?.message ??
              `Coordonnées indisponibles : appliquez la migration 20261011080000_admin_contacts.sql. (${contactsError})`}
          </p>
        )}

        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Nom</th>
                <th className="px-4 py-3 font-medium">Téléphone</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Quartier</th>
                <th className="px-4 py-3 font-medium">Métier</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Inscrit le</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const contact = contacts.get(row.id);
                const number = contact?.whatsapp || contact?.phone;
                return (
                  <tr key={row.id} className="align-top">
                    <td className="px-4 py-3">
                      <span className="font-medium">{row.full_name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {ROLE_LABELS[row.role] ?? row.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {contact?.phone ? (
                        <a
                          href={telLink(contact.phone)}
                          className="inline-flex items-center gap-1 font-mono tabular-nums hover:text-primary"
                        >
                          <Phone className="h-3.5 w-3.5" aria-hidden />
                          {contact.phone}
                        </a>
                      ) : (
                        <span className="text-amber-700 dark:text-amber-500">Aucun</span>
                      )}
                      {number && (
                        <a
                          href={whatsappLink(number)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 flex items-center gap-1 text-xs hover:text-primary"
                        >
                          <MessageCircle className="h-3.5 w-3.5 text-[#25D366]" aria-hidden />
                          {contact?.whatsapp && contact.whatsapp !== contact.phone
                            ? contact.whatsapp
                            : "WhatsApp"}
                        </a>
                      )}
                      {contact?.phone && contact.phone_verified === false && (
                        <span className="block text-xs text-amber-700 dark:text-amber-500">
                          non confirmé
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 break-all">{contact?.email ?? "—"}</td>
                    <td className="px-4 py-3">
                      {[row.neighborhoods?.name, row.neighborhoods?.cities?.name]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {row.candidate_details?.job_title ?? "—"}
                      {row.candidate_details?.experience && (
                        <span className="block text-xs text-muted-foreground">
                          {row.candidate_details.experience}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {row.is_validated ? "Publié" : "En attente"}
                      {row.is_premium && <span className="block text-xs">Premium</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {new Date(row.created_at).toLocaleDateString("fr-FR")}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    Personne ne correspond.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between mt-6 text-sm">
            {page > 1 ? (
              <Link href={link({ page: String(page - 1) })} className="text-primary hover:underline">
                ← Précédents
              </Link>
            ) : (
              <span />
            )}
            <span className="text-muted-foreground">
              Page {page} / {pages}
            </span>
            {page < pages ? (
              <Link href={link({ page: String(page + 1) })} className="text-primary hover:underline">
                Suivants →
              </Link>
            ) : (
              <span />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
