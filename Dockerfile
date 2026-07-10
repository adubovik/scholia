# Dev image for local e2e. Ships source + deps so the one-shot seed service
# works standalone; the `app` service bind-mounts source over this for hot reload.
FROM node:24-slim

# Pin pnpm to the repo's local dev version for reproducible installs
# (corepack's default floats — 11.11.0 at time of writing).
RUN corepack enable && corepack prepare pnpm@11.10.0 --activate

# pnpm 11 fatally errors on unapproved dependency build scripts during a cold
# install (the workspace's onlyBuiltDependencies allowlist isn't honored here).
# The build install below passes --config.strict-dep-builds=false explicitly to
# downgrade that to a warning: esbuild's binary (needed by tsx/the seed) still
# resolves via optional deps, and sharp/unrs-resolver aren't needed by the dev
# server or the seed. (pnpm 11 no longer reads these knobs from ~/.npmrc, so the
# runtime deps-check can't be silenced that way — the app CMD bypasses pnpm
# entirely instead; see the CMD note below.)

WORKDIR /app

# Install deps first for layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --config.strict-dep-builds=false

COPY . .

EXPOSE 3000
# Invoke the next binary directly rather than via `pnpm exec`. pnpm 11 runs a
# pre-run deps-status check on every `pnpm exec`/`pnpm run`, which shells out to
# `pnpm install` — in this non-interactive container that either aborts on a
# node_modules purge needing a TTY (ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY)
# or fails on ignored build scripts, exiting the container. Deps are already
# installed at build time, so skip the check by not going through pnpm.
CMD ["node_modules/.bin/next", "dev", "-H", "0.0.0.0", "-p", "3000"]
