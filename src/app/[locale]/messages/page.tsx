import { MessagesSquare } from "lucide-react";
import { Link } from "@/i18n/routing";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { MessageComposer } from "@/components/features/messages/MessageComposer";

type Conversation = {
  profile_id: string;
  full_name: string;
  avatar_url: string | null;
  role: string;
  last_message: string;
  last_message_at: string;
  unread_count: number | string;
};

type Message = {
  id: string;
  sender_id: string;
  content: string;
  sent_at: string;
};

function formatTime(iso: string) {
  const date = new Date(iso);
  const sameDay = new Date().toDateString() === date.toDateString();
  return sameDay
    ? date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ avec?: string }>;
}) {
  const user = await requireUser();
  const { avec } = await searchParams;
  const supabase = await createClient();

  // Marked read before listing, so the unread badges reflect this visit rather
  // than lagging one navigation behind.
  if (avec) {
    await supabase.rpc("mark_conversation_read", { other: avec });
  }

  const { data: conversationData } = await supabase.rpc("list_conversations");
  const conversations = (conversationData ?? []) as Conversation[];

  let thread: Message[] = [];
  if (avec) {
    const { data } = await supabase
      .from("messages")
      .select("id, sender_id, content, sent_at")
      .or(
        `and(sender_id.eq.${user.profileId},receiver_id.eq.${avec}),` +
          `and(sender_id.eq.${avec},receiver_id.eq.${user.profileId})`
      )
      .order("sent_at");
    thread = (data ?? []) as Message[];
  }

  const active = conversations.find((conversation) => conversation.profile_id === avec);

  return (
    <div className="h-[calc(100vh-4rem)] bg-background flex overflow-hidden">
      <aside
        className={`w-full md:w-80 lg:w-96 border-r border-border bg-surface flex flex-col h-full ${avec ? "hidden md:flex" : ""}`}
      >
        <div className="p-4 border-b border-border">
          <h2 className="text-xl font-bold">Messages</h2>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground text-center">
              Aucune conversation. Contactez un profil depuis sa fiche pour démarrer un échange.
            </p>
          ) : (
            conversations.map((conversation) => {
              const unread = Number(conversation.unread_count);
              return (
                <Link
                  key={conversation.profile_id}
                  href={`/messages?avec=${conversation.profile_id}`}
                  className={`p-4 border-b border-border hover:bg-card flex gap-3 transition-colors ${
                    conversation.profile_id === avec ? "bg-card" : ""
                  }`}
                >
                  <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold uppercase shrink-0">
                    {conversation.full_name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline gap-2">
                      <p className="font-semibold truncate">{conversation.full_name}</p>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatTime(conversation.last_message_at)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <p className="text-sm text-muted-foreground truncate">
                        {conversation.last_message}
                      </p>
                      {unread > 0 && (
                        <span className="shrink-0 h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-medium flex items-center justify-center">
                          {unread}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </aside>

      <section className={`flex-1 flex flex-col h-full ${avec ? "" : "hidden md:flex"}`}>
        {!avec || !active ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <MessagesSquare className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="font-medium">Sélectionnez une conversation</p>
            <p className="text-sm text-muted-foreground">
              Vos échanges avec les candidats et employeurs apparaissent ici.
            </p>
          </div>
        ) : (
          <>
            <header className="p-4 border-b border-border bg-card flex items-center gap-3">
              <Link href="/messages" className="md:hidden text-sm text-primary">
                Retour
              </Link>
              <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold uppercase">
                {active.full_name.charAt(0)}
              </div>
              <div>
                <p className="font-semibold leading-tight">{active.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  {active.role === "employer" ? "Employeur" : active.role === "admin" ? "Administrateur" : "Candidat"}
                </p>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-surface">
              {thread.map((message) => {
                const mine = message.sender_id === user.profileId;
                return (
                  <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                        mine
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-card border border-border rounded-bl-sm"
                      }`}
                    >
                      <p className="text-sm whitespace-pre-line break-words">{message.content}</p>
                      <p className={`text-[10px] mt-1 ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                        {formatTime(message.sent_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <MessageComposer receiverId={avec} />
          </>
        )}
      </section>
    </div>
  );
}
