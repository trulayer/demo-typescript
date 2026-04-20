/**
 * End-to-end smoke tests — runs each example against a mock
 * ingestion server and asserts the payloads actually arrived.
 *
 * Runs in TRULAYER_DEMO_MOCK=1 mode so no provider API keys are
 * required. Tests are deterministic and offline.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getReceived, startMockServer, type RunningMockServer } from '../examples/mock-server.ts'

let server: RunningMockServer

beforeAll(async () => {
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
    expect(traces.length).toBe(1)
    const t = traces[0]!
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
    expect(traces.length).toBe(ids.length)
    for (const t of traces) {
      const spans = t.spans as Array<{ name: string }>
      expect(spans.some((s) => s.name === 'openai.chat')).toBe(true)
    }
  })

  it('langchain-chain emits a trace with a langchain.llm span', async () => {
    const { run } = await import('../examples/langchain-chain.ts')
    await run()

    const traces = allTraces()
    expect(traces.length).toBe(1)
    const spans = traces[0]!.spans as Array<{ name: string; span_type: string }>
    const lc = spans.find((s) => s.name === 'langchain.llm')
    expect(lc).toBeDefined()
    expect(lc?.span_type).toBe('llm')
  })

  it('anthropic-auto emits a trace with an anthropic.messages span', async () => {
    const { run } = await import('../examples/anthropic-auto.ts')
    await run()

    const traces = allTraces()
    expect(traces.length).toBe(1)
    const spans = traces[0]!.spans as Array<{ name: string }>
    expect(spans.some((s) => s.name === 'anthropic.messages')).toBe(true)
  })

  it('rag-pipeline emits a 3-stage trace', async () => {
    const { run } = await import('../examples/rag-pipeline.ts')
    await run()

    const traces = allTraces()
    expect(traces.length).toBe(1)
    const names = (traces[0]!.spans as Array<{ name: string }>).map((s) => s.name)
    expect(names).toEqual(expect.arrayContaining(['embed-query', 'retrieve-docs', 'generate-answer']))
  })

  it('agent emits tool spans and an llm span', async () => {
    const { run } = await import('../examples/agent.ts')
    await run()

    const traces = allTraces()
    expect(traces.length).toBeGreaterThan(0)
    const spanTypes = new Set(
      (traces[0]!.spans as Array<{ span_type: string }>).map((s) => s.span_type),
    )
    expect(spanTypes.has('tool')).toBe(true)
    expect(spanTypes.has('llm')).toBe(true)
  })

  it('feedback flow: trace is ingested and feedback references it', async () => {
    const { run } = await import('../examples/feedback.ts')
    const { traceId, label } = await run()

    const received = getReceived()
    const traces = allTraces()
    expect(traces.some((t) => t.id === traceId)).toBe(true)
    expect(received.feedback.length).toBeGreaterThan(0)
    const fb = received.feedback[0] as Record<string, unknown>
    expect(fb.trace_id).toBe(traceId)
    expect(fb.label).toBe(label)
    expect(fb.score).toBe(1.0)
  })
})
