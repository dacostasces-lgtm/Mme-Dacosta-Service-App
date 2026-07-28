import { MessageSquare, Send, Star, ShieldCheck, Clock, Briefcase } from "lucide-react";
import { Link } from "@/i18n/routing";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

function StatCard({
  icon,
  value,
  label,
  tone = "primary",
}: {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  tone?: "primary" | "secondary";
}) {
  return (
    <div className="bg-card p-6 rounded-3xl border border-border shadow-soft flex items-center gap-4">
      <div
        className={`h-12 w-12 rounded-xl flex items-center justify-center ${
          tone === "primary" ? "bg-primary/10 text-primary" : "bg-secondary/10 text-secondary"
        }`}
      >
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export default async function CandidateDashboard() {
  const user = await requireUser({ role: "candidate" });
  const supabase = await createClient();

  // RLS scopes these to the candidate: their own applications, their own inbox.
  const [applications, unread, reviews, profile] = await Promise.all([
    supabase.from("applications").select("id", { count: "exact", head: true }),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("receiver_id", user.profileId ?? "")
      .eq("is_read", false),
    supabase.from("reviews").select("rating").eq("reviewee_id", user.profileId ?? ""),
    supabase
      .from("profiles")
      .select("is_validated")
      .eq("id", user.profileId ?? "")
      .maybeSingle(),
  ]);

  const ratings = (reviews.data ?? []) as { rating: number }[];
  const averageRating =
    ratings.length > 0
      ? (ratings.reduce((total, review) => total + review.rating, 0) / ratings.length).toFixed(1)
      : "—";

  const published = profile.data?.is_validated ?? false;

  return (
    <div className="flex-1 bg-surface bg-grain">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold mb-1">Mon Espace Candidat</h1>
        <p className="text-muted-foreground mb-8">Bonjour {user.fullName}</p>

        {/* Profile status replaces the old "profile views" tile: nothing in the
            schema records views, and inventing a number would be misleading. */}
        <div
          className={`rounded-2xl border p-6 mb-6 flex items-start gap-4 ${
            published ? "bg-card border-border" : "bg-secondary/10 border-secondary/40"
          }`}
        >
          {published ? (
            <ShieldCheck className="h-6 w-6 text-green-500 shrink-0" />
          ) : (
            <Clock className="h-6 w-6 text-secondary shrink-0" />
          )}
          <div>
            <p className="font-semibold">
              {published ? "Votre profil est en ligne" : "Votre profil est en cours de vérification"}
            </p>
            <p className="text-sm text-muted-foreground">
              {published
                ? "Les employeurs peuvent vous trouver dans la recherche par proximité."
                : "Il n'apparaîtra dans la recherche qu'une fois vérifié par notre équipe. Vous n'avez rien à faire, nous vous préviendrons."}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard icon={<Send className="h-6 w-6" />} value={applications.count ?? 0} label="Candidatures envoyées" />
          <StatCard
            icon={<MessageSquare className="h-6 w-6" />}
            value={unread.count ?? 0}
            label="Messages non lus"
            tone="secondary"
          />
          <StatCard
            icon={<Star className="h-6 w-6" />}
            value={averageRating}
            label={ratings.length > 0 ? `Note moyenne (${ratings.length} avis)` : "Pas encore d'avis"}
            tone="secondary"
          />
        </div>

        <div className="bg-card rounded-3xl border border-border shadow-soft p-6 sm:p-7">
          <h2 className="font-semibold mb-2">Trouvez votre prochain emploi</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Consultez les offres publiées par les familles et employeurs près de chez vous.
          </p>
          <Link href="/offres" className={buttonVariants({ variant: "outline", className: "rounded-full gap-2" })}>
            <Briefcase className="h-4 w-4" />
            Voir les offres
          </Link>
        </div>
      </div>
    </div>
  );
}
