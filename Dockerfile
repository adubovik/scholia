# Dev image for local e2e. Ships source + deps so the one-shot seed service
# works standalone; the `app` service bind-mounts source over this for hot reload.
FROM node:24-slim

RUN corepack enable
WORKDIR /app

# Install deps first for layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 3000
CMD ["pnpm", "exec", "next", "dev", "-H", "0.0.0.0", "-p", "3000"]