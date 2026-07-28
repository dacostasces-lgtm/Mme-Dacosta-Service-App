const STATS = [
  { value: "+400", label: "profils vérifiés" },
  { value: "6", label: "métiers couverts" },
  { value: "48 h", label: "délai moyen de vérification" },
  { value: "0 %", label: "commission sur le salaire" },
];

export function TrustBar() {
  return (
    <section className="border-y border-border bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <dl className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-border">
          {STATS.map((stat) => (
            <div key={stat.label} className="px-2 py-8 lg:py-10 text-center">
              <dt className="sr-only">{stat.label}</dt>
              <dd>
                <span className="block text-3xl sm:text-4xl font-bold text-primary font-display">
                  {stat.value}
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {stat.label}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
