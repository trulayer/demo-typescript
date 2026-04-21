# TypeScript Demos — Implementation Tasks

> **Note:** All Phase 1 examples are customer-facing onboarding assets and serve as the first thing a new developer runs. Phase 1 items are at the top; Phase 2 examples follow.

## Status Legend

- [ ] Not started
- [~] In progress
- [x] Done

---

## Phase 1: Core Examples (MVP) ← START HERE

- [x] `package.json` with `@trulayer/sdk`, `openai`, `ai`, `tsx` deps
- [x] `tsconfig.json` (strict mode)
- [x] `examples/basic-trace.ts` — manual trace + span with a simple OpenAI call
- [x] `examples/openai-auto.ts` — `instrumentOpenAI()` with zero manual spans
- [x] `examples/rag-pipeline.ts` — embed → retrieve → generate, 3 spans
- [x] `examples/agent.ts` — tool-calling agent with per-tool spans
- [x] `examples/feedback.ts` — trace then submit feedback

## Phase 2: Advanced Examples

- [x] `examples/vercel-ai.ts` — Vercel AI SDK `streamText` + `generateObject`
- [x] `examples/nextjs-route.ts` — App Router API route with tracing
- [x] `examples/anthropic-auto.ts` — Anthropic auto-instrumentation

## Testing

- [x] `tests/smoke.test.ts` — Vitest smoke tests for all examples (dry-run)
- [x] CI job: run smoke tests on every push
