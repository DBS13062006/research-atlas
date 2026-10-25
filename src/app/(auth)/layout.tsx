import type { ReactNode } from "react";
import { CompassMark } from "@/components/compass-mark";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="topo flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm">
        <CompassMark className="mx-auto size-10" />
        {children}
      </div>
    </div>
  );
}
