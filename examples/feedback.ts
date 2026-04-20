/**
 * Emit a trace, remember its ID, then attach feedback.
 *
 * Feedback is how you label traces as "good" / "bad" / "neutral" —
 * either from end users (thumbs-up buttons, corrections) or from
 * offline reviewers. In TruLayer, feedback is a separate write path
 * that references a trace by ID, so it can arrive minutes or days
 * after the trace itself.
 *
 * This demo runs an LLM call, flushes the trace, then POSTs a "good"
 * label against it.
 *
 *   pnpm feedback
 */
import { buildOpenAIClient, initClient } from './_config.ts'

export async function run(): Promise<{ traceId: string; label: string }> {
  const client = initClient()
  const openai = buildOpenAIClient()

  const question = 'In one sentence, what is the Louvre?'

  const traceId = await client.trace(
    'feedback-demo',
    async (t) => {
      t.setInput(question)
      await t.span('openai.chat', 'llm', async (s) => {
        s.setModel('gpt-4o-mini')
        s.setInput(question)
        const resp = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: question }],
          temperature: 0,
        })
        const answer = resp.choices[0]?.message?.content?.trim() ?? ''
        s.setOutput(answer)
        if (resp.usage) s.setTokens(resp.usage.prompt_tokens, resp.usage.completion_tokens)
        t.setOutput(answer)
      })
      return t.data.id
    },
    { tags: ['demo', 'feedback'] },
  )

  // Ensure the trace is ingested before feedback references it.
  await client.shutdown()

  client.feedback(traceId, 'good', {
    score: 1.0,
    comment: 'Accurate and concise.',
    metadata: { source: 'demo', reviewer: 'auto' },
  })

  // feedback() fires a POST asynchronously — give it a moment to land.
  await new Promise((r) => setTimeout(r, 100))

  return { traceId, label: 'good' }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { traceId, label } = await run()
  console.log(`feedback: trace=${traceId} label=${label}`)
}
