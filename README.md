# GhostCrew

Film once. Teach clearly.

## Problem

Simple physical tasks are often recorded in one rough phone take that is hard to follow. Important hand movements can be too fast, too small, or badly framed.

## Solution

GhostCrew turns a single rough recording into a clearer tutorial by detecting instructional steps, recommending visual treatments, and assembling an enhanced preview before export.

## Target users

- Artisans
- Teachers
- Makers
- Small business owners
- Content creators
- Anyone documenting a simple non-dangerous physical task

## Planned feature set

- Short-video upload and validation
- Browser-side video metadata extraction
- Browser-side representative frame extraction and selection
- Structured step detection with strict JSON output
- Editable storyboard cards
- AI-director treatment recommendations
- Crops, slow motion, freeze frames, subtitles, and narration
- Optional fal-powered supplementary visual generation with graceful fallback

## Architecture

```text
Next.js App Router UI
  -> Client upload + source-video preprocessing state
  -> Server API routes for analysis and generation
  -> Shared validation and AI-director rules
  -> Preview/export pipeline
```

## AI workflow

1. Accept a short source video and task metadata.
2. Extract validated metadata and 5 to 10 representative frames in the browser.
3. Send only the selected frames and source-video metadata to the analysis route.
4. Validate AI output against a strict schema.
5. Apply rule-based treatment selection for each step.
6. Assemble an enhanced tutorial preview.

## fal models used

To be finalized after inspecting current official fal documentation during integration work. No model is wired in Phase 1.

## Environment variables

Create a `.env.local` file based on `.env.example`.

```bash
FAL_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_DEMO_MODE=true
```

## Local development

Use Node.js 20 or newer.

Install dependencies:

```bash
npm install
```

Run development server:

```bash
npm run dev
```

Run checks:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

## Demo instructions

1. Open `/create`.
2. Upload a 10 to 45 second MP4 or WebM clip up to 80 MB.
3. Wait for browser-side metadata extraction and representative frame extraction.
4. Review the extracted film strip, unselect or remove irrelevant frames, and optionally re-extract.
5. Enter the task title and optional teaching context.
6. Start analysis to generate a structured demo storyboard.
7. Edit the detected steps and review the lightweight enhanced preview.

## Browser-side preprocessing

- Metadata is extracted locally with native browser `video` APIs.
- Representative frames are extracted locally with native `video` + `canvas` APIs.
- GhostCrew extracts between 5 and 10 resized frames per clip.
- The extracted timestamps are distributed across the full clip and always include frames near the beginning and end.
- Frames are encoded as JPEG or WebP data URLs after resizing to a maximum dimension of 640px.

## Supported video constraints

- Formats: MP4 and WebM
- Duration: 10 to 45 seconds
- Upload size: up to 80 MB
- Focus: simple, non-dangerous physical tasks for the hackathon MVP

## Frame selection strategy

- Initial frame timestamps are generated from the validated clip duration.
- Extracted frames are selected by default.
- Users can unselect frames to keep them out of the future model request.
- Users can remove clearly irrelevant frames from the film strip.
- Users can re-run extraction if the first pass is not satisfactory.

## Why raw video is not yet sent to the server

- Raw uploads are heavier, slower, and more fragile for the current MVP.
- The next milestone only needs structured metadata plus representative visual context.
- Keeping preprocessing in the browser reduces server complexity while the real multimodal analysis path is still being built.

## Limitations

- No persistent storage yet
- No fal integration yet
- No final export yet
- Analysis is currently a validated demo endpoint, not a real multimodal video-understanding model
- Visual treatments are planned and previewed, but crop/slow-motion/freeze-frame rendering is not implemented yet
- Browser-side extraction depends on the local browser's codec support for MP4/WebM playback
- Exact seek timestamps can vary slightly by browser and codec because extraction uses native video seeking

## Known browser limitations

- Some browsers may decode WebM and MP4 differently depending on installed codecs.
- Native seek precision can land slightly off the requested timestamp, especially around keyframes.
- Large source clips can use noticeable memory during local extraction, which is why the current MVP limits duration, size, and frame dimensions.

## Safety principles

- Focus on simple, non-dangerous tasks
- Keep original footage as the source of truth for critical actions
- Treat generated media as supplementary explanation only
- Fail gracefully when analysis or generation is unavailable

## Hackathon statement

GhostCrew is being built from scratch during the fal × Sequoia 72-Hour Video Hackathon. No code, assets, prompts, media, components, designs, or repositories from previous projects are being reused.

## License

MIT
