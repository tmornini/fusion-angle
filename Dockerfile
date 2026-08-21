FROM node:24 AS builder
WORKDIR /srv
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN ./build --no-zip render-out/

FROM node:24-slim AS runtime
WORKDIR /srv
COPY --from=builder /srv/render-out ./render-out
USER node
CMD ["sh", "-c", \
    "cd render-out && HTTP_SERVER_PORT=$PORT exec node server.mjs"]
