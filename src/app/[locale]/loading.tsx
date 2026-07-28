/**
 * Segment-level fallback. Every route here is server-rendered on demand and
 * most of them wait on Supabase, so without this the browser sits on the
 * previous page with no feedback — which on a slow mobile connection reads as
 * a frozen app rather than a loading one.
 *
 * A skeleton rather than a spinner: it holds the page's shape, so the content
 * does not jump when it arrives.
 */
export default function Loading() {
  return (
    <div className="flex-1 bg-surface bg-grain" aria-busy="true" aria-live="polite">
      <span className="sr-only">Chargement en cours…</span>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <div className="h-9 w-64 max-w-full rounded-xl bg-muted animate-pulse" />
        <div className="h-5 w-96 max-w-full rounded-lg bg-muted animate-pulse mt-4" />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-10">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="rounded-3xl border border-border bg-card p-6 shadow-soft"
            >
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-2xl bg-muted animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
                </div>
              </div>
              <div className="mt-5 space-y-2">
                <div className="h-3 w-full rounded bg-muted animate-pulse" />
                <div className="h-3 w-5/6 rounded bg-muted animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
