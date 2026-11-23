import Link from "next/link";
import { logOut } from "@/auth/actions";
import { Button } from "@/components/ui/button";

export function AppHeader({ title, email, links = [] }: {
  title: string;
  email: string;
  links?: { href: string; label: string }[];
}) {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
        <span className="font-semibold">{title}</span>
        <nav className="flex flex-1 gap-4 text-sm">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-muted-foreground hover:text-foreground">
              {l.label}
            </Link>
          ))}
        </nav>
        <span className="hidden text-sm text-muted-foreground sm:inline">{email}</span>
        <form action={logOut}>
          <Button variant="outline" size="sm" type="submit">
            Log out
          </Button>
        </form>
      </div>
    </header>
  );
}
