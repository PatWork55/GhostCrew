import Link from "next/link";
import { EnvStatusPanel } from "@/components/env-status-panel";
import { SiteHeader } from "@/components/site-header";
import { PROJECT } from "@/lib/constants";

const workflow = [
  {
    title: "Capture once",
    description: "Record a rough single-camera phone clip while performing a simple physical task."
  },
  {
    title: "Understand the steps",
    description:
      "GhostCrew detects the instructional sequence, viewer confusion risks, and the moments that need help."
  },
  {
    title: "Direct the tutorial",
    description:
      "The AI director chooses the best treatment: original footage, crop, slow motion, freeze frame, annotation, or a supplementary insert."
  }
];

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-hero-grid opacity-90" />
        <div className="relative mx-auto max-w-7xl px-6 py-20 lg:px-10 lg:py-24">
          <div className="grid items-center gap-10 xl:grid-cols-[1.08fr_0.92fr]">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.34em] text-accent">
                fal × Sequoia Video Hackathon
              </p>
              <h1 className="mt-5 max-w-4xl text-5xl font-semibold tracking-tight text-white md:text-7xl">
                {PROJECT.name}
              </h1>
              <p className="mt-4 text-2xl text-white/82 md:text-3xl">{PROJECT.tagline}</p>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-white/66">
                One rough phone recording becomes a clear tutorial. GhostCrew analyzes a simple
                physical task, structures the steps, and decides how to make each moment easier to
                understand.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  href="/create"
                  className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-black transition hover:bg-accent/90"
                >
                  Create a tutorial
                </Link>
                <Link
                  href="/create"
                  className="rounded-full border border-white/12 px-6 py-3 text-sm text-white/78 transition hover:border-white/22 hover:text-white"
                >
                  Open the demo workflow
                </Link>
              </div>
            </div>
            <div className="rounded-[36px] border border-white/10 bg-black/35 p-6 shadow-glow">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
                  <p className="text-sm uppercase tracking-[0.3em] text-white/45">Before</p>
                  <div className="mt-4 aspect-[4/5] rounded-[24px] border border-dashed border-white/12 bg-black/30 p-4">
                    <div className="h-full rounded-[20px] border border-white/8 bg-gradient-to-b from-white/8 to-transparent p-4">
                      <p className="text-lg font-semibold text-white">Rough source clip</p>
                      <ul className="mt-5 space-y-3 text-sm text-white/62">
                        <li>Single phone angle</li>
                        <li>No narration</li>
                        <li>Small hinge detail</li>
                        <li>One fast locking motion</li>
                      </ul>
                    </div>
                  </div>
                </div>
                <div className="rounded-[28px] border border-accent/16 bg-accent/8 p-5">
                  <p className="text-sm uppercase tracking-[0.3em] text-accent">After</p>
                  <div className="mt-4 aspect-[4/5] rounded-[24px] border border-accent/14 bg-black/25 p-4">
                    <div className="flex h-full flex-col rounded-[20px] border border-white/8 bg-gradient-to-b from-white/8 to-transparent p-4">
                      <p className="text-lg font-semibold text-white">Directed tutorial</p>
                      <div className="mt-5 space-y-3 text-sm text-white/70">
                        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
                          Step 1: annotate the base
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
                          Step 2: crop into the hinge
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
                          Step 3: slow down the lock
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
                          Step 4: freeze on final angle
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="workflow" className="mx-auto max-w-7xl px-6 py-12 lg:px-10">
        <div className="grid gap-6 md:grid-cols-3">
          {workflow.map((item, index) => (
            <article
              key={item.title}
              className="rounded-[30px] border border-white/10 bg-white/5 p-6 transition hover:border-white/16"
            >
              <p className="text-sm uppercase tracking-[0.28em] text-accent">0{index + 1}</p>
              <h2 className="mt-4 text-2xl font-semibold text-white">{item.title}</h2>
              <p className="mt-3 text-base leading-7 text-white/65">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-20 lg:px-10">
        <EnvStatusPanel />
      </section>
    </main>
  );
}
