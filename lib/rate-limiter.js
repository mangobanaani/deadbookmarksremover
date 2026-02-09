/**
 * Domain-based rate limiter. Limits concurrent requests per domain.
 */
class DomainRateLimiter {
  constructor(maxPerDomain = 2) {
    this.maxPerDomain = maxPerDomain;
    this.active = new Map(); // domain -> count
    this.waiting = new Map(); // domain -> [resolve callbacks]
  }

  async acquire(domain) {
    const current = this.active.get(domain) || 0;
    if (current < this.maxPerDomain) {
      this.active.set(domain, current + 1);
      return;
    }

    // Wait for a slot
    return new Promise((resolve) => {
      const queue = this.waiting.get(domain) || [];
      queue.push(resolve);
      this.waiting.set(domain, queue);
    });
  }

  release(domain) {
    const current = this.active.get(domain) || 0;
    if (current <= 1) {
      this.active.delete(domain);
    } else {
      this.active.set(domain, current - 1);
    }

    // Wake up next waiter
    const queue = this.waiting.get(domain);
    if (queue && queue.length > 0) {
      const next = queue.shift();
      if (queue.length === 0) this.waiting.delete(domain);
      this.active.set(domain, (this.active.get(domain) || 0) + 1);
      next();
    }
  }

  reset() {
    this.active.clear();
    this.waiting.clear();
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { DomainRateLimiter };
}
