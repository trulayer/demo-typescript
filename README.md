# TruLayer AI — TypeScript Demos

Runnable, end-to-end TypeScript / Node.js examples that show how to
trace AI applications with the
[`@trulayer/sdk`](../client-typescript) package. Every example emits
real traces and spans; `feedback.ts` also posts user feedback against
a trace.

## Quick start

```bash
# From this directory:
cp .env.example .env     # then fill in your keys
pnpm install
pnpm basic-trace         # or any other example script below
```

Set in `.env` at minimum:

```
TRULAYER_API_KEY=tl_...
TRULAYER_PROJECT_NAME=my-project
TRULAYER_ENDPOINT=https://api.trulayer.ai   # or http://127.0.0.1:8080 for local dev
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

## Offline / CI mode

Set `TRULAYER_DEMO_MOCK=1` and every OpenAI / Anthropic call is routed
through an in-process mock `fetch`. No real keys required, no network
touched. Used by `pnpm run-all` and `pnpm test`.

```bash
pnpm run-all
```

This spins up a local HTTP server that mimics the TruLayer ingestion
endpoints, runs every example against it, and prints a summary of the
batches and feedback it received — an end-to-end data-flow check.

## Examples

| Script              | Shows                                                                    |
|---------------------|--------------------------------------------------------------------------|
| `pnpm basic-trace`  | Manual `trace()` / `span()` with a real OpenAI call                       |
| `pnpm openai-auto`  | `instrumentOpenAI()` — zero per-call span code                           |
| `pnpm anthropic-auto` | `instrumentAnthropic()` — same pattern, Claude Messages API            |
| `pnpm langchain-chain` | A `BaseCallbackHandler` that records spans for any LangChain runnable  |
| `pnpm rag-pipeline` | Embed → retrieve → generate, three span types in one trace                |
| `pnpm agent`        | Tool-calling agent loop, one span per tool + one per LLM turn             |
| `pnpm streaming`    | Streaming chat response captured into a single span                       |
| `pnpm feedback`     | Trace an answer and attach a thumbs-up feedback record                    |
| `pnpm run-all`      | Orchestrate every example against the local mock ingestion server        |
| `pnpm mock-server`  | Start the mock ingestion server standalone for local inspection          |

## Tests

```bash
pnpm test
```

The Vitest suite runs in mock mode, starts the mock ingestion server
per-test, and asserts that each example's payload actually arrived —
including trace tags, span types, and feedback linkage.

## Project layout

```
demo-typescript/
├── .env.example
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── examples/
│   ├── _config.ts        # .env loader + TruLayer / OpenAI / Anthropic clients
│   ├── mock-server.ts    # local HTTP stand-in for the ingestion API
│   ├── basic-trace.ts
│   ├── openai-auto.ts
│   ├── anthropic-auto.ts
│   ├── langchain-chain.ts
│   ├── rag-pipeline.ts
│   ├── agent.ts
│   ├── streaming.ts
│   ├── feedback.ts
│   └── run-all.ts
└── tests/
    └── smoke.test.ts      # end-to-end smoke tests
```
