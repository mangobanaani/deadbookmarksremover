const { DomainRateLimiter } = require("../lib/rate-limiter");

describe("DomainRateLimiter", () => {
  test("allows up to maxPerDomain concurrent acquires", async () => {
    const limiter = new DomainRateLimiter(2);

    // These should resolve immediately
    await limiter.acquire("example.com");
    await limiter.acquire("example.com");

    expect(limiter.active.get("example.com")).toBe(2);
  });

  test("blocks third acquire until release", async () => {
    const limiter = new DomainRateLimiter(2);

    await limiter.acquire("example.com");
    await limiter.acquire("example.com");

    let thirdResolved = false;
    const thirdPromise = limiter.acquire("example.com").then(() => {
      thirdResolved = true;
    });

    // Third should be waiting
    await Promise.resolve(); // flush microtask
    expect(thirdResolved).toBe(false);

    // Release one slot
    limiter.release("example.com");
    await thirdPromise;
    expect(thirdResolved).toBe(true);
  });

  test("different domains are independent", async () => {
    const limiter = new DomainRateLimiter(1);

    await limiter.acquire("a.com");
    await limiter.acquire("b.com");

    expect(limiter.active.get("a.com")).toBe(1);
    expect(limiter.active.get("b.com")).toBe(1);
  });

  test("release cleans up when count reaches zero", async () => {
    const limiter = new DomainRateLimiter(2);

    await limiter.acquire("example.com");
    limiter.release("example.com");

    expect(limiter.active.has("example.com")).toBe(false);
  });

  test("reset clears all state", async () => {
    const limiter = new DomainRateLimiter(2);

    await limiter.acquire("a.com");
    await limiter.acquire("b.com");

    limiter.reset();
    expect(limiter.active.size).toBe(0);
    expect(limiter.waiting.size).toBe(0);
  });

  test("multiple waiters are served in order", async () => {
    const limiter = new DomainRateLimiter(1);
    const order = [];

    await limiter.acquire("x.com");

    const p1 = limiter.acquire("x.com").then(() => order.push(1));
    const p2 = limiter.acquire("x.com").then(() => {
      order.push(2);
      limiter.release("x.com");
    });

    limiter.release("x.com");
    await p1;
    limiter.release("x.com");
    await p2;

    expect(order).toEqual([1, 2]);
  });

  test("default maxPerDomain is 2", () => {
    const limiter = new DomainRateLimiter();
    expect(limiter.maxPerDomain).toBe(2);
  });
});
