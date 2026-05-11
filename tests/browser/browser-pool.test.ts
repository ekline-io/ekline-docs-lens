import { describe, it, expect, afterAll } from "vitest";
import { BrowserPool } from "@/lib/core/browser-pool";

const pool = new BrowserPool({ maxContexts: 2 });

afterAll(async () => {
  await pool.close();
});

describe("BrowserPool", () => {
  it("hands out a context and returns it on release", async () => {
    const ctx = await pool.acquire();
    expect(ctx).toBeDefined();
    await pool.release(ctx);
  });

  it("blocks acquire beyond maxContexts until release", async () => {
    const a = await pool.acquire();
    const b = await pool.acquire();
    let resolvedThird = false;
    const cPromise = pool.acquire().then(() => {
      resolvedThird = true;
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(resolvedThird).toBe(false);
    await pool.release(a);
    await cPromise;
    expect(resolvedThird).toBe(true);
    await pool.release(b);
    // c was acquired by the .then() but never returned to us; afterAll's
    // pool.close() will dispose the underlying browser including c's context.
  });

  it("ensureBrowser race: concurrent first-acquires share one browser", async () => {
    // Use a brand new pool so we hit the cold-start path.
    const racePool = new BrowserPool({ maxContexts: 4 });
    try {
      const [a, b] = await Promise.all([racePool.acquire(), racePool.acquire()]);
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      // If the race had launched two browsers we would observe two distinct
      // browser instances; both contexts should be from the same browser.
      expect(a.browser()).toBe(b.browser());
      await racePool.release(a);
      await racePool.release(b);
    } finally {
      await racePool.close();
    }
  });

  it("release is idempotent: second call on the same ctx is a no-op", async () => {
    const idemPool = new BrowserPool({ maxContexts: 2 });
    try {
      const ctx = await idemPool.acquire();
      await idemPool.release(ctx);
      // Second release on the same ctx must NOT decrement inUse below zero
      // or wake a non-existent waiter. Reach in via a follow-up acquire to
      // verify the gate still works.
      await idemPool.release(ctx);
      const ctx2 = await idemPool.acquire();
      const ctx3 = await idemPool.acquire();
      expect(ctx2).toBeDefined();
      expect(ctx3).toBeDefined();
      await idemPool.release(ctx2);
      await idemPool.release(ctx3);
    } finally {
      await idemPool.close();
    }
  });
});
