// Throwaway probe 2: does Deno.serve compress, and what does that
// do to a strong etag?
const body = JSON.stringify({ filler: 'x'.repeat(5000) })
const seen: string[] = []
const server = Deno.serve({ port: 0, onListen() {} }, (request) => {
    seen.push(new URL(request.url).pathname + ' accept-encoding=' +
        request.headers.get('accept-encoding'))
    const headers: Record<string, string> = {
        'content-type': 'application/json',
    }
    if (request.url.endsWith('/etag')) headers['etag'] = '"abc"'
    return new Response(body, { status: 201, headers })
})
const { port } = server.addr as Deno.NetAddr
async function rawHead(path: string): Promise<string> {
    const connection = await Deno.connect({ port })
    try {
        await connection.write(new TextEncoder().encode(
            'GET ' + path + ' HTTP/1.1\r\nHost: localhost\r\n' +
                'Accept-Encoding: gzip, br\r\nConnection: close\r\n\r\n',
        ))
        let text = ''
        const buffer = new Uint8Array(65536)
        for (;;) {
            const count = await connection.read(buffer)
            if (count === null) break
            text += new TextDecoder('latin1').decode(
                buffer.slice(0, count))
        }
        return text.slice(0, text.indexOf('\r\n\r\n'))
    } finally {
        connection.close()
    }
}
for (const path of ['/etag', '/noetag']) {
    console.log('--- wire ' + path + ' ---')
    console.log(await rawHead(path))
}
console.log(seen.join('\n'))
await server.shutdown()
