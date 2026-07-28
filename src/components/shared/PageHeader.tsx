import Image, { type StaticImageData } from "next/image";

type Props = {
  eyebrow?: string;
  title: string;
  description?: string;
  /** Optional photo band. Without it the header falls back to the mesh gradient. */
  image?: StaticImageData;
  children?: React.ReactNode;
};

export function PageHeader({ eyebrow, title, description, image, children }: Props) {
  return (
    <section
      className={`relative isolate overflow-hidden border-b border-border ${
        image ? "text-white" : "bg-surface bg-mesh bg-grain"
      }`}
    >
      {image && (
        <>
          <Image
            src={image}
            alt=""
            placeholder="blur"
            sizes="100vw"
            className="object-cover -z-10"
            priority
            fill
          />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-overlay/92 via-overlay/80 to-overlay/55" />
        </>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="max-w-2xl">
          {eyebrow && (
            <span className={`eyebrow ${image ? "text-secondary" : ""}`}>{eyebrow}</span>
          )}
          <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight">
            {title}
          </h1>
          {description && (
            <p
              className={`mt-4 text-base sm:text-lg leading-relaxed ${
                image ? "text-white/80" : "text-muted-foreground"
              }`}
            >
              {description}
            </p>
          )}
        </div>
        {children && <div className="mt-8">{children}</div>}
      </div>
    </section>
  );
}
