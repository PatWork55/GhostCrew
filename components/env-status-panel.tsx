import { serverEnv } from "@/lib/env";
import { StatusPill } from "@/components/status-pill";

export function EnvStatusPanel() {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-glow">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-white/55">
            Project status
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Hackathon-ready baseline</h2>
        </div>
        <StatusPill label={serverEnv.falKey ? "fal configured" : "demo mode active"} tone="success" />
      </div>
      <div className="mt-5 grid gap-4 text-sm text-white/70 md:grid-cols-3">
        <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
          <p className="text-white">App URL</p>
          <p className="mt-2 break-all text-muted">{serverEnv.appUrl}</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
          <p className="text-white">fal usage</p>
          <p className="mt-2 text-muted">
            {serverEnv.falKey
              ? "Server key detected. Generation routes can be added safely."
              : "No key required for the current demo analysis slice."}
          </p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
          <p className="text-white">Preview strategy</p>
          <p className="mt-2 text-muted">
            Original video remains the source of truth while enhanced treatments are layered on top.
          </p>
        </div>
      </div>
    </section>
  );
}
