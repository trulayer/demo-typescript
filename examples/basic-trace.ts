/**
 * Manual trace + span creation around a real OpenAI chat call.
 *
 * This is the "hello world" of the TruLayer SDK. It shows the three
 * things every tracing integration needs:
 *
 *   1. Open a trace that represents one user-facing operation.
 *   2. Wrap each logical step (retrieval, prompt construction, LLM
 *      call) in its own span so you can see latency and I/O per step.
 *   3. Attach the trace's top-level input/output so dashboards show
 *      the user's question and your final answer without drilling
 *      into spans.
 *
 *   pnpm basic-trace
 */
import { initClient, buildOpenAIClient } from './_config.ts'

export async function run(): Promise<string> {
  const client = initClient()
  const openai = buildOpenAIClient()

  const question = 'What is the capital of France? Answer in one short sentence.'

  const { traceId } = await client.trace(
    'basic-qa',
    async (t) => {
      t.setInput(question)
      t.setModel('gpt-4o-mini')

      // Step 1 — pretend we looked up context.
      const context = await t.span('retrieve-context', 'retrieval', async (s) => {
        s.setInput(question)
        const text = 'France is a country in Western Europe; its capital is Paris.'
        s.setOutput(text)
        s.setMetadata({ source: 'static-fixture' })
        return text
      })

      // Step 2 — call OpenAI as its own LLM span.
      const prompt = `Use this context:\n${context}\n\nQuestion: ${question}`
      const answer = await t.span('openai.chat', 'llm', async (s) => {
        s.setModel('gpt-4o-mini')
        s.setInput(prompt)

        const started = Date.now()
        const resp = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are a concise assistant.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0,
        })
        const providerLatencyMs = Date.now() - started

        const text = resp.choices[0]?.message?.content?.trim() ?? ''
        s.setOutput(text)
        if (resp.usage) {
          s.setTokens(resp.usage.prompt_tokens, resp.usage.completion_tokens)
        }
        s.setMetadata({ providerLatencyMs })
        return text
      })

      t.setOutput(answer)
      return { traceId: t.data.id }
    },
    {
      externalId: 'basic-qa-demo',
      tags: ['demo', 'basic-trace'],
      metadata: { example: 'basic-trace.ts' },
    },
  )

  await client.shutdown()
  return traceId
}

run().catch(console.error)
