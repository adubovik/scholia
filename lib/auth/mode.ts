/**
 * Local-only auth bypass switch. True only in the docker/e2e environment:
 * `SCHOLIA_AUTH=dev` must be set AND we must NOT be running on Vercel, so the
 * bypass can never activate on a real deploy.
 */
export function isDevAuth(): boolean {
  return process.env.SCHOLIA_AUTH === "dev" && !process.env.VERCEL;
}
