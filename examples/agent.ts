/**
 * Tool-calling agent traced end-to-end.
 *
 * Runs a small OpenAI function-calling loop with two tools:
 *   - `get_weather(city)`    — returns a canned weather string
 *   - `calculate(expression)` — evaluates a safe arithmetic expression
 *
 * Each tool invocation becomes a span_type="tool" span, and each LLM
 * turn becomes a span_type="llm" span. The result is a trace tree you
 * can inspect in TruLayer showing exactly what the model did and why.
 *
 *   pnpm agent
 */
import type OpenAI from 'openai'
import { buildOpenAIClient, initClient } from './_config.ts'

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam
type ChatCompletion = OpenAI.Chat.Completions.ChatCompletion

const TOOL_SCHEMAS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get the current weather in a given city.',
      parameters: {
        type: 'object',
        properties: { city: { type: 'string' } },
        required: ['city'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate',
      description: "Evaluate a simple arithmetic expression (e.g. '7 * 6').",
      parameters: {
        type: 'object',
        properties: { expression: { type: 'string' } },
        required: ['expression'],
      },
    },
  },
]

const WEATHER_TABLE: Record<string, { temp_c: number; conditions: string }> = {
  paris: { temp_c: 22, conditions: 'sunny' },
  rome: { temp_c: 28, conditions: 'clear' },
  tokyo: { temp_c: 18, conditions: 'light rain' },
}

/** Evaluate an arithmetic expression made of numbers and + - * / ** operators. */
function safeEval(expr: string): number {
  if (!/^[\d\s+\-*/().]+$/.test(expr)) {
    throw new Error(`unsafe expression: ${expr}`)
  }
  // eslint-disable-next-line no-new-func
  const fn = new Function(`"use strict"; return (${expr});`) as () => number
  const v = fn()
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`non-numeric result for: ${expr}`)
  }
  return v
}

function callTool(name: string, args: Record<string, unknown>): string {
  if (name === 'get_weather') {
    const city = String(args.city ?? '').toLowerCase()
    const data = WEATHER_TABLE[city] ?? { temp_c: 20, conditions: 'unknown' }
    return JSON.stringify({ city, ...data })
  }
  if (name === 'calculate') {
    return JSON.stringify({ result: safeEval(String(args.expression ?? '0')) })
  }
  throw new Error(`unknown tool: ${name}`)
}

const SYSTEM =
  'You are a helpful assistant. Use the provided tools when needed. ' +
  'Keep your final answer to one sentence.'

const MAX_TURNS = 5

export async function run(): Promise<string> {
  const client = initClient()
  const openai = buildOpenAIClient()

  const task =
    'Look up the weather in Paris and Tokyo. ' +
    'If Paris is warmer than Tokyo, tell me what 7 * 6 is. ' +
    'Otherwise, tell me what 8 * 9 is.'

  const traceId = await client.trace(
    'tool-agent',
    async (t) => {
      t.setInput(task)

      const messages: ChatMessage[] = [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: task },
      ]

      let finalAnswer = '<no answer>'
      let settled = false
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const resp: ChatCompletion = await t.span(`agent.turn-${turn}`, 'llm', async (s) => {
          s.setModel('gpt-4o-mini')
          s.setInput(JSON.stringify(messages[messages.length - 1]))
          const r = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages,
            tools: TOOL_SCHEMAS,
            tool_choice: 'auto',
            temperature: 0,
          })
          const m = r.choices[0]?.message
          s.setOutput(m?.content ?? '<tool call>')
          if (r.usage) s.setTokens(r.usage.prompt_tokens, r.usage.completion_tokens)
          return r
        })

        const msg = resp.choices[0]?.message
        if (!msg) break
        messages.push(msg as ChatMessage)

        const toolCalls = msg.tool_calls ?? []
        if (toolCalls.length === 0) {
          finalAnswer = (msg.content ?? '').trim()
          settled = true
          break
        }

        for (const tc of toolCalls) {
          if (tc.type !== 'function') continue
          const name = tc.function.name
          const args = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>

          const result = await t.span(`tool.${name}`, 'tool', async (s) => {
            s.setInput(JSON.stringify(args))
            s.setMetadata({ tool: name, toolCallId: tc.id })
            const r = callTool(name, args)
            s.setOutput(r)
            return r
          })

          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: result,
          })
        }
      }

      if (!settled) finalAnswer = '<max turns reached>'
      t.setOutput(finalAnswer)
      return t.data.id
    },
    { tags: ['demo', 'agent'] },
  )

  await client.shutdown()
  return traceId
}

run().catch(console.error)
