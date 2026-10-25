import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { Suspense } from "react";
import { PageHeader } from "@/components/common/page-header";
import { BlockSkeleton, SignInPrompt } from "@/components/common/states";
import { type LabItem, LabWorkbench } from "@/components/lab/lab-workbench";
import { DB_ROLE } from "@/lib/roles";
import { getCurrentUser } from "@/server/auth/dal";
import { highlight } from "@/server/highlight";
import { LAB_GROUPS, labCatalog } from "@/server/services/lab";

export const metadata: Metadata = { title: "Query Lab" };

async function labItems(): Promise<LabItem[]> {
  "use cache";
  cacheLife("days");
  return Promise.all(
    labCatalog().map(async ({ body, stdin: _stdin, ...entry }) => ({
      ...entry,
      html: await highlight(body, entry.language),
    })),
  );
}

async function Lab() {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt next="/lab" what="the Query Lab" />;
  const items = await labItems();
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <LabWorkbench
        items={items}
        groups={[...LAB_GROUPS]}
        isAdmin={user.role === "ADMIN"}
        role={DB_ROLE[user.role]}
      />
    </div>
  );
}

export default function LabPage() {
  return (
    <>
      <PageHeader
        eyebrow="Query Lab"
        title="The catalog, running live"
        description="Every query, DML statement, constraint proof, routine, trigger demo and Cypher query in the project, run against the real data as your own database role. Writes are rolled back."
      />
      <Suspense
        fallback={
          <div className="mx-auto max-w-7xl px-4 py-8">
            <BlockSkeleton className="h-[32rem]" />
          </div>
        }
      >
        <Lab />
      </Suspense>
    </>
  );
}
