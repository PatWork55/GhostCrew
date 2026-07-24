# GhostCrew

Film once. Teach clearly.

GhostCrew turns one rough phone recording of a simple physical task into a clearer tutorial. The app analyzes selected frames from the clip, builds a structured storyboard, derives a direct-video-backed production plan, applies deterministic instructional treatments to the original footage, optionally adds one explicitly approved AI-generated supplementary view, and can render a downloadable MP4 with subtitles and optional TTS narration.

## Problem

Short how-to videos are often filmed once, handheld, and without narration. Important steps happen too quickly, key details are small in frame, and orientation changes are easy to miss.

## Solution

GhostCrew behaves like an AI instructional director:

- understand the task being shown
- segment it into 3 to 6 steps
- detect what the viewer may miss
- recommend the right treatment for each step
- keep the original footage as the source of truth

## Target Users

- artisans
- teachers
- makers
- small business owners
- content creators
- anyone explaining a simple, non-dangerous physical task

## Key Innovation

GhostCrew is not just an editor and not a full generative-video system. It uses a hybrid approach:

- original source footage for factual actions
- deterministic crops, slow motion, freeze frames, and annotations for clarity
- one optional AI-generated supplementary view only when the source footage is not enough

## Feature Set

- landing page and upload flow
- browser-side video metadata extraction
- browser-side frame extraction and frame review
- strict request validation and payload-size enforcement
- server-side multimodal instructional analysis
- demo fallback analysis
- editable storyboard with confidence and evidence frames
- deterministic render-plan generation
- browser-based enhanced tutorial playback
- crop close-up, slow motion, freeze frame, and annotation treatments
- explicit fal-powered supplementary still generation with accept/reject review
- direct-video production planning with extracted source segments
- editable narration draft, source-audio mix selection, and subtitle timing
- deterministic MP4 export plus downloadable process report
- before/after comparison view

## Architecture

```mermaid
flowchart TD
  A[Upload short MP4 or WebM] --> B[Browser preprocessing]
  B --> B1[Read metadata]
  B --> B2[Extract 5 to 10 resized frames]
  B2 --> B3[User keeps 3 to 10 selected frames]
  B3 --> C[POST /api/analyze]
  C --> D[Validate JSON size and decoded image payload]
  D --> E[Safety screening]
  E --> F{Real fal analysis available?}
  F -->|Yes| G[fal vision provider]
  F -->|No or failure with fallback enabled| H[demo provider]
  G --> I[Safe JSON parse plus repair]
  H --> J[Validated storyboard]
  I --> J
  J --> K[Chronology and treatment post-processing]
  K --> L[Editable storyboard]
  L --> M[Serializable browser render plan]
  M --> N[Browser enhanced player]
  L --> O[POST /api/generate-insert]
  O --> P[Server validation and rate limiting]
  P --> Q[fal image edit provider]
  Q --> R[Accept or reject review]
  R -->|Accept| M
  R -->|Reject or fail| S[Keep deterministic fallback]
  L --> T[POST /api/production-plan]
  T --> U[Direct video understanding plus source segment extraction]
  U --> V[Validated production plan]
  V --> W[Production workspace]
  W --> X[POST /api/export]
  X --> Y[TTS or subtitles-only fallback]
  Y --> Z[ffmpeg MP4 render plus report]
  Z --> AA[Download API routes]
```

## AI Workflow

