/**
 * Shared configuration for the demos.
 *
 * Responsibilities:
 *   - Load environment variables from `.env` at the repo root.
 *   - Initialize the global TruLayer client.
 *   - Build OpenAI / Anthropic clients — either real (with your API key)
 *     or mock-fetch clients (when TRULAYER_DEMO_MOCK=1), so the same
 *     example code runs in development and in CI.
 */
import 'dotenv/config'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { init, type TruLayer } from '@trulayer/sdk'

export function isMockMode(): boolean {
  const v = (process.env.TRULAYER_DEMO_MOCK ?? '').toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

export function initClient(): TruLayer {
  // TRULAYER_PROJECT_ID is the deprecated alias from before we standardized
  // on names — keep it working so existing .env files don't break.
  const projectName =
    process.env.TRULAYER_PROJECT_NAME ?? process.env.TRULAYER_PROJECT_ID ?? 'demo'
  return init({
    apiKey: process.env.TRULAYER_API_KEY ?? 'tl_demo',
    projectName,
    endpoint: process.env.TRULAYER_ENDPOINT ?? 'http://127.0.0.1:8080',
    flushInterval: 200,
  })
}

// ---------------------------------------------------------------------------
// Mock fetch implementations for offline/CI runs.
// ---------------------------------------------------------------------------

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function mockOpenAIFetch(url: string, init?: RequestInit): Response {
  if (url.endsWith('/chat/completions')) {
    const bodyText = typeof init?.body === 'string' ? init.body : ''
    let parsed: Record<string, unknown> = {}
    try {
      parsed = JSON.parse(bodyText) as Record<string, unknown>
    } catch {
      parsed = {}
    }
    const hasTools = Array.isArray(parsed.tools) && parsed.tools.length > 0
    const messages = (parsed.messages as Array<{ role?: string }>) ?? []
    const hasToolResult = messages.some((m) => m.role === 'tool')

    // Agent path: offer a tool_call the first turn, final answer the second.
    if (hasTools && !hasToolResult) {
      return jsonResponse(200, {
        id: 'chatcmpl-mock-tool',
        object: 'chat.completion',
        created: 0,
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_mock_1',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: JSON.stringify({ city: 'Paris' }),
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
      })
    }
    return jsonResponse(200, {
      id: 'chatcmpl-mock',
      object: 'chat.completion',
      created: 0,
      model: 'gpt-4o-mini',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Paris is the capital of France.' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
    })
  }
  if (url.endsWith('/embeddings')) {
    return jsonResponse(200, {
      object: 'list',
      model: 'text-embedding-3-small',
      data: [{ object: 'embedding', index: 0, embedding: [0.1, 0.2, 0.3, 0.4] }],
      usage: { prompt_tokens: 5, total_tokens: 5 },
    })
  }
  return jsonResponse(404, { error: { message: `unhandled path: ${url}` } })
}

function mockAnthropicFetch(url: string, _init?: RequestInit): Response {
  if (url.endsWith('/v1/messages') || url.endsWith('/messages')) {
    return jsonResponse(200, {
      id: 'msg_mock',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Paris is the capital of France.' }],
      model: 'claude-3-5-sonnet-latest',
      stop_reason: 'end_turn',
      usage: { input_tokens: 12, output_tokens: 8 },
    })
  }
  return jsonResponse(404, { error: { message: 'unhandled' } })
}

type FetchFn = (url: string, init?: RequestInit) => Response | Promise<Response>

function toCustomFetch(fn: FetchFn): typeof fetch {
  // OpenAI / Anthropic SDKs accept any fetch-compatible function; the
  // global typeof fetch signature is the widest callable shape we need
  // to satisfy.
  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString()
    return fn(url, init)
  }
  return impl as unknown as typeof fetch
}

// ---------------------------------------------------------------------------
// Provider builders.
// ---------------------------------------------------------------------------

export function buildOpenAIClient(): OpenAI {
  if (isMockMode()) {
    // OpenAI 4.x accepts a custom `fetch`. The SDK's type for it is
    // narrower than the global `fetch`, so we cast via the options
    // object.
    const opts = {
      apiKey: 'sk-demo-mock',
      fetch: toCustomFetch(mockOpenAIFetch),
    } as unknown as ConstructorParameters<typeof OpenAI>[0]
    return new OpenAI(opts)
  }
  const key = process.env.OPENAI_API_KEY
  if (!key) {
    throw new Error(
      'OPENAI_API_KEY is not set. Put it in `.env` or export it, ' +
        'or set TRULAYER_DEMO_MOCK=1 for offline mode.',
    )
  }
  return new OpenAI({ apiKey: key })
}

export function buildAnthropicClient(): Anthropic {
  if (isMockMode()) {
    const opts = {
      apiKey: 'sk-ant-demo-mock',
      fetch: toCustomFetch(mockAnthropicFetch),
    } as unknown as ConstructorParameters<typeof Anthropic>[0]
    return new Anthropic(opts)
  }
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Put it in `.env` or export it, ' +
        'or set TRULAYER_DEMO_MOCK=1 for offline mode.',
    )
  }
  return new Anthropic({ apiKey: key })
}
