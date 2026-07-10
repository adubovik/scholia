// Tiny progress reporters for the docker seed. Both degrade gracefully when
// there's no TTY: under `docker compose logs` (the migrate-seed case) stdout is
// piped, so a carriage-return bar would smear into noise — we print discrete
// lines instead. In an interactive terminal they redraw a single line.

const isTty = Boolean(process.stdout.isTTY);
const BAR_WIDTH = 24;

export interface Progress {
  tick: (n?: number) => void;
  done: () => void;
}

/**
 * Determinate progress for a loop of known size. In a TTY it redraws a filled
 * bar; piped, it logs one line each time it crosses a 10% boundary (0, 10, …,
 * 100) so the output stays short but shows forward motion.
 */
export function progress(label: string, total: number): Progress {
  let current = 0;
  let lastBucket = -1;

  const render = () => {
    const pct = total === 0 ? 100 : Math.floor((current / total) * 100);
    if (isTty) {
      const filled = Math.round((pct / 100) * BAR_WIDTH);
      const bar = "█".repeat(filled) + "░".repeat(BAR_WIDTH - filled);
      process.stdout.write(`\r${label} [${bar}] ${String(pct).padStart(3)}% (${current}/${total})`);
      return;
    }
    const bucket = Math.floor(pct / 10) * 10;
    if (bucket > lastBucket) {
      lastBucket = bucket;
      console.log(`${label}: ${bucket}% (${current}/${total})`);
    }
  };

  render(); // show 0% up front so the phase is visible before the first tick
  return {
    tick(n = 1) {
      current = Math.min(total, current + n);
      render();
    },
    done() {
      current = total;
      render();
      if (isTty) process.stdout.write("\n");
    },
  };
}

/**
 * Indeterminate heartbeat for a single long `await` (network fetch, big batch)
 * where there's no count to show. Emits an elapsed-time pulse so the phase never
 * looks frozen — an animated spinner in a TTY, a line every few seconds piped.
 */
export async function withSpinner<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const elapsed = () => ((Date.now() - start) / 1000).toFixed(1);
  let frame = 0;

  if (!isTty) console.log(`${label}…`);
  const timer = setInterval(() => {
    if (isTty) process.stdout.write(`\r${frames[frame++ % frames.length]} ${label} (${elapsed()}s)`);
    else console.log(`  …still working (${elapsed()}s)`);
  }, isTty ? 100 : 3000);

  try {
    const result = await fn();
    if (isTty) process.stdout.write(`\r✓ ${label} (${elapsed()}s)\n`);
    else console.log(`${label} ✓ (${elapsed()}s)`);
    return result;
  } catch (err) {
    if (isTty) process.stdout.write("\n");
    throw err;
  } finally {
    clearInterval(timer);
  }
}
