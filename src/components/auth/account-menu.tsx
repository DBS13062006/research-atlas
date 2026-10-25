import { BookMarked, LogIn, LogOut, Route, Settings, Shield, UserRound } from "lucide-react";
import Link from "next/link";
import { logoutAction } from "@/app/(auth)/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { atLeast, ROLE_LABEL } from "@/lib/roles";
import { getCurrentUser } from "@/server/auth/dal";

export async function AccountMenu() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <Button size="sm" nativeButton={false} render={<Link href="/login" />}>
        <LogIn className="size-4" aria-hidden />
        Sign in
      </Button>
    );
  }
  const links = [
    { href: "/library", label: "Library", icon: BookMarked },
    { href: "/trails", label: "Reading trails", icon: Route },
    ...(atLeast(user.role, "CURATOR") ? [{ href: "/curate", label: "Curate", icon: Settings }] : []),
    ...(user.role === "ADMIN" ? [{ href: "/admin", label: "Admin", icon: Shield }] : []),
    { href: "/account", label: "Account", icon: UserRound },
  ];
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" aria-label={`Account menu for ${user.name}`}>
            <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden max-w-32 truncate sm:inline">{user.name}</span>
          </Button>
        }
      />
      <PopoverContent align="end" className="w-60 p-2">
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          <Badge variant="secondary" className="mt-2" data-testid="role-badge">
            {ROLE_LABEL[user.role]}
          </Badge>
        </div>
        <nav className="mt-1 border-t pt-1" aria-label="Account">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            >
              <l.icon className="size-4 text-muted-foreground" aria-hidden />
              {l.label}
            </Link>
          ))}
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
            >
              <LogOut className="size-4 text-muted-foreground" aria-hidden />
              Sign out
            </button>
          </form>
        </nav>
      </PopoverContent>
    </Popover>
  );
}
