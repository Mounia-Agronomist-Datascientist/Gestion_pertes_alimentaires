import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/modules/auth/next-session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.mustChangePassword) redirect("/mot-de-passe");

  return (
    <div className="flex min-h-dvh flex-col">
      <header
        className="text-white"
        style={{ backgroundColor: user.team?.colorHex ?? "#0f766e" }}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 p-4">
          <Link href="/" className="flex items-center gap-3">
            {user.team && (
              <span
                aria-hidden
                className="flex size-11 items-center justify-center rounded-full bg-white text-2xl font-bold"
                style={{ color: user.team.colorHex }}
              >
                {user.team.letter}
              </span>
            )}
            <span className="text-lg font-semibold leading-tight">{user.displayName}</span>
          </Link>
          <form method="post" action="/deconnexion">
            <button type="submit" className="rounded-xl bg-white/20 px-3 py-2 text-sm font-medium hover:bg-white/30">
              Déconnexion
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 p-4">{children}</main>
    </div>
  );
}
