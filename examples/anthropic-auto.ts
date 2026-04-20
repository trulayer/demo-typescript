/**
 * Anthropic auto-instrumentation — zero per-call span code.
 *
 * Same pattern as `openai-auto.ts` but for the Anthropic Messages API.
 *
 *   pnpm anthropic-auto
 */
import type Anthropic from '@anthropic-ai/sdk'
import { instrumentAnthropic } from '@trulayer/sdk'
import { buildAnthropicClient, initClient } from './_config.ts'

const wrap = instrumentAnthropic as unknown as <T>(client: T, trace: unknown) => T

export async function run(): Promise<string> {
  const client = initClient()
  const anthropic = buildAnthropicClient()

  const question = 'In one short sentence, why is the Eiffel Tower famous?'

  const traceId = await client.trace(
    'landmark-qa',
    async (t) => {
      t.setInput(question)
      const wrapped: Anthropic = wrap(anthropic, t)
      const resp = await wrapped.messages.create({
        model: 'claude-3-5-sonnet-latest',
        max_tokens: 128,
        messages: [{ role: 'user', content: question }],
      })
      const text = resp.content.find((b) => b.type === 'text')?.text ?? ''
      t.setOutput(text.trim())
      return t.data.id
    },
    { tags: ['demo', 'anthropic-auto'] },
  )

  await client.shutdown()
  return traceId
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const id = await run()
  console.log(`anthropic-auto: emitted trace ${id}`)
}