1. The browser reads source-video metadata and extracts representative frames with native `video` and `canvas` APIs.
2. The user selects the frames that best represent the task.
3. `POST /api/analyze` validates the request, enforces size limits, screens for unsafe tasks, and calls either the real fal analysis provider or the demo fallback.
4. The validated storyboard is editable in the UI.
5. The browser builds a strict render plan from the storyboard plus source-video metadata for deterministic preview playback.
6. The enhanced player reuses the original video as the factual source and applies deterministic treatments.
7. If the user explicitly requests one generated insert, `POST /api/generate-insert` validates the selected evidence frame, rate-limits the request, and asks fal for a supplementary still image.
8. The user must accept that result before it enters preview playback.
9. `POST /api/production-plan` validates the same uploaded video, optionally calls fal direct video understanding, extracts source clips, and returns a chronological production plan.
10. The production workspace lets the user inspect segment clips, choose a voice, choose source-audio behavior, and edit narration lines derived from narration-safe visual facts.
11. `POST /api/export` renders a downloadable MP4 and JSON report. If TTS is unavailable or fails, GhostCrew preserves the visual timeline and exports subtitles only.

## fal Models

### Analysis

- Endpoint ID: `openrouter/router/vision`
- Model ID: `google/gemini-2.5-flash`
- Purpose: multimodal step inference over ordered evidence frames

Why it was selected:

- official fal vision endpoint with multi-image support
- low-latency fit for frame-based instructional analysis
- returns usage metadata for cost tracking

Official references:

- https://fal.ai/models/openrouter/router/vision/api
- https://fal.ai/docs/model-api-reference/vision-api/openrouter-router

### Supplementary Insert

- Endpoint ID: `fal-ai/nano-banana-2/edit`
- Model ID: `fal-ai/nano-banana-2/edit`
- Purpose: generate one supplementary explanatory still from an evidence frame

Why it was selected:

- official reference-image editing workflow
- accepts `image_urls`, including base64 Data URIs
- predictable 1K still-image pricing
- reliable hosted output URL for browser playback

Official references:

- https://fal.ai/models/fal-ai/nano-banana-2/edit/api
- https://fal.ai/models/fal-ai/nano-banana-2/edit

Researched but intentionally not integrated:

- `fal-ai/kling-video/o3/standard/image-to-video`

### Direct Video Understanding

- Endpoint ID: `fal-ai/video-understanding`
- Purpose: analyze the uploaded source clip during production planning and improve segment extraction, pacing, and narration-safe facts

Why it was selected:

- processes the full uploaded video instead of only selected frames
- improves chronology and “too fast / too small” detection for the export path
- can fail safely into a deterministic frame-based fallback

### Narration TTS

- Endpoint ID: `fal-ai/elevenlabs/tts/eleven-v3`
- Purpose: synthesize optional narration audio and word timestamps for subtitle cueing during export

Why it was selected:

- hosted audio URL returned by the provider
- word-level timestamp support for synchronized subtitles
- same server-side fal credential flow as the other providers

## Official Parameters Used

### Analysis request to fal

- `model`
- `prompt`
- `system_prompt`
- `image_urls`
- `temperature`
- `max_tokens`
- `reasoning`

### Supplementary-image request to fal

- `prompt`
- `system_prompt`
- `image_urls`
- `num_images`
- `aspect_ratio`
- `output_format`
- `resolution`
- `safety_tolerance`
- `limit_generations`

### Direct-video-understanding request to fal

- `video_url`
- `prompt`
- `detailed_analysis`

### TTS request to fal

- `text`
- `voice`
- `stability`
- `speed`
- `language_code`
- `timestamps`
- `output_format`
- `previous_text`
- `next_text`

## Supported Inputs And Limits

Video constraints:

- formats: `video/mp4`, `video/webm`
- duration: `10` to `45` seconds
- max upload size: `80 MB`

Frame constraints:

- extracted review frames: `5` to `10`
- selected analysis frames: `3` to `10`
- max extracted frame dimension: `640px`
- frame MIME types: `image/webp`, `image/jpeg`
- decoded selected-frame aggregate: at most `2.5 MB`
- estimated serialized `/api/analyze` request size: at most approximately `4 MB`

Generated-insert constraints:

- one accepted generated insert per tutorial by default
- optionally two only through explicit server configuration
- max reference-frame payload: `2 MB`
- max intent length: `180` characters
- image generation only in this version

Narration and export constraints:

