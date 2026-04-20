/**
 * Local HTTP server that mimics the TruLayer ingestion + feedback endpoints.
 *
 * Used by the demos and smoke tests to observe the end-to-end data flow
 * without needing a real backend. Stores every received payload in memory
 * and exposes it via `getReceived()`.
 */
import { createServer, type Server } from 'node:http'
import { AddressInfo } from 'node:net'

export type IngestBatch = { traces: Array<Record<string, unknown>> }
export type FeedbackBody = Record<string, unknown>

const received: { batches: IngestBatch[]; feedback: FeedbackBody[] } = {
  batches: [],
  feedback: [],
}

export function getReceived(): { batches: IngestBatch[]; feedback: FeedbackBody[] } {
  return { batches: [...received.batches], feedback: [...received.feedback] }
}

export function resetReceived(): void {
  received.batches.length = 0
  received.feedback.length = 0
}

export interface RunningMockServer {
  url: string
  close: () => Promise<void>
}

export async function startMockServer(): Promise<RunningMockServer> {
  resetReceived()
  const server: Server = createServer((req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end()
      return
    }
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c as Buffer))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8')
      let payload: unknown
      try {
        payload = raw.length > 0 ? JSON.parse(raw) : {}
      } catch {
        res.statusCode = 400
        res.end()
        return
      }
      const path = req.url ?? ''
      if (path.startsWith('/v1/ingest/batch')) {
        received.batches.push(payload as IngestBatch)
      } else if (path.startsWith('/v1/feedback')) {
        received.feedback.push(payload as FeedbackBody)
      } else {
        res.statusCode = 404
        res.end()
        return
      }
      res.setHeader('content-type', 'application/json')
      res.end('{"ok":true}')
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  const url = `http://127.0.0.1:${address.port}`

  return {
    url,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()))
      }),
  }
}

// Invoked via `pnpm mock-server` — run until the user hits Ctrl-C.
if (import.meta.url === `file://${process.argv[1]}`) {
  const srv = await startMockServer()
  console.log(`Mock TruLayer ingestion server listening on ${srv.url}`)
  console.log('Point TRULAYER_ENDPOINT at this URL to observe demo traffic.')
  console.log('Press Ctrl-C to stop.')
  process.on('SIGINT', async () => {
    console.log('\nReceived:', JSON.stringify(getReceived(), null, 2))
    await srv.close()
    process.exit(0)
  })
}
