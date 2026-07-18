import { clsx } from "clsx";

type StatusPillProps = {
  label: string;
  tone?: "neutral" | "success" | "warning";
};

export function StatusPill({ label, tone = "neutral" }: StatusPillProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium",
        tone === "neutral" && "border-white/10 bg-white/5 text-white/80",
        tone === "success" && "border-accent/20 bg-accent/10 text-accent",
        tone === "warning" && "border-amber-400/20 bg-amber-400/10 text-amber-200"
      )}
    >
      {label}
    </span>
  );
}
