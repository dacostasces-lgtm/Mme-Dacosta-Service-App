import { Briefcase, MessageSquare, Star, Settings } from "lucide-react";
import { Link } from "@/i18n/routing";

export default function EmployerDashboard() {
  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold mb-8">Mon Espace Employeur</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-card p-6 rounded-2xl border border-border shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
              <Briefcase className="h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-bold">2</p>
              <p className="text-sm text-muted-foreground">Offres actives</p>
            </div>
          </div>
          <div className="bg-card p-6 rounded-2xl border border-border shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 bg-secondary/10 text-secondary-foreground rounded-xl flex items-center justify-center">
              <MessageSquare className="h-6 w-6 text-secondary" />
            </div>
            <div>
              <p className="text-2xl font-bold">5</p>
              <p className="text-sm text-muted-foreground">Messages non lus</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
