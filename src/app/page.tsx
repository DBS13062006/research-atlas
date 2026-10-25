import { ArrowRight, GitBranch, Map as MapIcon, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { MiniAtlas } from "@/components/atlas/mini-atlas";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format";
import { cachedAtlasPoints, cachedCorpusStats } from "@/server/cached";

async function Counters() {
  await connection();
  const s = await cachedCorpusStats().catch(() => null);
  if (!s) return null;
  const items = [
    { label: "papers", value: s.papers },
    { label: "citations between them", value: s.citations },
    { label: "authors", value: s.authors },
    { label: "research topics", value: s.topics },
  ];
  return (
    <dl className="mt-10 grid max-w-2xl grid-cols-2 gap-6 sm:grid-cols-4">
      {items.map((i) => (
        <div key={i.label}>
          <dt className="text-xs text-muted-foreground">{i.label}</dt>
          <dd className="font-mono text-2xl">{formatNumber(i.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

async function MapPreview() {
  await connection();
  const points = await cachedAtlasPoints().catch(() => []);
  if (points.length === 0) return null;
  return <MiniAtlas points={points} />;
}

const ENTRIES = [
  {
    href: "/atlas",
    icon: MapIcon,
    title: "Wander the map",
    body: "Fields as continents, papers as towns. Zoom into a research front.",
  },
  {
    href: "/explore/lineage",
    icon: GitBranch,
    title: "Trace an idea",
    body: "Follow a paper back to what it builds on, and forward to what it started.",
  },
  {
    href: "/integrity",
    icon: ShieldAlert,
    title: "Check the ground",
    body: "Retracted papers and everything that leans on them, two hops out.",
  },
];

export default function Home() {
  return (
    <>
      <section className="topo border-b">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Research Atlas · a map of ideas
            </p>
            <h1 className="mt-4 text-5xl leading-[1.05] md:text-7xl">See how an idea travelled.</h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              Real papers on spiking networks, transformers, graph learning, vision, clinical machine learning
              and reinforcement learning — placed by meaning, linked by citation, and checked against
              retractions.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" nativeButton={false} render={<Link href="/atlas" />}>
                Open the atlas
                <ArrowRight className="size-4" aria-hidden />
              </Button>
              <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/search" />}>
                Search papers
              </Button>
            </div>
            <Suspense fallback={<Skeleton className="mt-10 h-14 max-w-2xl" />}>
              <Counters />
            </Suspense>
          </div>
          <Suspense fallback={<Skeleton className="h-[380px] w-full rounded-xl" />}>
            <MapPreview />
          </Suspense>
        </div>
      </section>
      <section className="mx-auto grid max-w-7xl gap-4 px-4 py-14 md:grid-cols-3">
        {ENTRIES.map((e) => (
          <Link
            key={e.href}
            href={e.href}
            className="group rounded-xl border bg-card p-6 transition-colors hover:border-primary/50"
          >
            <e.icon className="size-6 text-primary" aria-hidden />
            <h2 className="mt-4 text-2xl">{e.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{e.body}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm text-primary">
              Go{" "}
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
          </Link>
        ))}
      </section>
    </>
  );
}
