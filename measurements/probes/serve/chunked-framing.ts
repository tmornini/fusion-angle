const ac = new AbortController();
const server = Deno.serve(
    { hostname: '127.0.0.1', port: 18457, signal: ac.signal, onListen() {} },
    async (req) => {
        const body = await req.text();
        const lines = [...req.headers.entries()]
            .filter(([k]) => k === 'transfer-encoding' || k === 'content-length')
            .map(([k, v]) => k + ': ' + v);
        console.log(JSON.stringify({ framing: lines, body }));
        return new Response('ok');
    });
setTimeout(() => ac.abort(), 5000);
await server.finished;
