import { Send, Phone, Video, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function MessagesPage() {
  return (
    <div className="h-[calc(100vh-4rem)] bg-background flex overflow-hidden">
      
      {/* Sidebar: Conversations List */}
      <aside className="w-full md:w-80 lg:w-96 border-r border-border bg-surface flex flex-col h-full">
        <div className="p-4 border-b border-border">
          <h2 className="text-xl font-bold">Messages</h2>
          <Input placeholder="Rechercher une conversation..." className="mt-4" />
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {/* Conversation Item 1 */}
          <div className="p-4 border-b border-border hover:bg-card cursor-pointer bg-card/50 flex gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 overflow-hidden flex-shrink-0 relative">
              <img src="https://api.dicebear.com/7.x/notionists/svg?seed=Amina" alt="Amina" />
              <div className="absolute bottom-0 right-0 h-3 w-3 bg-green-500 border-2 border-background rounded-full"></div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-baseline mb-1">
                <h4 className="font-bold truncate">Amina Touré</h4>
                <span className="text-xs text-muted-foreground">10:42</span>
              </div>
              <p className="text-sm text-muted-foreground truncate">Je serai disponible à partir de lundi pour commencer.</p>
            </div>
          </div>

          {/* Conversation Item 2 */}
          <div className="p-4 border-b border-border hover:bg-card cursor-pointer flex gap-3">
            <div className="h-12 w-12 rounded-full bg-secondary/10 overflow-hidden flex-shrink-0">
              <img src="https://api.dicebear.com/7.x/notionists/svg?seed=Jean" alt="Jean" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-baseline mb-1">
                <h4 className="font-bold truncate">Jean B.</h4>
                <span className="text-xs text-muted-foreground">Hier</span>
              </div>
              <p className="text-sm text-muted-foreground truncate">Merci pour l'entretien.</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col h-full bg-background hidden md:flex">
        
        {/* Chat Header */}
        <header className="h-20 border-b border-border px-6 flex items-center justify-between bg-surface/50">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-full bg-primary/10 overflow-hidden relative">
              <img src="https://api.dicebear.com/7.x/notionists/svg?seed=Amina" alt="Amina" />
              <div className="absolute bottom-0 right-0 h-2.5 w-2.5 bg-green-500 border-2 border-background rounded-full"></div>
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">Amina Touré</h3>
              <p className="text-xs text-green-500 font-medium">En ligne</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="rounded-full"><Phone className="h-5 w-5" /></Button>
            <Button variant="ghost" size="icon" className="rounded-full"><Video className="h-5 w-5" /></Button>
            <Button variant="ghost" size="icon" className="rounded-full"><Info className="h-5 w-5" /></Button>
          </div>
        </header>

        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="text-center">
            <span className="text-xs text-muted-foreground font-medium bg-surface px-3 py-1 rounded-full">Aujourd'hui</span>
          </div>
          
          {/* Received Message */}
          <div className="flex gap-4 max-w-[80%]">
            <div className="h-8 w-8 rounded-full bg-primary/10 overflow-hidden flex-shrink-0 mt-1">
              <img src="https://api.dicebear.com/7.x/notionists/svg?seed=Amina" alt="Amina" />
            </div>
            <div>
              <div className="bg-surface border border-border p-4 rounded-2xl rounded-tl-none shadow-sm">
                <p>Bonjour ! J'ai bien reçu votre offre de réservation.</p>
              </div>
              <span className="text-xs text-muted-foreground mt-1 ml-1 block">10:40</span>
            </div>
          </div>

          {/* Sent Message */}
          <div className="flex gap-4 max-w-[80%] ml-auto justify-end">
            <div>
              <div className="bg-primary text-primary-foreground p-4 rounded-2xl rounded-tr-none shadow-sm shadow-primary/20">
                <p>Super ! Êtes-vous toujours disponible pour commencer lundi ?</p>
              </div>
              <span className="text-xs text-muted-foreground mt-1 mr-1 block text-right">10:41</span>
            </div>
          </div>
          
          {/* Received Message */}
          <div className="flex gap-4 max-w-[80%]">
            <div className="h-8 w-8 rounded-full bg-primary/10 overflow-hidden flex-shrink-0 mt-1">
              <img src="https://api.dicebear.com/7.x/notionists/svg?seed=Amina" alt="Amina" />
            </div>
            <div>
              <div className="bg-surface border border-border p-4 rounded-2xl rounded-tl-none shadow-sm">
                <p>Oui, je serai disponible à partir de lundi pour commencer.</p>
              </div>
              <span className="text-xs text-muted-foreground mt-1 ml-1 block">10:42</span>
            </div>
          </div>
        </div>

        {/* Message Input */}
        <div className="p-4 bg-surface border-t border-border">
          <div className="flex gap-2">
            <Input placeholder="Écrivez votre message..." className="flex-1 h-12 rounded-full px-6 bg-background border-border" />
            <Button size="icon" className="h-12 w-12 rounded-full shadow-md shadow-primary/20 shrink-0">
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </main>

    </div>
  );
}
