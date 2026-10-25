import type { Metadata } from "next";
import { SignupForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Create an account" };

export default function SignupPage() {
  return (
    <>
      <h1 className="mt-4 text-center text-3xl">Create an account</h1>
      <p className="mb-6 mt-1 text-center text-sm text-muted-foreground">
        New accounts start as researchers: collections, notes, trails and curated relations.
      </p>
      <SignupForm />
    </>
  );
}
