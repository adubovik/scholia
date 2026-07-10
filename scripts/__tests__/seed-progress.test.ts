import { describe, it, expect, vi, afterEach } from "vitest";
import { progress } from "../seed-progress";

// Under vitest stdout has no isTTY, so `progress` takes the piped path (the
// same one migrate-seed hits under `docker compose logs`): a line each time it
// crosses a 10% boundary, rather than a carriage-return bar.
describe("progress (non-TTY)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs one line per 10% boundary, from 0% through 100%", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const bar = progress("Seeding", 10);
    for (let i = 0; i < 10; i++) bar.tick();
    bar.done();

    const lines = log.mock.calls.map((c) => c[0]);
    expect(lines).toEqual([
      "Seeding: 0% (0/10)",
      "Seeding: 10% (1/10)",
      "Seeding: 20% (2/10)",
      "Seeding: 30% (3/10)",
      "Seeding: 40% (4/10)",
      "Seeding: 50% (5/10)",
      "Seeding: 60% (6/10)",
      "Seeding: 70% (7/10)",
      "Seeding: 80% (8/10)",
      "Seeding: 90% (9/10)",
      "Seeding: 100% (10/10)",
    ]);
  });

  it("does not re-log a bucket when many ticks fall inside it", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const bar = progress("Seeding", 200); // 20 ticks per 10% bucket
    for (let i = 0; i < 200; i++) bar.tick();
    bar.done();

    // 11 boundaries (0,10,…,100), never the same one twice.
    expect(log.mock.calls).toHaveLength(11);
    expect(log.mock.calls[0][0]).toBe("Seeding: 0% (0/200)");
    expect(log.mock.calls.at(-1)?.[0]).toBe("Seeding: 100% (200/200)");
  });
});
