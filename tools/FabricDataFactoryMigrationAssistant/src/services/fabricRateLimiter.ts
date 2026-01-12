/**
 * Central Fabric API rate limiter and fetch wrapper.
 * Limits to 50 requests per rolling minute (per browser session / user tab).
 * Provides basic 429 retry with exponential backoff honoring Retry-After.
 */

const MAX_REQUESTS_PER_MINUTE = 50;
const WINDOW_MS = 60_000;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 750; // initial backoff for 429 without Retry-After

interface QueueItem {
  resolve: (value: Response | PromiseLike<Response>) => void;
  reject: (reason?: any) => void;
  input: RequestInfo | URL;
  init?: RequestInit;
  attempt: number;
}

class FabricRateLimiter {
  private timestamps: number[] = [];
  private queue: QueueItem[] = [];
  private processing = false;

  async schedule(input: RequestInfo | URL, init?: RequestInit, attempt = 0): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
      this.queue.push({ resolve, reject, input, init, attempt });
      this.process();
    });
  }

  private process() {
    if (this.processing) return;
    this.processing = true;

    const loop = () => {
      this.cleanup();
      while (this.queue.length > 0) {
        if (this.timestamps.length >= MAX_REQUESTS_PER_MINUTE) {
          // Need to wait until earliest timestamp exits window
          const now = Date.now();
            const waitFor = Math.max(0, (this.timestamps[0] + WINDOW_MS) - now) + 25; // add small buffer
          setTimeout(() => {
            this.processing = false;
            this.process();
          }, waitFor);
          return;
        }
        const item = this.queue.shift()!;
        this.timestamps.push(Date.now());
        this.execute(item);
      }
      this.processing = false;
    };

    loop();
  }

  private cleanup() {
    const cutoff = Date.now() - WINDOW_MS;
    // Remove old timestamps
    while (this.timestamps.length && this.timestamps[0] < cutoff) {
      this.timestamps.shift();
    }
  }

  private async execute(item: QueueItem) {
    try {
      const response = await fetch(item.input, item.init);
      if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
        if (item.attempt < MAX_RETRIES) {
          const retryAfterHeader = response.headers.get('Retry-After');
          let delay = retryAfterHeader ? parseFloat(retryAfterHeader) * 1000 : (BASE_BACKOFF_MS * Math.pow(2, item.attempt));
          if (!isFinite(delay) || delay <= 0) delay = BASE_BACKOFF_MS;
          // jitter
          delay += Math.random() * 250;
          setTimeout(() => {
            this.queue.unshift({ ...item, attempt: item.attempt + 1 });
            this.process();
          }, delay);
          return;
        }
      }
      item.resolve(response);
    } catch (err) {
      if (item.attempt < MAX_RETRIES) {
        const delay = (BASE_BACKOFF_MS * Math.pow(2, item.attempt)) + Math.random() * 250;
        setTimeout(() => {
          this.queue.unshift({ ...item, attempt: item.attempt + 1 });
          this.process();
        }, delay);
        return;
      }
      item.reject(err);
    }
  }
}

const limiter = new FabricRateLimiter();

export async function fabricFetch(input: RequestInfo | URL, init?: RequestInit) {
  return limiter.schedule(input, init);
}

// Convenience JSON helper with error throwing
export async function fabricFetchJson<T = any>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fabricFetch(input, init);
  if (!res.ok) {
    let body: any = null;
    try { body = await res.json(); } catch { /* ignore */ }
    const err: any = new Error(`Fabric API error ${res.status} ${res.statusText}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return res.json();
}
