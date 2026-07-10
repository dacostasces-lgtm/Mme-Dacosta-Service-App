import { MapPin, Star, BadgeCheck, CheckCircle2, FileText, Phone, Mail, Award, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function CandidateProfilePage({ params }: { params: Promise<{ id: string, locale: string }> }) {
  const { id } = await params;
  
  // Mock data for the profile
  const profile = {
    id,
    name: "Amina Touré",
    jobTitle: "Nounou Expérimentée & Femme de ménage",
    neighborhood: "Cocody Angré, Abidjan",
    distance: 2.5,
    rating: 4.8,
    reviewsCount: 24,
    isPremium: true,
    availability: "Temps Plein",
    experience: "5 ans",
    bio: "Je suis une nounou passionnée avec plus de 5 ans d'expérience dans la garde d'enfants de tous âges. Patiente, ponctuelle et attentionnée, je veille au bien-être de vos enfants et propose des activités d'éveil adaptées. J'assure également l'entretien de base de la maison.",
    skills: ["Garde d'enfants", "Cuisine basique", "Ménage", "Aide aux devoirs", "Premiers secours"],
    verifications: ["Identité vérifiée", "Casier judiciaire vierge", "Entretien passé"],
    expectedSalary: "150 000 FCFA / mois",
  };

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header Section */}
        <div className="bg-card rounded-3xl p-8 border border-border shadow-sm mb-8 relative overflow-hidden">
          {profile.isPremium && (
            <div className="absolute top-0 right-0 bg-secondary text-secondary-foreground px-4 py-1 rounded-bl-xl text-sm font-semibold flex items-center gap-1">
              <BadgeCheck className="h-4 w-4" /> Profil Premium
            </div>
          )}
          
          <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="h-32 w-32 rounded-full bg-surface border-4 border-background shadow-lg overflow-hidden flex-shrink-0">
              <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=${profile.name}`} alt={profile.name} className="w-full h-full object-cover" />
            </div>
            
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h1 className="text-3xl font-bold">{profile.name}</h1>
                {profile.isPremium && <BadgeCheck className="h-6 w-6 text-secondary" />}
              </div>
              <p className="text-primary font-medium text-xl mb-4">{profile.jobTitle}</p>
              
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-6">
                <div className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {profile.neighborhood}
                </div>
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4 text-secondary fill-secondary" />
                  <span className="font-medium text-foreground">{profile.rating}</span> ({profile.reviewsCount} avis)
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {profile.experience} d'expérience
                </div>
              </div>
              
              <div className="flex gap-3">
                <Button size="lg" className="rounded-full px-8 shadow-md">
                  <Phone className="mr-2 h-4 w-4" /> Contacter
                </Button>
                <Button size="lg" variant="outline" className="rounded-full px-8">
                  <FileText className="mr-2 h-4 w-4" /> Proposer une offre
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="md:col-span-2 space-y-8">
            <section className="bg-card rounded-3xl p-8 border border-border shadow-sm">
              <h2 className="text-xl font-bold mb-4">À propos</h2>
              <p className="text-muted-foreground leading-relaxed">{profile.bio}</p>
            </section>

            <section className="bg-card rounded-3xl p-8 border border-border shadow-sm">
              <h2 className="text-xl font-bold mb-4">Compétences</h2>
              <div className="flex flex-wrap gap-2">
                {profile.skills.map((skill, index) => (
                  <Badge key={index} variant="secondary" className="px-3 py-1.5 text-sm font-normal">
                    {skill}
                  </Badge>
                ))}
              </div>
            </section>
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            <section className="bg-surface rounded-3xl p-6 border border-border">
              <h3 className="font-bold mb-4 flex items-center gap-2">
                <Award className="h-5 w-5 text-primary" />
                Vérifications
              </h3>
              <ul className="space-y-3">
                {profile.verifications.map((verif, index) => (
                  <li key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    {verif}
                  </li>
                ))}
              </ul>
            </section>

            <section className="bg-card rounded-3xl p-6 border border-border shadow-sm">
              <h3 className="text-sm font-semibold text-muted-foreground mb-1">Disponibilité</h3>
              <p className="font-medium text-lg mb-4">{profile.availability}</p>
              
              <h3 className="text-sm font-semibold text-muted-foreground mb-1">Prétention Salariale</h3>
              <p className="font-medium text-lg">{profile.expectedSalary}</p>
            </section>
          </div>
        </div>

      </div>
    </div>
  );
}
