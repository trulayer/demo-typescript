/**
 * Streaming OpenAI responses captured into a single span.
 *
 * The OpenAI SDK exposes streaming completions as an async iterator of
 * chunks. We open an `openai.chat` span, accumulate the deltas, and
 * attach the final concatenated output on span exit.
 *
 *   pnpm streaming
 */
import { buildOpenAIClient, initClient, isMockMode } from './_config.ts'

export async function run(): Promise<string | null> {
  // Mock mode does not emulate SSE — skip.
  if (isMockMode()) {
    console.log('streaming: skipped in TRULAYER_DEMO_MOCK mode (SSE not mocked).')
    return null
  }

  const client = initClient()
  const openai = buildOpenAIClient()

  const question = 'List three famous landmarks in Paris, one per line.'

  const traceId = await client.trace(
    'streaming-qa',
    async (t) => {
      t.setInput(question)

      const answer = await t.span('openai.chat', 'llm', async (s) => {
        s.setModel('gpt-4o-mini')
        s.setInput(question)

        const stream = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: question }],
          stream: true,
          stream_options: { include_usage: true },
        })

        const chunks: string[] = []
        let promptTokens: number | undefined
        let completionTokens: number | undefined
        for await (const event of stream) {
          const delta = event.choices[0]?.delta?.content
          if (delta) chunks.push(delta)
          if (event.usage) {
            promptTokens = event.usage.prompt_tokens
            completionTokens = event.usage.completion_tokens
          }
        }
        const text = chunks.join('').trim()
        s.setOutput(text)
        if (promptTokens !== undefined || completionTokens !== undefined) {
          s.setTokens(promptTokens, completionTokens)
        }
        return text
      })

      t.setOutput(answer)
      return t.data.id
    },
    { tags: ['demo', 'streaming'] },
  )

  await client.shutdown()
  return traceId
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const id = await run()
  if (id !== null) console.log(`streaming: emitted trace ${id}`)
}
