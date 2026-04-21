/**
 * End-to-end RAG pipeline traced with TruLayer.
 *
 * Pipeline stages (each becomes a span):
 *
 *   1. embed-query       (span_type="default")   — OpenAI text-embedding-3-small
 *   2. retrieve-docs     (span_type="retrieval") — cosine similarity in-memory
 *   3. generate-answer   (span_type="llm")       — OpenAI chat.completions
 *
 * The corpus is tiny and in-memory — the goal is to show the *shape* of
 * a RAG trace, not to be a real search system. Swap the corpus and the
 * retrieval function for your own store and the tracing code stays the
 * same.
 *
 *   pnpm rag-pipeline
 */
import type OpenAI from 'openai'
import { buildOpenAIClient, initClient } from './_config.ts'

const CORPUS: Record<string, string> = {
  paris: 'The Eiffel Tower is a wrought-iron lattice tower in Paris, France.',
  rome: 'The Colosseum is a large amphitheatre in the centre of Rome, Italy.',
  berlin: 'The Brandenburg Gate is an 18th-century neoclassical monument in Berlin, Germany.',
  tokyo: 'Tokyo Tower is a communications and observation tower in Shiba-koen, Tokyo.',
}

function cosine(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length)
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < len; i++) {
    dot += a[i]! * b[i]!
    na += a[i]! * a[i]!
    nb += b[i]! * b[i]!
  }
  const denom = Math.sqrt(na || 1) * Math.sqrt(nb || 1)
  return denom === 0 ? 0 : dot / denom
}

async function embed(openai: OpenAI, text: string): Promise<number[]> {
  const resp = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  })
  return [...(resp.data[0]?.embedding ?? [])]
}

export async function run(): Promise<string> {
  const client = initClient()
  const openai = buildOpenAIClient()

  const question = 'Which city is the Eiffel Tower in?'

  const traceId = await client.trace(
    'rag-query',
    async (t) => {
      t.setInput(question)

      // ---- 1. embed the query -----------------------------------------
      const qVec = await t.span('embed-query', 'default', async (s) => {
        s.setModel('text-embedding-3-small')
        s.setInput(question)
        const v = await embed(openai, question)
        s.setOutput(`vector[${v.length}]`)
        return v
      })

      // ---- 2. retrieve top-k ------------------------------------------
      const retrieved = await t.span('retrieve-docs', 'retrieval', async (s) => {
        s.setInput(question)
        const scored: Array<[string, number]> = []
        for (const [docId, doc] of Object.entries(CORPUS)) {
          const dVec = await embed(openai, doc)
          scored.push([docId, cosine(qVec, dVec)])
        }
        scored.sort((a, b) => b[1] - a[1])
        const topK = scored.slice(0, 2)
        const docs = topK.map(([id]) => CORPUS[id]!)
        s.setOutput(docs.join('\n---\n'))
        s.setMetadata({
          topK: topK.map(([doc, score]) => ({ doc, score: Number(score.toFixed(4)) })),
          corpusSize: Object.keys(CORPUS).length,
        })
        return docs
      })

      // ---- 3. generate the answer -------------------------------------
      const contextBlock = retrieved.map((d) => `- ${d}`).join('\n')
      const prompt = `Answer the user's question using only the context.\n\nContext:\n${contextBlock}\n\nQuestion: ${question}`

      const answer = await t.span('generate-answer', 'llm', async (s) => {
        s.setModel('gpt-4o-mini')
        s.setInput(prompt)
        const resp = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'Answer strictly from the given context.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0,
        })
        const text = resp.choices[0]?.message?.content?.trim() ?? ''
        s.setOutput(text)
        if (resp.usage) {
          s.setTokens(resp.usage.prompt_tokens, resp.usage.completion_tokens)
        }
        return text
      })

      t.setOutput(answer)
      return t.data.id
    },
    { tags: ['demo', 'rag'] },
  )

  await client.shutdown()
  return traceId
}

run().catch(console.error)
