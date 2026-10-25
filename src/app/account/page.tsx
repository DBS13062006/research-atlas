import type { Metadata } from "next";
import { Suspense } from "react";
import { logoutAction } from "@/app/(auth)/actions";
import { PageHeader } from "@/components/page-header";
import { BlockSkeleton, SignInPrompt } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { ROLE_LABEL, ROLE_PERMISSIONS } from "@/lib/roles";
import { getCurrentUser } from "@/server/auth/dal";

export const metadata: Metadata = { title: "Account" };

async function Account() {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt next="/account" what="your account" />;
  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 md:grid-cols-2">
      <div className="rounded-xl border p-6">
        <h2 className="text-2xl">{user.name}</h2>
        <p className="text-muted-foreground">{user.email}</p>
        <Badge className="mt-3">{ROLE_LABEL[user.role]}</Badge>
        <p className="mt-4 font-mono text-xs text-muted-foreground">
          Session valid until {formatDate(user.expiresAt)} · renewed automatically while you use the site
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <form action={logoutAction}>
            <Button type="submit" variant="outline">
              Sign out
            </Button>
          </form>
          <form action={logoutAction}>
            <input type="hidden" name="everywhere" value="true" />
            <Button type="submit" variant="destructive">
              Sign out everywhere
            </Button>
          </form>
        </div>
      </div>
      <div className="rounded-xl border p-6">
        <h2 className="text-2xl">What your role can do</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The interface hides what your role cannot do. PostgreSQL refuses it anyway: your requests run as the
          database role <code className="font-mono">ra_{user.role.toLowerCase()}</code>.
        </p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {ROLE_PERMISSIONS[user.role].map((p) => (
            <li key={p}>
              <Badge variant="outline" className="font-mono">
                {p}
              </Badge>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function AccountPage() {
  return (
    <>
      <PageHeader eyebrow="Account" title="Your account" description="Sessions, role and permissions." />
      <Suspense
        fallback={
          <div className="mx-auto max-w-7xl px-4 py-10">
            <BlockSkeleton className="h-64" />
          </div>
        }
      >
        <Account />
      </Suspense>
    </>
  );
}
