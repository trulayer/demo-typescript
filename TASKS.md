# TypeScript Demos — Implementation Tasks

## Status Legend

- [ ] Not started
- [~] In progress
- [x] Done

---

## Phase 1: Core Examples (MVP)

- [ ] `package.json` with `@trulayer/sdk`, `openai`, `ai`, `tsx` deps
- [ ] `tsconfig.json` (strict mode)
- [ ] `examples/basic-trace.ts` — manual trace + span with a simple OpenAI call
- [ ] `examples/openai-auto.ts` — `instrumentOpenAI()` with zero manual spans
- [ ] `examples/rag-pipeline.ts` — embed → retrieve → generate, 3 spans
- [ ] `examples/agent.ts` — tool-calling agent with per-tool spans
- [ ] `examples/feedback.ts` — trace then submit feedback

## Phase 2: Advanced Examples

- [ ] `examples/vercel-ai.ts` — Vercel AI SDK `streamText` + `generateObject`
- [ ] `examples/nextjs-route.ts` — App Router API route with tracing
- [ ] `examples/anthropic-auto.ts` — Anthropic auto-instrumentation

## Testing

- [ ] `tests/smoke.test.ts` — Vitest smoke tests for all examples (dry-run)
- [ ] CI job: run smoke tests on every push
