/**
 * End-to-end smoke tests — imports each example (which auto-runs via
 * `run().catch(console.error)` at module scope) and validates the
 * payloads that arrive at a local mock ingestion server.
 *
 * Runs in TRULAYER_DRY_RUN=true mode so no provider API keys are
 * required. Tests are deterministic and offline.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getReceived, startMockServer, type RunningMockServer } from '../examples/mock-server.ts'

let server: RunningMockServer

beforeAll(async () => {
  process.env.TRULAYER_DRY_RUN = 'true'
  process.env.TRULAYER_DEMO_MOCK = '1'
  process.env.TRULAYER_API_KEY = 'tl_test'
  process.env.TRULAYER_PROJECT_NAME = 'test-project'
})

beforeEach(async () => {
  server = await startMockServer()
  process.env.TRULAYER_ENDPOINT = server.url
})

afterEach(async () => {
  await server.close()
})

afterAll(() => {
  delete process.env.TRULAYER_DRY_RUN
  delete process.env.TRULAYER_DEMO_MOCK
  delete process.env.TRULAYER_ENDPOINT
})

function allTraces() {
  return getReceived().batches.flatMap((b) => (b.traces ?? []) as Array<Record<string, unknown>>)
}

describe('demo examples', () => {
  it('basic-trace emits a trace with retrieval + llm spans', async () => {
    const { run } = await import('../examples/basic-trace.ts')
    await run()

    const traces = allTraces()
    expect(traces.length).toBeGreaterThanOrEqual(1)
    const t = traces[traces.length - 1]!
    expect(t.project_id).toBe('test-project')
    expect(t.tags).toEqual(expect.arrayContaining(['demo', 'basic-trace']))
    const spans = t.spans as Array<{ name: string; span_type: string }>
    expect(spans.map((s) => s.name)).toEqual(
      expect.arrayContaining(['retrieve-context', 'openai.chat']),
    )
    expect(spans.find((s) => s.name === 'openai.chat')?.span_type).toBe('llm')
  })

  it('openai-auto emits one trace per question with an openai.chat span', async () => {
    const { run } = await import('../examples/openai-auto.ts')
    const ids = await run()

    const traces = allTraces()
    expect(traces.length).toBeGreaterThanOrEqual(ids.length)
    // Check the last N traces (from our explicit run() call)
    const recentTraces = traces.slice(-ids.length)
    for (const t of recentTraces) {
      const spans = t.spans as Array<{ name: string }>
      expect(spans.some((s) => s.name === 'openai.chat')).toBe(true)
    }
  })

  it('langchain-chain emits a trace with a langchain.llm span', async () => {
    const { run } = await import('../examples/langchain-chain.ts')
    await run()

    const traces = allTraces()
    expect(traces.length).toBeGreaterThanOrEqual(1)
    const spans = traces[traces.length - 1]!.spans as Array<{ name: string; span_type: string }>
    const lc = spans.find((s) => s.name === 'langchain.llm')
    expect(lc).toBeDefined()
    expect(lc?.span_type).toBe('llm')
  })

  it('anthropic-auto emits a trace with an anthropic.messages span', async () => {
    const { run } = await import('../examples/anthropic-auto.ts')
    await run()

    const traces = allTraces()
    expect(traces.length).toBeGreaterThanOrEqual(1)
    const spans = traces[traces.length - 1]!.spans as Array<{ name: string }>
    expect(spans.some((s) => s.name === 'anthropic.messages')).toBe(true)
  })

  it('rag-pipeline emits a 3-stage trace', async () => {
    const { run } = await import('../examples/rag-pipeline.ts')
    await run()

    const traces = allTraces()
    expect(traces.length).toBeGreaterThanOrEqual(1)
    const names = (traces[traces.length - 1]!.spans as Array<{ name: string }>).map((s) => s.name)
    expect(names).toEqual(expect.arrayContaining(['embed-query', 'retrieve-docs', 'generate-answer']))
  })

  it('agent emits tool spans and an llm span', async () => {
    const { run } = await import('../examples/agent.ts')
    await run()

    const traces = allTraces()
    expect(traces.length).toBeGreaterThanOrEqual(1)
    const spanTypes = new Set(
      (traces[traces.length - 1]!.spans as Array<{ span_type: string }>).map((s) => s.span_type),
    )
    expect(spanTypes.has('tool')).toBe(true)
    expect(spanTypes.has('llm')).toBe(true)
  })

  it('vercel-ai emits spans for streamText and generateObject', async () => {
    const { run } = await import('../examples/vercel-ai.ts')
    const { streamedText, sentiment } = await run()

    expect(streamedText.length).toBeGreaterThan(0)
    expect(sentiment).toBeDefined()
    expect(sentiment.score).toBeGreaterThan(0)

    const traces = allTraces()
    expect(traces.length).toBeGreaterThanOrEqual(1)
    const spans = traces[traces.length - 1]!.spans as Array<{ name: string; span_type: string }>
    const names = spans.map((s) => s.name)
    expect(names).toEqual(
      expect.arrayContaining(['vercel-ai.streamText', 'vercel-ai.generateObject']),
    )
    for (const s of spans) {
      expect(s.span_type).toBe('llm')
    }
  })

  it('nextjs-route emits a trace with validate-input and openai.chat spans', async () => {
    const { run } = await import('../examples/nextjs-route.ts')
    const result = await run()

    expect(result.traceId).toBeDefined()
    expect(result.reply.length).toBeGreaterThan(0)

    const traces = allTraces()
    expect(traces.length).toBeGreaterThanOrEqual(1)
    const spans = traces[traces.length - 1]!.spans as Array<{ name: string; span_type: string }>
    const names = spans.map((s) => s.name)
    expect(names).toEqual(expect.arrayContaining(['validate-input', 'openai.chat']))
    expect(spans.find((s) => s.name === 'openai.chat')?.span_type).toBe('llm')
    expect(spans.find((s) => s.name === 'validate-input')?.span_type).toBe('tool')
  })

  it('feedback flow: trace is ingested and feedback references it', async () => {
    const { run } = await import('../examples/feedback.ts')
    const { traceId, label } = await run()

    const received = getReceived()
    const traces = allTraces()
    expect(traces.some((t) => t.id === traceId)).toBe(true)
    expect(received.feedback.length).toBeGreaterThan(0)
    const fb = received.feedback.find(
      (f) => (f as Record<string, unknown>).trace_id === traceId,
    ) as Record<string, unknown> | undefined
    expect(fb).toBeDefined()
    expect(fb!.label).toBe(label)
    expect(fb!.score).toBe(1.0)
  })
})
