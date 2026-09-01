FROM denoland/deno:2.9.6 AS builder
WORKDIR /srv
RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
COPY . .
RUN ./build --no-zip render-out/

FROM denoland/deno:2.9.6 AS runtime
WORKDIR /srv
COPY --from=builder /srv/render-out ./render-out
USER deno
CMD ["sh", "-c", \
    "cd render-out && HTTP_SERVER_PORT=$PORT exec ./fusion-angle serve"]
