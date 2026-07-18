import Link from "next/link";
import { PROJECT } from "@/lib/constants";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-white/8 bg-black/30 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10">
        <Link href="/" className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 text-sm font-semibold text-accent">
            GC
          </span>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-white/90">
              {PROJECT.name}
            </p>
            <p className="text-xs text-muted">{PROJECT.tagline}</p>
          </div>
        </Link>
        <nav className="flex items-center gap-3 text-sm text-white/70">
          <Link
            href="/#workflow"
            className="rounded-full border border-white/10 px-4 py-2 transition hover:border-white/20 hover:text-white"
          >
            Workflow
          </Link>
          <Link
            href="/create"
            className="rounded-full bg-accent px-4 py-2 font-medium text-black transition hover:bg-accent/90"
          >
            Create a tutorial
          </Link>
        </nav>
      </div>
    </header>
  );
}
