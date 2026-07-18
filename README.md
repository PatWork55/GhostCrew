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
- Structured step detection with strict JSON output
- Editable storyboard cards
- AI-director treatment recommendations
- Crops, slow motion, freeze frames, subtitles, and narration
- Optional fal-powered supplementary visual generation with graceful fallback

## Architecture

```text
Next.js App Router UI
  -> Client upload + storyboard state
  -> Server API routes for analysis and generation
  -> Shared validation and AI-director rules
  -> Preview/export pipeline
```

## AI workflow

1. Accept a short source video and task metadata.
2. Analyze the source into 3 to 6 instructional steps.
3. Validate AI output against a strict schema.
4. Apply rule-based treatment selection for each step.
5. Assemble an enhanced tutorial preview.
6. Optionally generate one or two supplementary inserts.

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
npm run lint
npm run typecheck
npm run build
```

## Demo instructions

1. Open `/create`.
2. Upload a 10 to 45 second MP4 or WebM clip.
3. Enter the task title and optional teaching context.
4. Start analysis to generate a structured demo storyboard.
5. Edit the detected steps and review the lightweight enhanced preview.

## Limitations

- No persistent storage yet
- No fal integration yet
- No final export yet
- Analysis is currently a validated demo endpoint, not a real multimodal video-understanding model
- Visual treatments are planned and previewed, but crop/slow-motion/freeze-frame rendering is not implemented yet

## Safety principles

- Focus on simple, non-dangerous tasks
- Keep original footage as the source of truth for critical actions
- Treat generated media as supplementary explanation only
- Fail gracefully when analysis or generation is unavailable

## Hackathon statement

GhostCrew is being built from scratch during the fal × Sequoia 72-Hour Video Hackathon. No code, assets, prompts, media, components, designs, or repositories from previous projects are being reused.

## License

MIT
