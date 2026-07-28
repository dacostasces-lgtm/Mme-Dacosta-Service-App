import Image, { type StaticImageData } from "next/image";
import { Quote } from "lucide-react";

type Props = {
  image: StaticImageData;
  imageAlt: string;
  quote: string;
  author: string;
  children: React.ReactNode;
};

/**
 * Split screen for the auth pages: the form keeps its own markup, this only
 * wraps it and fills the empty half with a photo on large screens.
 */
export function AuthShell({ image, imageAlt, quote, author, children }: Props) {
  return (
    <div className="flex-1 grid lg:grid-cols-2">
      <div className="relative hidden lg:block">
        <Image
          src={image}
          alt={imageAlt}
          placeholder="blur"
          sizes="50vw"
          className="object-cover"
          priority
          fill
        />
        <div className="absolute inset-0 scrim" />
        <figure className="absolute inset-x-0 bottom-0 p-10 xl:p-14 text-white">
          <Quote aria-hidden className="h-8 w-8 text-secondary mb-4" />
          <blockquote className="text-xl xl:text-2xl font-display leading-snug max-w-md">
            {quote}
          </blockquote>
          <figcaption className="mt-4 text-sm text-white/70">{author}</figcaption>
        </figure>
      </div>

      <div className="flex flex-col justify-center bg-surface bg-mesh bg-grain px-4 py-12 sm:px-6 lg:px-8">
        {children}
      </div>
    </div>
  );
}
