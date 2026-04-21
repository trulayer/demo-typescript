/**
 * Next.js App Router API route with TruLayer tracing — pattern example.
 *
 * This file shows how to integrate TruLayer tracing into a Next.js
 * App Router `POST` handler. The pattern is:
 *
 *   1. Initialize the TruLayer client once (e.g. in a shared module).
 *   2. Inside the route handler, open a trace that wraps the entire
 *      request lifecycle.
 *   3. Add spans for each logical step (parsing, LLM call, formatting).
 *   4. Return a `Response` with the result.
 *
 * Since this is a standalone demo (no Next.js runtime), the `run()`
 * function simulates a POST request by calling the same handler logic
 * directly.
 *
 * In a real Next.js project, the route file would live at:
 *   `app/api/chat/route.ts`
 *
 * And the export would be:
 *   ```ts
 *   export async function POST(req: Request) { ... }
 *   ```
 *
 *   pnpm example --name=nextjs-route
 */
import { buildOpenAIClient, initClient, isMockMode } from './_config.ts'

// ---------------------------------------------------------------------------
// Shared handler logic — reusable between the real Next.js route and this
// standalone demo.
// ---------------------------------------------------------------------------

interface ChatRequest {
  message: string
}

interface ChatResponse {
  traceId: string
  reply: string
}

/**
 * Core handler: opens a trace, runs an LLM call inside a span, returns
 * the reply and trace ID. In a real Next.js route you'd call this from
 * the `POST` export; here we call it from `run()`.
 */
async function handleChat(body: ChatRequest): Promise<ChatResponse> {
  const client = initClient()
  const openai = buildOpenAIClient()

  let reply = ''

  const traceId = await client.trace(
    'chat',
    async (t) => {
      t.setInput(body.message)
      t.setMetadata({ source: 'nextjs-api-route' })

      // Step 1 — parse and validate the request.
      const validated = await t.span('validate-input', 'tool', async (s) => {
        s.setInput(body.message)
        const trimmed = body.message.trim()
        if (!trimmed) throw new Error('Empty message')
        s.setOutput(trimmed)
        return trimmed
      })

      // Step 2 — call the LLM.
      reply = await t.span('openai.chat', 'llm', async (s) => {
        s.setModel('gpt-4o-mini')
        s.setInput(validated)
        const resp = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: validated },
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

      t.setOutput(reply)
      return t.data.id
    },
    { tags: ['demo', 'nextjs-route'] },
  )

  await client.shutdown()
  return { traceId, reply }
}

// ---------------------------------------------------------------------------
// Pattern: how the Next.js route handler would look
// ---------------------------------------------------------------------------

/**
 * In a real Next.js App Router project, this would be the route export:
 *
 * ```ts
 * // app/api/chat/route.ts
 * export async function POST(req: Request) {
 *   const body = (await req.json()) as ChatRequest
 *   const result = await handleChat(body)
 *   return Response.json(result)
 * }
 * ```
 */

// ---------------------------------------------------------------------------
// Standalone runner — simulates a POST request without the Next.js runtime.
// ---------------------------------------------------------------------------

export async function run(): Promise<ChatResponse> {
  if (isMockMode()) {
    console.log('nextjs-route: running in mock mode (no real API calls).')
  }

  const body: ChatRequest = { message: 'What is the capital of France?' }
  console.log('Simulating POST /api/chat with:', body)

  const result = await handleChat(body)
  console.log('Response:', result)
  return result
}

run().catch(console.error)
