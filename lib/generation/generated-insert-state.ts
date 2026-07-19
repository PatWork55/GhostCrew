import { GENERATED_INSERT_LIMITS } from "@/lib/constants";
import type { GeneratedInsertRenderState } from "@/lib/generation/generated-insert-schema";

export function isGeneratedInsertBusy(
  status: GeneratedInsertRenderState["status"] | undefined
) {
  return ["uploading_reference", "queued", "generating_image", "generating_video"].includes(
    status ?? ""
  );
}

export function canStartGeneratedInsert(input: {
  status: GeneratedInsertRenderState["status"] | undefined;
  acceptedInsertCount: number;
  maxAcceptedInsertsPerTutorial?: number;
  sessionGenerationCount: number;
}) {
  const maxAccepted =
    input.maxAcceptedInsertsPerTutorial ??
    GENERATED_INSERT_LIMITS.defaultMaxAcceptedInsertsPerTutorial;

  if (isGeneratedInsertBusy(input.status)) {
    return false;
  }

  if (input.acceptedInsertCount >= maxAccepted) {
    return false;
  }

  return input.sessionGenerationCount < GENERATED_INSERT_LIMITS.maxGenerationRequestsPerTutorial;
}

export function canRegenerateGeneratedInsert(input: {
  status: GeneratedInsertRenderState["status"] | undefined;
  attemptCount: number;
}) {
  return (
    !isGeneratedInsertBusy(input.status) &&
    input.attemptCount < GENERATED_INSERT_LIMITS.maxGenerationRequestsPerTutorial
  );
}

export function shouldUseAcceptedGeneratedImage(
  state: GeneratedInsertRenderState | undefined,
  hasLoadFailure: boolean
) {
  return Boolean(
    state?.status === "completed" &&
      state.mediaType === "image" &&
      state.mediaUrl &&
      !hasLoadFailure
  );
}
