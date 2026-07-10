import { SearchFilters } from "@/components/features/search/SearchFilters";
import { ProfileCard } from "@/components/features/search/ProfileCard";

const MOCK_PROFILES = [
  { id: "1", name: "Amina T.", jobTitle: "Nounou Expérimentée", neighborhood: "Cocody Angré", distance: 2.5, rating: 4.8, isPremium: true, availability: "Temps Plein" },
  { id: "2", name: "Jean B.", jobTitle: "Chauffeur Privé", neighborhood: "Marcory", distance: 5.2, rating: 4.9, isPremium: true, availability: "Dispo Immédiate" },
  { id: "3", name: "Fatou K.", jobTitle: "Ménagère", neighborhood: "Yopougon", distance: 12.0, rating: 4.5, isPremium: false, availability: "Temps Partiel" },
  { id: "4", name: "Kouadio E.", jobTitle: "Cuisinier", neighborhood: "Plateau", distance: 1.1, rating: 5.0, isPremium: false, availability: "Interne" },
];

export default function CandidatesPage() {
  return (
    <div className="min-h-screen bg-background py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Sidebar Filters */}
          <aside className="w-full md:w-1/3 lg:w-1/4">
            <SearchFilters />
          </aside>

          {/* Results Area */}
          <main className="w-full md:w-2/3 lg:w-3/4">
            <div className="mb-6 flex justify-between items-center">
              <h1 className="text-2xl font-bold">Candidats disponibles (4)</h1>
              <select className="h-10 rounded-md border border-border bg-background px-3 text-sm">
                <option>Pertinence</option>
                <option>Distance</option>
                <option>Mieux notés</option>
              </select>
            </div>
            
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {MOCK_PROFILES.map(profile => (
                <ProfileCard key={profile.id} {...profile} />
              ))}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
