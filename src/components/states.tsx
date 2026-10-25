import { AlertTriangle, Inbox, Lock } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center">
      <Inbox className="size-8 text-muted-foreground" aria-hidden />
      <p className="mt-3 font-medium">{title}</p>
      {children ? <div className="mt-1 max-w-md text-sm text-muted-foreground">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-destructive/40 bg-destructive/5 px-6 py-8 text-center"
    >
      <AlertTriangle className="mx-auto size-8 text-destructive" aria-hidden />
      <p className="mt-3 font-medium">{title}</p>
      {children ? <div className="mt-1 text-sm text-muted-foreground">{children}</div> : null}
    </div>
  );
}

// Rendered when a signed-in user's role is too low. The API answers the same request with 403.
export function AccessDenied({ need }: { need: string }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center" data-testid="access-denied">
      <p className="font-mono text-sm text-muted-foreground">403 · Forbidden</p>
      <Lock className="mx-auto mt-4 size-10 text-muted-foreground" aria-hidden />
      <h1 className="mt-4 text-4xl">This page needs the {need} role</h1>
      <p className="mt-3 text-muted-foreground">
        Your account is signed in, but its role does not include this page. PostgreSQL would refuse the
        underlying queries too.
      </p>
      <Button className="mt-6" variant="outline" nativeButton={false} render={<Link href="/" />}>
        Back to the atlas
      </Button>
    </div>
  );
}

export function SignInPrompt({ next, what }: { next: string; what: string }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <Lock className="mx-auto size-10 text-muted-foreground" aria-hidden />
      <h1 className="mt-4 text-4xl">Sign in to see {what}</h1>
      <div className="mt-6 flex justify-center gap-2">
        <Button nativeButton={false} render={<Link href={`/login?next=${encodeURIComponent(next)}`} />}>
          Sign in
        </Button>
        <Button variant="outline" nativeButton={false} render={<Link href="/signup" />}>
          Create an account
        </Button>
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
        <div key={i} className="space-y-2 rounded-xl border p-4">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function BlockSkeleton({ className = "h-80" }: { className?: string }) {
  return <Skeleton className={`w-full rounded-xl ${className}`} aria-busy="true" aria-label="Loading" />;
}
