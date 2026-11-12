(function (root: typeof globalThis) {
  "use strict";

  const CACHE_KEY = "ai-planner-osrm-v2";
  const ENDPOINT = "https://router.project-osrm.org";
  const GAP_MS = 1000;
  const TIMEOUT_MS = 10000;

  interface LatLng {
    lat: number;
    lng: number;
  }

  interface RouteTask {
    key: string;
    from: LatLng;
    to: LatLng;
    mode: TransportMode;
    generation: number;
    bypass: boolean;
    resolve: (shape: RouteShape) => void;
  }

  let requestCount = 0;
  let generation = 0;
  let pumping = false;
  let lastStarted = 0;
  let queue: RouteTask[] = [];
  const inflight: { [key: string]: Promise<RouteShape> } = {};
  const failedKeys: { [key: string]: boolean } = {};

  function wait(ms: number): Promise<void> {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  function roundCoord(value: number): string {
    return value.toFixed(5);
  }

  function cacheKey(from: LatLng, to: LatLng, mode: TransportMode): string {
    return mode + "|" + roundCoord(from.lat) + "," + roundCoord(from.lng) + "|" + roundCoord(to.lat) + "," + roundCoord(to.lng);
  }

  function clampMinutes(value: number): number {
    if (!Number.isFinite(value)) return 1;
    return Math.max(1, Math.min(1440, Math.round(value)));
  }

  function walkMinutes(meters: number): number {
    return PlannerSchedule.travelMinutes("walk", meters);
  }

  function minutesFor(mode: TransportMode, meters: number, durationSeconds: number, network: boolean): number {
    const actual = network && Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : undefined;
    return PlannerSchedule.travelMinutes(mode, meters, actual);
  }

  function straightShape(from: LatLng, to: LatLng, mode: TransportMode): RouteShape {
    const meters = PlannerFormat.straightKm(from, to) * 1000;
    return {
      distanceMeters: Math.max(0, Math.round(meters)),
      durationMinutes: minutesFor(mode, meters, 0, false),
      coordinates: [[from.lat, from.lng], [to.lat, to.lng]],
      network: false,
      cancelled: false
    };
  }

  function cancelledShape(): RouteShape {
    return {
      distanceMeters: 0,
      durationMinutes: 1,
      coordinates: [],
      network: false,
      cancelled: true
    };
  }

  function copyShape(shape: RouteShape): RouteShape {
    const coordinates: [number, number][] = [];
    for (let index = 0; index < shape.coordinates.length; index += 1) {
      const point = shape.coordinates[index];
      if (!point) continue;
      coordinates.push([point[0], point[1]]);
    }
    return {
      distanceMeters: shape.distanceMeters,
      durationMinutes: shape.durationMinutes,
      coordinates: coordinates,
      network: shape.network,
      cancelled: false
    };
  }

  function asShape(value: unknown): RouteShape | null {
    if (!value || typeof value !== "object") return null;
    const row = value as {
      distanceMeters?: unknown;
      durationMinutes?: unknown;
      coordinates?: unknown;
      network?: unknown;
    };
    if (typeof row.distanceMeters !== "number" || !Number.isFinite(row.distanceMeters) || row.distanceMeters < 0) return null;
    if (typeof row.durationMinutes !== "number" || !Number.isFinite(row.durationMinutes)) return null;
    if (row.network !== true) return null;
    if (!Array.isArray(row.coordinates) || row.coordinates.length < 2) return null;
    const coordinates: [number, number][] = [];
    for (let index = 0; index < row.coordinates.length; index += 1) {
      const point = row.coordinates[index];
      if (!Array.isArray(point) || point.length < 2) return null;
      const lat = Number(point[0]);
      const lng = Number(point[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      coordinates.push([lat, lng]);
    }
    if (coordinates.length < 2) return null;
    return {
      distanceMeters: Math.round(row.distanceMeters),
      durationMinutes: clampMinutes(row.durationMinutes),
      coordinates: coordinates,
      network: true,
      cancelled: false
    };
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

  function readCached(key: string): RouteShape | null {
    const shape = asShape(readStore()[key]);
    if (!shape) return null;
    if (key.indexOf("walk|") === 0) shape.durationMinutes = walkMinutes(shape.distanceMeters);
    return copyShape(shape);
  }

  function writeCached(key: string, shape: RouteShape): void {
    if (!shape.network) return;
    const store = readStore();
    store[key] = {
      distanceMeters: shape.distanceMeters,
      durationMinutes: shape.durationMinutes,
      coordinates: shape.coordinates,
      network: true
    };
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(store));
    } catch (err) {
      return;
    }
  }

  function profile(mode: TransportMode): "foot" | "driving" {
    return mode === "walk" ? "foot" : "driving";
  }

  function coordParam(value: number): string {
    return String(Math.round(value * 1e6) / 1e6);
  }

  function geometryOf(value: unknown): [number, number][] | null {
    if (!value || typeof value !== "object") return null;
    const geometry = value as { coordinates?: unknown };
    if (!Array.isArray(geometry.coordinates)) return null;
    const coordinates: [number, number][] = [];
    for (let index = 0; index < geometry.coordinates.length; index += 1) {
      const pair = geometry.coordinates[index];
      if (!Array.isArray(pair) || pair.length < 2) continue;
      const lng = Number(pair[0]);
      const lat = Number(pair[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      coordinates.push([lat, lng]);
    }
    if (coordinates.length < 2) return null;
    return coordinates;
  }

  async function fetchRoute(from: LatLng, to: LatLng, mode: TransportMode): Promise<RouteShape> {
    const url = ENDPOINT + "/route/v1/" + profile(mode) + "/" +
      coordParam(from.lng) + "," + coordParam(from.lat) + ";" +
      coordParam(to.lng) + "," + coordParam(to.lat) +
      "?overview=full&geometries=geojson&alternatives=false&steps=false";
    const controller = new AbortController();
    const timer = window.setTimeout(function () {
      controller.abort();
    }, TIMEOUT_MS);
    requestCount += 1;
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return straightShape(from, to, mode);
      const body: unknown = await response.json();
      if (!body || typeof body !== "object") return straightShape(from, to, mode);
      const record = body as { code?: unknown; routes?: unknown };
      if (record.code !== "Ok" || !Array.isArray(record.routes) || !record.routes[0] || typeof record.routes[0] !== "object") {
        return straightShape(from, to, mode);
      }
      const route = record.routes[0] as { distance?: unknown; duration?: unknown; geometry?: unknown };
      const distance = Number(route.distance);
      const duration = Number(route.duration);
      const coordinates = geometryOf(route.geometry);
      if (!Number.isFinite(distance) || distance < 0 || !coordinates) return straightShape(from, to, mode);
      return {
        distanceMeters: Math.round(distance),
        durationMinutes: minutesFor(mode, distance, Number.isFinite(duration) ? duration : 0, true),
        coordinates: coordinates,
        network: true,
        cancelled: false
      };
    } catch (err) {
      return straightShape(from, to, mode);
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
      if (task.generation !== generation) {
        task.resolve(cancelledShape());
        continue;
      }
      if (!task.bypass) {
        const hit = readCached(task.key);
        if (hit) {
          task.resolve(hit);
          continue;
        }
        if (failedKeys[task.key]) {
          task.resolve(straightShape(task.from, task.to, task.mode));
          continue;
        }
      }
      const now = Date.now();
      const gap = lastStarted === 0 ? 0 : Math.max(0, GAP_MS - (now - lastStarted));
      if (gap > 0) await wait(gap);
      if (task.generation !== generation) {
        task.resolve(cancelledShape());
        continue;
      }
      if (!task.bypass) {
        const hitAgain = readCached(task.key);
        if (hitAgain) {
          task.resolve(hitAgain);
          continue;
        }
      }
      lastStarted = Date.now();
      const shape = await fetchRoute(task.from, task.to, task.mode);
      if (shape.network) writeCached(task.key, shape);
      else failedKeys[task.key] = true;
      task.resolve(shape);
    }
    pumping = false;
    if (queue.length > 0) kick();
  }

  function cached(from: LatLng, to: LatLng, mode: TransportMode): RouteShape | null {
    return readCached(cacheKey(from, to, mode));
  }

  function preview(from: LatLng, to: LatLng, mode: TransportMode): RouteShape {
    const hit = readCached(cacheKey(from, to, mode));
    if (hit) return hit;
    return straightShape(from, to, mode);
  }

  function lookup(from: LatLng, to: LatLng, mode: TransportMode, bypass: boolean): Promise<RouteShape> {
    const key = cacheKey(from, to, mode);
    if (bypass) {
      delete failedKeys[key];
    } else {
      const hit = readCached(key);
      if (hit) return Promise.resolve(hit);
      if (failedKeys[key]) return Promise.resolve(straightShape(from, to, mode));
      const existing = inflight[key];
      if (existing) return existing;
    }
    const taskGeneration = generation;
    let shared: Promise<RouteShape> = Promise.resolve(cancelledShape());
    shared = new Promise<RouteShape>(function (resolve) {
      queue.push({
        key: key,
        from: from,
        to: to,
        mode: mode,
        generation: taskGeneration,
        bypass: bypass,
        resolve: resolve
      });
      kick();
    }).then(function (shape) {
      if (inflight[key] === shared) delete inflight[key];
      return shape;
    });
    if (!bypass) inflight[key] = shared;
    return shared;
  }

  function cancelPending(): void {
    generation += 1;
    const leftover = queue;
    queue = [];
    for (let index = 0; index < leftover.length; index += 1) {
      const task = leftover[index];
      if (task) task.resolve(cancelledShape());
    }
  }

  function requestCountValue(): number {
    return requestCount;
  }

  function resetRequestCount(): void {
    requestCount = 0;
  }

  const api: PlannerRoutesApi = {
    cached: cached,
    preview: preview,
    lookup: lookup,
    cancelPending: cancelPending,
    requestCount: requestCountValue,
    resetRequestCount: resetRequestCount
  };

  (root as typeof globalThis & { PlannerRoutes: PlannerRoutesApi }).PlannerRoutes = api;
})(globalThis);
