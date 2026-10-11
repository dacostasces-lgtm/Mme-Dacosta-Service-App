"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Link2, MessageSquareText, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Le logo WhatsApp : lucide ne fournit plus de logos de marque. */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12.04 2a9.9 9.9 0 0 0-8.5 14.97L2 22l5.17-1.5A9.9 9.9 0 1 0 12.04 2Zm0 18.1a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.07.89.9-2.99-.2-.31a8.2 8.2 0 1 1 6.85 3.74Zm4.5-6.14c-.25-.12-1.46-.72-1.69-.8-.23-.08-.39-.12-.55.12-.16.25-.63.8-.78.97-.14.16-.29.18-.53.06a6.7 6.7 0 0 1-3.32-2.9c-.25-.43.25-.4.72-1.33.08-.16.04-.3-.02-.43-.06-.12-.55-1.32-.75-1.8-.2-.48-.4-.41-.55-.42h-.47a.9.9 0 0 0-.65.3 2.74 2.74 0 0 0-.85 2.03 4.76 4.76 0 0 0 1 2.53 10.9 10.9 0 0 0 4.17 3.69c1.55.67 2.16.73 2.93.61.47-.07 1.46-.6 1.66-1.17.2-.58.2-1.07.14-1.17-.06-.1-.22-.16-.47-.29Z" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M13.5 21.95V14h2.7l.4-3.13h-3.1V8.88c0-.9.25-1.52 1.55-1.52h1.65V4.57a22 22 0 0 0-2.41-.12c-2.39 0-4.02 1.46-4.02 4.13v2.3H7.56V14h2.7v7.95A10 10 0 1 1 13.5 21.95Z" />
    </svg>
  );
}

/**
 * Partager une page : une offre, un profil, le site.
 *
 * Sur téléphone, le menu de partage du système, qui propose déjà WhatsApp et
 * toutes les applications installées. Ailleurs — ordinateur, ou navigateur qui
 * ne le permet pas — un menu avec WhatsApp, le moyen par lequel presque tout
 * circule ici, puis Facebook, SMS et la copie du lien.
 */
export function ShareButton({
  url,
  title,
  text,
  label = "Partager",
  variant = "outline",
  size = "default",
  align = "right",
  className,
}: {
  url: string;
  title: string;
  /** Phrase d'accroche placée avant le lien dans WhatsApp et SMS. */
  text: string;
  label?: string;
  variant?: "outline" | "default" | "ghost";
  size?: "default" | "sm";
  /** Côté où s'ouvre le menu : celui du bouton qui a de la place à côté. */
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  // Ferme le menu au clic ailleurs et à Échap, comme tout menu déroulant.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const share = async () => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (error) {
        // Fermé par l'utilisateur : rien à faire. Toute autre erreur (partage
        // refusé par le navigateur) retombe sur le menu ci-dessous.
        if ((error as DOMException)?.name === "AbortError") return;
      }
    }
    setOpen((value) => !value);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers refusé (page non sécurisée, permission) : le lien reste
      // sélectionnable dans le champ du menu.
    }
  };

  const message = `${text}\n${url}`;
  const options = [
    {
      label: "WhatsApp",
      href: `https://wa.me/?text=${encodeURIComponent(message)}`,
      icon: <WhatsAppIcon className="h-4 w-4 text-[#25D366]" />,
    },
    {
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      icon: <FacebookIcon className="h-4 w-4 text-[#1877F2]" />,
    },
    {
      label: "SMS",
      href: `sms:?&body=${encodeURIComponent(message)}`,
      icon: <MessageSquareText className="h-4 w-4" />,
    },
  ];

  return (
    <div ref={container} className={cn("relative inline-block", className)}>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={share}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn("rounded-full gap-2", size === "default" && "h-12 px-6")}
      >
        <Share2 className="h-4 w-4" />
        {label}
      </Button>

      {open && (
        <div
          role="menu"
          className={cn(
            "absolute z-30 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card p-2 shadow-lift",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {options.map((option) => (
            <a
              key={option.label}
              role="menuitem"
              href={option.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-accent"
            >
              {option.icon}
              {option.label}
            </a>
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={copy}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-accent"
          >
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Link2 className="h-4 w-4" />}
            {copied ? "Lien copié" : "Copier le lien"}
          </button>
          <input
            readOnly
            value={url}
            aria-label="Lien à partager"
            onFocus={(event) => event.currentTarget.select()}
            className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-muted-foreground"
          />
        </div>
      )}
    </div>
  );
}
