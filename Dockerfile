# Dev image for local e2e. Ships source + deps so the one-shot seed service
# works standalone; the `app` service bind-mounts source over this for hot reload.
FROM node:24-slim

# Pin pnpm to the repo's local dev version for reproducible installs
# (corepack's default floats — 11.11.0 at time of writing).
RUN corepack enable && corepack prepare pnpm@11.10.0 --activate

# pnpm 11 fatally errors on unapproved dependency build scripts during a cold
# install (the workspace's onlyBuiltDependencies allowlist isn't honored here).
# Downgrade that to a warning globally: esbuild's binary (needed by tsx/the seed)
# still resolves via optional deps, and sharp/unrs-resolver aren't needed by the
# dev server or the seed. Kept in ~/.npmrc so the runtime /app bind-mount can't
# clobber it and so the deps-check `pnpm exec` runs at startup also stays green.
RUN printf 'strict-dep-builds=false\n' > /root/.npmrc

WORKDIR /app

# Install deps first for layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --config.strict-dep-builds=false

COPY . .

EXPOSE 3000
CMD ["pnpm", "exec", "next", "dev", "-H", "0.0.0.0", "-p", "3000"]