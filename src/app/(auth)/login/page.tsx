import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Sign in" };

async function Form({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <LoginForm next={next} />;
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <>
      <h1 className="mt-4 text-center text-3xl">Welcome back</h1>
      <p className="mb-6 mt-1 text-center text-sm text-muted-foreground">
        Sign in to your library and trails.
      </p>
      <Suspense fallback={<LoginForm />}>
        <Form searchParams={searchParams as Promise<{ next?: string }>} />
      </Suspense>
    </>
  );
}
