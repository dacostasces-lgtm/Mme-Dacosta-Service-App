import { MapPin, Star, BadgeCheck } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/routing";

interface ProfileCardProps {
  id: string;
  name: string;
  jobTitle: string;
  neighborhood: string;
  distance?: number;
  rating: number;
  isPremium: boolean;
  availability: string;
  avatarUrl?: string;
}

export function ProfileCard({ name, jobTitle, neighborhood, distance, rating, isPremium, availability, id }: ProfileCardProps) {
  return (
    <div className={`bg-card p-6 rounded-2xl border transition-all duration-300 hover:shadow-lg hover:-translate-y-1 ${isPremium ? 'border-secondary/50 shadow-secondary/5' : 'border-border'}`}>
      <div className="flex items-start gap-4">
        <div className="h-16 w-16 rounded-full bg-surface border-2 border-primary/10 overflow-hidden flex-shrink-0">
          <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=${name}`} alt={name} className="w-full h-full object-cover" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-bold text-lg truncate">{name}</h3>
            {isPremium && <BadgeCheck className="h-5 w-5 text-secondary" />}
          </div>
          <p className="text-primary font-medium text-sm mb-2">{jobTitle}</p>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {neighborhood} {distance && <span className="text-primary font-medium">({distance}km)</span>}
            </div>
            <div className="flex items-center gap-1">
              <Star className="h-3 w-3 text-secondary fill-secondary" />
              {rating.toFixed(1)}
            </div>
          </div>
        </div>
      </div>
      
      <div className="mt-4 flex gap-2">
        <Badge variant="secondary" className="font-normal">{availability}</Badge>
        {isPremium && <Badge className="bg-secondary text-secondary-foreground hover:bg-secondary/90 font-normal">Premium</Badge>}
      </div>

      <div className="mt-6 flex gap-3">
        <Link href={`/candidats/${id}`} className={buttonVariants({ className: "flex-1 rounded-full" })}>
          Voir Profil
        </Link>
      </div>
    </div>
  );
}
