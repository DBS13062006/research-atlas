import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="font-mono text-sm text-muted-foreground">404 · Off the map</p>
      <h1 className="mt-4 text-4xl">There is nothing at these coordinates</h1>
      <p className="mt-3 text-muted-foreground">
        The paper, author or page you were looking for does not exist, or was removed.
      </p>
      <Button className="mt-6" nativeButton={false} render={<Link href="/" />}>
        Back to the atlas
      </Button>
    </div>
  );
}
