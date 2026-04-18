# TruLayer AI — TypeScript Demos

End-to-end TypeScript/Node.js examples demonstrating TruLayer AI SDK integration across common AI use cases.

## Prerequisites

```bash
pnpm install
```

Set your API keys in `.env`:

```bash
TRULAYER_API_KEY=tl_...
OPENAI_API_KEY=sk-...
```

## Examples

### Basic Tracing

```bash
pnpm example basic-trace
```

Manual trace and span creation with a simple OpenAI call.

### OpenAI Auto-Instrumentation

```bash
pnpm example openai-auto
```

Zero-code instrumentation of the OpenAI client.

### RAG Pipeline

```bash
pnpm example rag-pipeline
```

Multi-span trace for retrieval-augmented generation.

### Multi-Step Agent

```bash
pnpm example agent
```

Tool-calling agent traced across multiple reasoning steps.

### Vercel AI SDK Integration

```bash
pnpm example vercel-ai
```

Tracing with the Vercel AI SDK (`streamText`, `generateObject`).

### Next.js API Route

```bash
pnpm example nextjs-route
```

Tracing an AI-powered Next.js App Router API route.

### Feedback Submission

```bash
pnpm example feedback
```

Attaches user feedback to completed traces.

## Project Structure

```text
demo-typescript/
├── examples/
│   ├── basic-trace.ts
│   ├── openai-auto.ts
│   ├── rag-pipeline.ts
│   ├── agent.ts
│   ├── vercel-ai.ts
│   ├── nextjs-route.ts
│   └── feedback.ts
├── package.json
├── tsconfig.json
└── pnpm-lock.yaml
```

## Engineering Standards

- Every example must run end-to-end without errors
- Examples are integration-tested in CI
- TypeScript strict mode — no `any`
- Keep examples minimal — one concept per file
