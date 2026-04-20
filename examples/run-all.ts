/**
 * Run every example against a local mock ingestion server.
 *
 * Forces TRULAYER_DEMO_MOCK=1 so no real provider keys are required,
 * then spins up `mock-server`, points TRULAYER_ENDPOINT at it, runs
 * each example in sequence, and prints a summary of the payloads the
 * server received. This is the canonical end-to-end check.
 *
 *   pnpm run-all
 */
import { getReceived, startMockServer } from './mock-server.ts'

const EXAMPLES: Array<[string, () => Promise<unknown>]> = [
  ['basic-trace', async () => (await import('./basic-trace.ts')).run()],
  ['openai-auto', async () => (await import('./openai-auto.ts')).run()],
  ['anthropic-auto', async () => (await import('./anthropic-auto.ts')).run()],
  ['langchain-chain', async () => (await import('./langchain-chain.ts')).run()],
  ['rag-pipeline', async () => (await import('./rag-pipeline.ts')).run()],
  ['agent', async () => (await import('./agent.ts')).run()],
  ['streaming', async () => (await import('./streaming.ts')).run()],
  ['feedback', async () => (await import('./feedback.ts')).run()],
]

async function main(): Promise<void> {
  process.env.TRULAYER_DEMO_MOCK = '1'
  process.env.TRULAYER_API_KEY ??= 'tl_demo'
  process.env.TRULAYER_PROJECT_NAME ??= 'demo'

  const server = await startMockServer()
  process.env.TRULAYER_ENDPOINT = server.url
  console.log(`mock ingestion server: ${server.url}\n`)

  try {
    for (const [name, run] of EXAMPLES) {
      try {
        const result = await run()
        let display: string
        if (Array.isArray(result)) display = `[${result.join(', ')}]`
        else if (result && typeof result === 'object') display = JSON.stringify(result)
        else display = String(result)
        console.log(`  ${name.padEnd(18)} -> ${display}`)
      } catch (err) {
        console.log(`  ${name.padEnd(18)} FAILED: ${(err as Error).message}`)
      }
    }

    const received = getReceived()
    const traces = received.batches.flatMap((b) => b.traces ?? [])
    const spans = traces.reduce(
      (sum, tr) => sum + ((tr as { spans?: unknown[] }).spans?.length ?? 0),
      0,
    )
    console.log(
      `\nserver received: ${received.batches.length} batches, ` +
        `${traces.length} traces, ${spans} spans, ` +
        `${received.feedback.length} feedback`,
    )
  } finally {
    await server.close()
  }
}

await main()