- supported default voices: `Rachel`, `Aria`, `Sarah`, `Laura`, `Roger`
- max narration segment text: `320` characters
- subtitle cue target: at most `6` words and `42` characters per cue
- max subtitle lines in export burn-in: `2`
- final render target: `30 fps` MP4 with `44.1 kHz` audio

The client estimates request size before submission and blocks oversized analysis requests with a clear “select fewer frames” message. The API independently validates the decoded payload and request-body size.

## Rendering Layer

The enhanced preview is built from a serializable render plan. Each segment stores:

- source timing
- output timing
- selected treatment
- playback rate
- normalized crop coordinates
- optional freeze-frame timing
- normalized annotations
- subtitle text
- generated-insert state and fallback metadata

Supported treatments:

- `keep_original`
- `crop_close_up`
- `slow_motion`
- `freeze_frame`
- `annotation`
- `generated_insert`

Current treatment notes:

- `slow_motion` uses playback-rate slowdown, not AI interpolation
- `crop_close_up` uses deterministic CSS transforms, not tracking
- `generated_insert` falls back to deterministic playback until a result is accepted

## Production Plan And Export Layer

The second stage turns the storyboard into a deterministic final edit:

- `POST /api/production-plan` validates the same source file, optionally calls `fal-ai/video-understanding`, extracts per-segment source clips, and returns a chronological production plan
- the production workspace lets the user inspect segment clips, change voice, choose source-audio handling, and edit narration lines
- `POST /api/export` renders a downloadable MP4 plus JSON process report with bundled `ffmpeg-static` and `ffprobe-static`
- if TTS is unavailable or fails, GhostCrew preserves the visual timeline and exports subtitles only

## Safety And Fallback Strategy

Rejected or flagged categories:

- medical procedures
- self-harm
- weapons
- electrical repair
- dangerous machinery
- illegal activity
- hazardous chemicals

Operational fallbacks:

- analysis provider fails and fallback enabled: return demo storyboard with a warning
- image generation fails: keep deterministic fallback
- generated media fails to load: keep deterministic fallback
- user rejects generated result: keep deterministic fallback
- generation service disabled: return controlled `503`
- generation rate limited: return controlled `429` plus `Retry-After`

Labels shown in the product:

- `AI analysis`
- `Demo fallback`
- `Direct video AI`
- `Direct video fallback`
- `AI-generated supplementary view`
- `Original source footage`

## Production Environment Variables

Copy `.env.example` to `.env.local` for local work or configure these in Vercel:

```bash
FAL_KEY=
FAL_VISION_ENDPOINT_ID=openrouter/router/vision
FAL_VISION_MODEL=google/gemini-2.5-flash
FAL_IMAGE_EDIT_ENDPOINT_ID=fal-ai/nano-banana-2/edit
FAL_IMAGE_EDIT_MODEL=fal-ai/nano-banana-2/edit
FAL_TTS_ENDPOINT_ID=fal-ai/elevenlabs/tts/eleven-v3
FAL_TTS_DEFAULT_VOICE=Rachel
ANALYSIS_FALLBACK_ENABLED=true
GENERATED_INSERTS_ENABLED=false
GENERATED_INSERT_MAX_PER_TUTORIAL=1
GENERATION_RATE_LIMIT_PER_HOUR=4
NEXT_PUBLIC_DEMO_MODE=true
```

Notes:

- `FAL_KEY` is server-only.
- `ANALYSIS_FALLBACK_ENABLED` controls whether analysis falls back to the demo provider.
- `FAL_TTS_ENDPOINT_ID` controls narration synthesis during export.
- `FAL_TTS_DEFAULT_VOICE` sets the default production-workspace voice.
- `GENERATED_INSERTS_ENABLED` is the emergency kill switch for paid image generation.
- `GENERATED_INSERT_MAX_PER_TUTORIAL` supports `1` or `2`.
- `GENERATION_RATE_LIMIT_PER_HOUR` controls a best-effort per-IP in-memory limiter.
- `NEXT_PUBLIC_DEMO_MODE` is UI-safe and exposes no secret.
- If `FAL_KEY` is unset, direct video understanding falls back to the frame-based planner and export remains subtitles-only.

