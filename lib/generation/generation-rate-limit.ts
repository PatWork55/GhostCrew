type GenerationRateLimitEntry = {
  activeCount: number;
  timestamps: number[];
};

const ONE_HOUR_MS = 60 * 60 * 1000;
const ACTIVE_REQUEST_RETRY_AFTER_SECONDS = 15;

declare global {
  var __ghostcrewGenerationRateLimiter__: Map<string, GenerationRateLimitEntry> | undefined;
}

const generationRateLimiterStore =
  globalThis.__ghostcrewGenerationRateLimiter__ ??
  (globalThis.__ghostcrewGenerationRateLimiter__ = new Map());

export class GenerationRateLimitError extends Error {
  constructor(
    message: string,
    readonly retryAfterSeconds: number
  ) {
    super(message);
    this.name = "GenerationRateLimitError";
  }
}

function pruneEntry(entry: GenerationRateLimitEntry, nowMs: number) {
  entry.timestamps = entry.timestamps.filter((timestamp) => nowMs - timestamp < ONE_HOUR_MS);
}

function cleanupEntry(ip: string, entry: GenerationRateLimitEntry, nowMs: number) {
  pruneEntry(entry, nowMs);

  if (entry.activeCount <= 0 && entry.timestamps.length === 0) {
    generationRateLimiterStore.delete(ip);
  } else {
    generationRateLimiterStore.set(ip, entry);
  }
}

export function getClientIpAddress(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function reserveGeneratedInsertSlot(
  ip: string,
  hourlyLimit: number,
  nowMs = Date.now()
) {
  const entry = generationRateLimiterStore.get(ip) ?? {
    activeCount: 0,
    timestamps: []
  };

  pruneEntry(entry, nowMs);

  if (entry.activeCount > 0) {
    throw new GenerationRateLimitError(
      "A supplementary-view generation request from this network is already in progress. Wait for it to finish before trying again.",
      ACTIVE_REQUEST_RETRY_AFTER_SECONDS
    );
  }

  if (entry.timestamps.length >= hourlyLimit) {
    const retryAfterMs = Math.max(1, ONE_HOUR_MS - (nowMs - (entry.timestamps[0] ?? nowMs)));

    throw new GenerationRateLimitError(
      "This demo has already processed the maximum number of supplementary-view generation requests from this network in the last hour. Try again later.",
      Math.ceil(retryAfterMs / 1000)
    );
  }

  entry.activeCount += 1;
  entry.timestamps.push(nowMs);
  generationRateLimiterStore.set(ip, entry);

  return (releaseNowMs = Date.now()) => {
    const currentEntry = generationRateLimiterStore.get(ip);

    if (!currentEntry) {
      return;
    }

    currentEntry.activeCount = Math.max(0, currentEntry.activeCount - 1);
    cleanupEntry(ip, currentEntry, releaseNowMs);
  };
}
