/**
 * OpenAI auto-instrumentation — zero per-call span code.
 *
 * `instrumentOpenAI(client, trace)` wraps an OpenAI client so every
 * `chat.completions.create` call made through the returned proxy emits
 * an `openai.chat` span into the given trace. Use this when you want
 * tracing without threading spans through your application code.
 *
 *   pnpm openai-auto
 */
import type OpenAI from 'openai'
import { instrumentOpenAI } from '@trulayer/sdk'
import { buildOpenAIClient, initClient } from './_config.ts'

// The SDK's `instrumentOpenAI` signature accepts a structural OpenAI-
// shaped object. Cast at the call site so we can keep full OpenAI
// types on the returned proxy.
const wrap = instrumentOpenAI as unknown as <T>(client: T, trace: unknown) => T

const SYSTEM_PROMPT =
  'You are a helpful travel assistant. Answer in one sentence. Be specific but brief.'

const USER_QUESTIONS = [
  'Name one must-see landmark in Paris.',
  'Name one must-see landmark in Rome.',
  'Name one must-see landmark in Tokyo.',
]

export async function run(): Promise<string[]> {
  const client = initClient()
  const openai = buildOpenAIClient()

  const traceIds: string[] = []
  for (const question of USER_QUESTIONS) {
    await client.trace(
      'travel-qa',
      async (t) => {
        t.setInput(question)
        // Instrumented per-trace — the proxy routes spans into this trace.
        const wrapped: OpenAI = wrap(openai, t)
        const resp = await wrapped.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: question },
          ],
          temperature: 0,
        })
        t.setOutput(resp.choices[0]?.message?.content?.trim() ?? '')
        traceIds.push(t.data.id)
      },
      { tags: ['demo', 'openai-auto'] },
    )
  }

  await client.shutdown()
  return traceIds
}

run().catch(console.error)
