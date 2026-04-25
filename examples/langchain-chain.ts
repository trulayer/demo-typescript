/**
 * LangChain chain traced via a TruLayer callback handler.
 *
 * The TypeScript SDK doesn't ship a built-in LangChain instrument, but
 * the integration is straightforward: implement a `BaseCallbackHandler`
 * whose `handle*Start` / `handleLLMEnd` methods record the start/end
 * of each LLM call as a TruLayer span on the active trace.
 *
 * Pipeline in this demo:
 *
 *     prompt_template | ChatOpenAI | StrOutputParser
 *
 *   pnpm langchain-chain
 */
import { BaseCallbackHandler } from '@langchain/core/callbacks/base'
import type { Serialized } from '@langchain/core/load/serializable'
import type { BaseMessage } from '@langchain/core/messages'
import type { LLMResult } from '@langchain/core/outputs'
import { StringOutputParser } from '@langchain/core/output_parsers'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { ChatOpenAI } from '@langchain/openai'
import { SpanContext, type TraceContext } from '@trulayer/sdk'
import { initClient, isMockMode } from './_config.ts'

interface PendingCall {
  startedAt: number
  model: string
  input: string
}

/**
 * TruLayer LangChain callback handler. Records a `langchain.llm` span
 * into the provided trace for each chat-model or LLM call.
 */
class TruLayerLangChainHandler extends BaseCallbackHandler {
  name = 'TruLayerLangChainHandler'
  private readonly pending = new Map<string, PendingCall>()

  constructor(private readonly trace: TraceContext) {
    super()
  }

  handleChatModelStart(
    llm: Serialized,
    messages: BaseMessage[][],
    runId: string,
    _parentRunId?: string,
    extraParams?: Record<string, unknown>,
  ): void {
    const last = messages[messages.length - 1]?.at(-1)
    const input =
      typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? '')
    this.pending.set(runId, {
      startedAt: Date.now(),
      model: extractModel(llm, extraParams),
      input,
    })
  }

  handleLLMStart(
    llm: Serialized,
    prompts: string[],
    runId: string,
    _parentRunId?: string,
    extraParams?: Record<string, unknown>,
  ): void {
    this.pending.set(runId, {
      startedAt: Date.now(),
      model: extractModel(llm, extraParams),
      input: prompts[0] ?? '',
    })
  }

  handleLLMEnd(output: LLMResult, runId: string): void {
    const entry = this.pending.get(runId)
    if (!entry) return
    this.pending.delete(runId)

    const span = new SpanContext(this.trace, 'langchain.llm', 'llm')
    span.setInput(entry.input)
    if (entry.model) span.setModel(entry.model)

    const gen = output.generations?.[0]?.[0]
    const text = typeof gen?.text === 'string' ? gen.text : ''
    span.setOutput(text)

    const usage =
      (output.llmOutput?.tokenUsage as Record<string, number> | undefined) ??
      (output.llmOutput?.usage as Record<string, number> | undefined) ??
      {}
    const prompt = usage.promptTokens ?? usage.prompt_tokens ?? usage.input_tokens
    const completion = usage.completionTokens ?? usage.completion_tokens ?? usage.output_tokens
    if (prompt !== undefined || completion !== undefined) {
      span.setTokens(prompt, completion)
    }

    const endMs = Date.now()
    span.data.latency_ms = endMs - entry.startedAt
    span.data.ended_at = new Date(endMs).toISOString()
    this.trace.data.spans.push(span.data)
  }

  handleLLMError(_err: Error, runId: string): void {
    const entry = this.pending.get(runId)
    if (!entry) return
    this.pending.delete(runId)

    const span = new SpanContext(this.trace, 'langchain.llm', 'llm')
    span.setInput(entry.input)
    if (entry.model) span.setModel(entry.model)
    span.data.error = _err.message
    span.data.latency_ms = Date.now() - entry.startedAt
    span.data.ended_at = new Date().toISOString()
    this.trace.data.spans.push(span.data)
  }
}

function extractModel(llm: Serialized, extraParams?: Record<string, unknown>): string {
  const kw = (llm as { kwargs?: Record<string, unknown> }).kwargs ?? {}
  const invocation = (extraParams?.invocation_params as Record<string, unknown> | undefined) ?? {}
  return (
    (kw.model_name as string | undefined) ??
    (kw.model as string | undefined) ??
    (invocation.model_name as string | undefined) ??
    (invocation.model as string | undefined) ??
    ''
  )
}

// ---------------------------------------------------------------------------
// Chain wiring
// ---------------------------------------------------------------------------

function buildChatModel(): ChatOpenAI {
  if (isMockMode()) {
    // Mock mode: route the ChatOpenAI HTTP calls through the same mock
    // fetch used by the other demos. We rebuild the mock fetch inline
    // so we don't leak private internals of the openai SDK.
    const mock = async (url: string): Promise<Response> => {
      return new Response(
        JSON.stringify({
          id: 'chatcmpl-mock-langchain',
          object: 'chat.completion',
          created: 0,
          model: 'gpt-4o-mini',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Visit the Eiffel Tower in Paris.' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
        }),
        {
          status: url.endsWith('/chat/completions') ? 200 : 404,
          headers: { 'content-type': 'application/json' },
        },
      )
    }
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString()
      return mock(url)
    }) as unknown as typeof fetch

    return new ChatOpenAI({
      model: 'gpt-4o-mini',
      apiKey: 'sk-demo-mock',
      temperature: 0,
      configuration: { fetch: fetchImpl } as never,
    })
  }
  const key = process.env.OPENAI_API_KEY
  if (!key) {
    throw new Error(
      'OPENAI_API_KEY is not set. Put it in `.env` or export it, ' +
        'or set TRULAYER_DEMO_MOCK=1 for offline mode.',
    )
  }
  return new ChatOpenAI({ model: 'gpt-4o-mini', apiKey: key, temperature: 0 })
}

export async function run(): Promise<string> {
  const client = initClient()

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', 'You are a concise travel guide. One sentence only.'],
    ['human', '{question}'],
  ])
  const chain = prompt.pipe(buildChatModel()).pipe(new StringOutputParser())

  const question = 'What is one must-see landmark in Paris?'

  const traceId = await client.trace(
    'langchain-qa',
    async (t) => {
      t.setInput(question)
      // The trace callback receives `TraceContext | NoopTraceContext`;
      // the handler only uses the concrete `TraceContext` shape. Cast
      // through `unknown` — in dry-run mode the noop context makes the
      // callback handler a no-op, which is the intended behaviour.
      const handler = new TruLayerLangChainHandler(t as unknown as TraceContext)
      const answer = await chain.invoke({ question }, { callbacks: [handler] })
      t.setOutput(String(answer).trim())
      return t.data.id
    },
    { tags: ['demo', 'langchain'], metadata: { example: 'langchain-chain.ts' } },
  )

  await client.shutdown()
  return traceId
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const id = await run()
  console.log(`langchain-chain: emitted trace ${id}`)
}
