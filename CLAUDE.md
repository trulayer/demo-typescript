# CLAUDE.md — TypeScript Demos (demo-typescript)

## Project Purpose

End-to-end runnable TypeScript/Node.js examples demonstrating `@trulayer/sdk` integration. Used for developer onboarding, documentation, and SDK integration smoke tests.

## Tech Stack

- Node.js 22+
- pnpm
- TypeScript (strict mode)
- `@trulayer/sdk` — TruLayer TypeScript SDK
- `openai`, `@anthropic-ai/sdk`, `ai` (Vercel AI SDK)
- `tsx` — run TypeScript files directly

## Key Commands

```bash
pnpm install
pnpm example basic-trace         # Run a specific example
pnpm test                        # Run smoke tests (vitest)
pnpm type-check                  # tsc --noEmit
```

## Project Layout

```text
examples/
  basic-trace.ts        → manual trace + span creation
  openai-auto.ts        → OpenAI auto-instrumentation
  rag-pipeline.ts       → multi-span RAG pipeline
  agent.ts              → tool-calling agent tracing
  vercel-ai.ts          → Vercel AI SDK integration
  nextjs-route.ts       → Next.js App Router API route example
  feedback.ts           → submitting feedback on traces
tests/
  smoke.test.ts         → Vitest smoke test: import + run each example
package.json
tsconfig.json
```

## Example Standards

- TypeScript strict mode — no `any`
- Each file exports a `run()` async function and calls it at the bottom: `run().catch(console.error)`
- Module-level JSDoc comment describing what the example demonstrates
- One concept per example file
- Use `TRULAYER_DRY_RUN=true` env var for offline/CI mode

## CI Smoke Tests

`tests/smoke.test.ts` imports `run()` from each example and executes it with:
- `TRULAYER_DRY_RUN=true`
- Mocked provider responses via `vi.mock`

All examples must pass with `pnpm test`.

## CI is gating

Every pull request must pass CI before it can be merged. If CI fails, the engineer who opened the PR owns the fix — not a reviewer, not a follow-up task. Don't merge with failing CI. Don't bypass with `--admin` or `--no-verify`. If a check is flaky, fix it or remove it — don't skip it.

## Public Repository Policy

This repository ships to TruLayer customers. Do not introduce references to internal code, internal repositories (e.g. the TruLayer API service or dashboard), internal planning documents, internal Linear issue content, or internal architectural details. Refer to the platform as "TruLayer" or "the TruLayer API" — not as specific internal components. If in doubt, leave it out.
