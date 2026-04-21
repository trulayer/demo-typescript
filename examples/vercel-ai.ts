/**
 * Vercel AI SDK integration with TruLayer auto-instrumentation.
 *
 * Demonstrates `instrumentVercelAI()` wrapping both `streamText` and
 * `generateObject` from the Vercel AI SDK. Each call is captured as an
 * LLM span inside the active trace, with input/output and token usage
 * recorded automatically.
 *
 * In mock mode (`TRULAYER_DRY_RUN=true`), lightweight stubs replace the
 * real Vercel AI SDK functions so the example runs without provider API
 * keys or an `@ai-sdk/*` provider package installed.
 *
 *   pnpm example --name=vercel-ai
 */
import { instrumentVercelAI } from '@trulayer/sdk'
import { initClient, isMockMode } from './_config.ts'

// ---------------------------------------------------------------------------
// Mock implementations for dry-run / CI mode.
//
// The real Vercel AI SDK needs a provider model (e.g. @ai-sdk/openai).
// In mock mode we substitute minimal stubs that satisfy the
// instrumentVercelAI signature so the instrumentation path is exercised
// without any network call.
// ---------------------------------------------------------------------------

const mockModel = { modelId: 'mock-gpt-4o', provider: 'mock-openai' }

// Use `Record<string, unknown>` params to match the SDK's loose `GenerateParams`.
function mockStreamText(_params: Record<string, unknown>) {
  const chunks = ['Paris ', 'is ', 'the ', 'capital ', 'of ', 'France.']
  return {
    text: Promise.resolve(chunks.join('')),
    usage: Promise.resolve({ promptTokens: 10, completionTokens: 6 }),
    textStream: (async function* () {
      for (const chunk of chunks) yield chunk
    })(),
  }
}

async function mockGenerateObject(_params: Record<string, unknown>) {
  return {
    object: { sentiment: 'positive' as const, score: 0.92 },
    usage: { promptTokens: 15, completionTokens: 8 },
  }
}

// ---------------------------------------------------------------------------
// Main example
// ---------------------------------------------------------------------------

/** Sentiment analysis result schema (typed, not a Zod schema for simplicity). */
interface SentimentResult {
  sentiment: 'positive' | 'negative' | 'neutral'
  score: number
}

export async function run(): Promise<{ streamedText: string; sentiment: SentimentResult }> {
  const client = initClient()

  let streamedText = ''
  let sentimentResult: SentimentResult = { sentiment: 'neutral', score: 0 }

  await client.trace(
    'vercel-ai-demo',
    async (t) => {
      // Wrap the Vercel AI SDK functions for this trace.
      // The real Vercel AI SDK function signatures are narrower than the
      // SDK's loose `AIFunction<GenerateParams, ...>` type, so we cast
      // through `unknown` at the boundary.
      const stFn = isMockMode()
        ? mockStreamText
        : (await import('ai')).streamText
      const goFn = isMockMode()
        ? mockGenerateObject
        : (await import('ai')).generateObject

      type StreamFn = (p: Record<string, unknown>) => ReturnType<typeof mockStreamText>
      type GenObjFn = (p: Record<string, unknown>) => Promise<Awaited<ReturnType<typeof mockGenerateObject>>>

      // The trace callback receives `TraceContext | NoopTraceContext`;
      // `instrumentVercelAI` expects the concrete `TraceContext`. Cast
      // through `unknown` at the boundary — in dry-run mode the noop
      // context is a no-op and the instrumentation calls are harmless.
      const wrapVercelAI = instrumentVercelAI as unknown as (
        fns: { streamText: StreamFn; generateObject: GenObjFn },
        trace: unknown,
      ) => { streamText: StreamFn; generateObject: GenObjFn }

      const { streamText, generateObject } = wrapVercelAI(
        {
          streamText: stFn as unknown as StreamFn,
          generateObject: goFn as unknown as GenObjFn,
        },
        t,
      )

      // --- Part 1: streamText -------------------------------------------------
      t.setInput('Stream a short answer about the capital of France.')

      const streamResult = streamText({
        model: mockModel,
        prompt: 'What is the capital of France? Answer in one sentence.',
      }) as ReturnType<typeof mockStreamText>

      // Consume the stream chunk by chunk.
      const chunks: string[] = []
      for await (const chunk of streamResult.textStream) {
        chunks.push(chunk)
      }
      streamedText = chunks.join('')
      console.log('Streamed text:', streamedText)

      // --- Part 2: generateObject ---------------------------------------------
      const objectResult = await generateObject({
        model: mockModel,
        prompt: `Analyze the sentiment of: "${streamedText}"`,
      })

      sentimentResult = objectResult.object as SentimentResult
      console.log('Sentiment:', sentimentResult)

      t.setOutput(JSON.stringify({ streamedText, sentiment: sentimentResult }))
    },
    { tags: ['demo', 'vercel-ai'] },
  )

  await client.shutdown()
  return { streamedText, sentiment: sentimentResult }
}

run().catch(console.error)
