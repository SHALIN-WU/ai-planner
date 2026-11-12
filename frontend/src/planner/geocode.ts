(function (root: typeof globalThis) {
  "use strict";

  const CACHE_KEY = "ai-planner-geocode-v1";
  const GAP_MS = 1000;
  const TIMEOUT_MS = 10000;

  interface Hit {
    lat: number;
    lng: number;
  }

  interface Task {
    key: string;
    name: string;
    city: string;
    resolve: (hit: Hit | null) => void;
  }

  interface Cached {
    known: boolean;
    hit: Hit | null;
  }

  let pumping = false;
  let lastStarted = 0;
  let queue: Task[] = [];
  const inflight: { [key: string]: Promise<Hit | null> } = {};

  function wait(ms: number): Promise<void> {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  function cacheKey(name: string, city: string): string {
    const place = name.trim().toLowerCase().replace(/\s+/g, "");
    const area = city.trim().toLowerCase().replace(/\s+/g, "");
    return place + "|" + area;
  }

  function asHit(lat: unknown, lng: unknown): Hit | null {
    if (typeof lat !== "number" || typeof lng !== "number") return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    if (lat === 0 && lng === 0) return null;
    return { lat: lat, lng: lng };
  }

  function readStore(): { [key: string]: unknown } {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return {};
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      return parsed as { [key: string]: unknown };
    } catch (err) {
      return {};
    }
  }

  function readCached(key: string): Cached {
    const value = readStore()[key];
    if (!value || typeof value !== "object" || Array.isArray(value)) return { known: false, hit: null };
    const row = value as { miss?: unknown; lat?: unknown; lng?: unknown };
    if (row.miss === true) return { known: true, hit: null };
    const hit = asHit(row.lat, row.lng);
    if (!hit) return { known: false, hit: null };
    return { known: true, hit: hit };
  }

  function writeCached(key: string, hit: Hit | null): void {
    const store = readStore();
    store[key] = hit ? { lat: hit.lat, lng: hit.lng } : { miss: true };
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(store));
    } catch (err) {
      return;
    }
  }

  async function fetchHit(name: string, city: string): Promise<{ hit: Hit | null; remember: boolean }> {
    const url = PlannerRemote.geocodeUrl(name, city);
    const controller = new AbortController();
    const timer = window.setTimeout(function () {
      controller.abort();
    }, TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return { hit: null, remember: false };
      const body: unknown = await response.json();
      if (!body || typeof body !== "object") return { hit: null, remember: false };
      const record = body as { found?: unknown; lat?: unknown; lng?: unknown };
      if (record.found === false) return { hit: null, remember: true };
      const hit = asHit(record.lat, record.lng);
      if (!hit) return { hit: null, remember: false };
      return { hit: hit, remember: true };
    } catch (err) {
      return { hit: null, remember: false };
    } finally {
      window.clearTimeout(timer);
    }
  }

  function kick(): void {
    if (pumping) return;
    pumping = true;
    void pump();
  }

  async function pump(): Promise<void> {
    while (queue.length > 0) {
      const task = queue.shift();
      if (!task) break;
      const known = readCached(task.key);
      if (known.known) {
        task.resolve(known.hit);
        continue;
      }
      const now = Date.now();
      const gap = lastStarted === 0 ? 0 : Math.max(0, GAP_MS - (now - lastStarted));
      if (gap > 0) await wait(gap);
      const again = readCached(task.key);
      if (again.known) {
        task.resolve(again.hit);
        continue;
      }
      lastStarted = Date.now();
      const result = await fetchHit(task.name, task.city);
      if (result.remember) writeCached(task.key, result.hit);
      task.resolve(result.hit);
    }
    pumping = false;
    if (queue.length > 0) kick();
  }

  function lookup(name: string, city: string): Promise<Hit | null> {
    const place = name.trim();
    const area = city.trim();
    if (place === "" || area === "") return Promise.resolve(null);
    const key = cacheKey(place, area);
    const known = readCached(key);
    if (known.known) return Promise.resolve(known.hit);
    const existing = inflight[key];
    if (existing) return existing;
    let shared: Promise<Hit | null> = Promise.resolve(null);
    shared = new Promise<Hit | null>(function (resolve) {
      queue.push({
        key: key,
        name: place,
        city: area,
        resolve: resolve
      });
      kick();
    }).then(function (hit) {
      if (inflight[key] === shared) delete inflight[key];
      return hit;
    });
    inflight[key] = shared;
    return shared;
  }

  const api: PlannerGeocodeApi = {
    lookup: lookup
  };

  (root as typeof globalThis & { PlannerGeocode: PlannerGeocodeApi }).PlannerGeocode = api;
})(globalThis);
