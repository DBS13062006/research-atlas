import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <section className="topo flex flex-1 items-center">
      <div className="mx-auto max-w-4xl px-4 py-24">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Research Atlas · a map of ideas
        </p>
        <h1 className="mt-4 text-5xl leading-tight md:text-7xl">See how an idea travelled.</h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          Papers placed by meaning, linked by citation and lineage, with every rule enforced inside the
          database.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button size="lg" nativeButton={false} render={<Link href="/atlas" />}>
            Open the atlas
          </Button>
          <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/search" />}>
            Search papers
          </Button>
        </div>
      </div>
    </section>
  );
}
