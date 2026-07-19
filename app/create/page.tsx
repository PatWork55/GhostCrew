import { CreateTutorialForm } from "@/components/create-tutorial-form";
import { SiteHeader } from "@/components/site-header";
import { serverEnv } from "@/lib/env";

export default function CreatePage() {
  return (
    <main className="min-h-screen pb-16">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-10">
        <CreateTutorialForm
          generatedInsertMaxPerTutorial={serverEnv.generatedInsertMaxPerTutorial}
        />
      </div>
    </main>
  );
}
