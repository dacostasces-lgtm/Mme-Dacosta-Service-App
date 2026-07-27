import { JobForm, type NeighborhoodOption } from "@/components/features/jobs/JobForm";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

type NeighborhoodRow = {
  id: string;
  name: string;
  cities: { name: string } | null;
};

export default async function CreateJobPage() {
  await requireUser({ role: "employer" });

  const supabase = await createClient();
  const { data } = await supabase
    .from("neighborhoods")
    .select("id, name, cities(name)")
    .order("name");

  const neighborhoods: NeighborhoodOption[] = ((data ?? []) as unknown as NeighborhoodRow[]).map(
    (row) => ({
      id: row.id,
      label: [row.name, row.cities?.name].filter(Boolean).join(", "),
    })
  );

  return (
    <div className="min-h-screen bg-surface py-12">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold mb-2">Publier une offre</h1>
        <p className="text-muted-foreground mb-8">
          Décrivez le poste le plus précisément possible : les candidats postulent d&apos;abord aux
          offres dont ils comprennent les attentes.
        </p>

        <div className="bg-card border border-border rounded-3xl p-8 shadow-sm">
          <JobForm neighborhoods={neighborhoods} />
        </div>
      </div>
    </div>
  );
}
