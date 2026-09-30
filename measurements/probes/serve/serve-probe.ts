// Throwaway probe: what Deno.serve hands the handler, and what it
// puts on the wire that the handler never wrote.
const body = JSON.stringify({ filler: 'x'.repeat(400) })
const seen: [string, string][][] = []
const server = Deno.serve({ port: 0, onListen() {} }, (request) => {
    seen.push([...request.headers])
    return new Response(body, {
        status: 201,
        headers: {
            'content-type': 'application/json',
            'etag': '"abc"',
            'date': 'Thu, 01 Jan 2026 00:00:00 GMT',
            'operation-id': 'op-1',
        },
    })
})
const { port } = server.addr as Deno.NetAddr

async function rawHead(extraHeaders: string): Promise<string> {
    const connection = await Deno.connect({ port })
    try {
        await connection.write(new TextEncoder().encode(
            'GET / HTTP/1.1\r\nHost: localhost\r\n' + extraHeaders +
                'Connection: close\r\n\r\n',
        ))
        const chunks: Uint8Array[] = []
        const buffer = new Uint8Array(65536)
        for (;;) {
            const count = await connection.read(buffer)
            if (count === null) break
            chunks.push(buffer.slice(0, count))
        }
        const total = chunks.reduce((sum, c) => sum + c.length, 0)
        const all = new Uint8Array(total)
        let offset = 0
        for (const chunk of chunks) {
            all.set(chunk, offset)
            offset += chunk.length
        }
        const text = new TextDecoder('latin1').decode(all)
        return text.slice(0, text.indexOf('\r\n\r\n'))
    } finally {
        connection.close()
    }
}

console.log('--- wire, no accept-encoding ---')
console.log(await rawHead('Zeta: 1\r\nalpha: 2\r\nBeta: 3\r\nalpha: 4\r\n'))
console.log('--- wire, accept-encoding: gzip ---')
console.log(await rawHead('Accept-Encoding: gzip\r\n'))
console.log('--- request.headers iteration, first request ---')
console.log(JSON.stringify(seen[0]))
await server.shutdown()
