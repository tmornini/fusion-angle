FROM denoland/deno:2.9.8 AS builder
WORKDIR /srv
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY . .
ARG RENDER_GIT_COMMIT
ARG RENDER_GIT_REPO_SLUG
ARG FUSION_COMMIT_LOG_BASE64
RUN ./bin/build --no-zip render-out/

FROM denoland/deno:2.9.8 AS runtime
WORKDIR /srv
COPY --from=builder /srv/render-out ./render-out
USER deno
CMD ["sh", "-c", \
    "cd render-out && exec ./fusion-angle serve"]