## Deployment Notes

GhostCrew is ready for a standard Vercel deployment, with ephemeral export storage by default:

- Next.js App Router application
- Node runtime for the analysis, generation, production-plan, and export routes
- source-segment extraction and final export use the server temp directory during rendering
- production assets and export download URLs are held in per-instance in-memory registries
- no dependency on the ignored local `.tools` directory in production
- fal requests stay server-side
- generated media and TTS audio use hosted URLs returned by providers

Route runtime settings:

- `app/api/analyze/route.ts`: `runtime = "nodejs"`, `maxDuration = 60`
- `app/api/generate-insert/route.ts`: `runtime = "nodejs"`, `maxDuration = 60`
- `app/api/production-plan/route.ts`: `runtime = "nodejs"`, `maxDuration = 120`
- `app/api/export/route.ts`: `runtime = "nodejs"`, `maxDuration = 240`

Vercel deployment steps:

1. Push the repository to GitHub.
2. Import the repository into Vercel.
3. Set the framework preset to Next.js if Vercel does not detect it automatically.
4. Add the production environment variables listed above.
5. Set `GENERATED_INSERTS_ENABLED=false` for the first deployment if you want a safer no-credit launch, then enable it after a quick smoke test.
6. Deploy.
7. Run one production smoke test for analysis, one production-plan/export smoke test, and, if desired, one explicit generated-insert test.

Best-effort rate-limiting note:

- the generated-insert limiter is in-memory and per-instance
- this is suitable for a hackathon demo but not a durable multi-instance quota system
- `GENERATED_INSERTS_ENABLED` is the emergency server-side kill switch

Export durability note:

- production asset URLs and exported MP4/report URLs are instance-local and ephemeral
- for durable multi-instance production, replace the in-memory registries with object storage

## Observed Latency And Cost

Observed during live smoke tests on Sunday, July 19, 2026:

- Gemini analysis latency: approximately `5.1s`
- analysis cost: approximately `$0.002` per request
- Nano Banana image-edit estimate: approximately `$0.08` per `1K` image
- total successful observed spend during development: approximately `$0.164`

## Demo Flow

1. Open `/create`.
2. Upload a short MP4 or WebM clip.
3. Wait for metadata and frame extraction.
4. Keep 3 to 5 representative frames selected.
5. Enter the task title and optional description.
6. Run analysis.
7. Review and edit the storyboard.
8. Compare the original clip with the enhanced preview.
9. For one `generated_insert` step, optionally request a supplementary view, review it, and accept or reject it.
10. Build the production plan from the same source video.
11. Review segment clips, direct-video warnings, voice choice, source-audio mode, and narration lines.
12. Render the final MP4 and download the export report.

## Local Development

Use Node.js 20 or newer.

```bash
npm install
npm run dev
```

Verification:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Local production smoke:

```bash
npm run build
npm run start
```

## Known Limitations

- the first storyboard pass is still frame-based; full-video understanding is only used later during production planning when available
- no persistent project storage or durable exported-asset hosting is included yet
- no background music, soundtrack design, or multi-voice narration
- no object tracking or 3D reconstruction
- browser codec support still governs local preview playback
- generated supplementary views are explanatory only and not physically authoritative
- the generation limiter, production-asset registry, and export registry are best-effort in-memory mechanisms in serverless environments

## Screenshot Placeholders

- `docs/screenshots/landing.png` to be added
- `docs/screenshots/create-flow.png` to be added
- `docs/screenshots/storyboard.png` to be added
- `docs/screenshots/enhanced-preview.png` to be added

## Hackathon Statement

GhostCrew was built from scratch during the fal × Sequoia 72-Hour Video Hackathon. No code, prompts, assets, media, components, designs, or repositories from earlier projects were reused.

## License

MIT
