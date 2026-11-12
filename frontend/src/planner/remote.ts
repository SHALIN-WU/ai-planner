(function (root: typeof globalThis) {
  "use strict";

  const WORKER_ORIGIN = "https://ai-planner.shalin-wu.workers.dev";
  const PASSCODE_KEY = "ai-planner-passcode";

  function onLocalHost(): boolean {
    const host = location.hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  }

  function planUrl(): string {
    if (onLocalHost()) return "/api/plan";
    return WORKER_ORIGIN + "/api/plan";
  }

  function geocodeUrl(name: string, city: string): string {
    const query = "name=" + encodeURIComponent(name) + "&city=" + encodeURIComponent(city);
    if (onLocalHost()) return "/api/geocode?" + query;
    return WORKER_ORIGIN + "/api/geocode?" + query;
  }

  function passcode(): string {
    try {
      const value = localStorage.getItem(PASSCODE_KEY);
      return typeof value === "string" ? value : "";
    } catch (err) {
      return "";
    }
  }

  function savePasscode(value: string): void {
    localStorage.setItem(PASSCODE_KEY, value);
  }

  function clearPasscode(): void {
    localStorage.removeItem(PASSCODE_KEY);
  }

  const api: PlannerRemoteApi = {
    onLocalHost: onLocalHost,
    planUrl: planUrl,
    geocodeUrl: geocodeUrl,
    passcode: passcode,
    savePasscode: savePasscode,
    clearPasscode: clearPasscode
  };

  (root as typeof globalThis & { PlannerRemote: PlannerRemoteApi }).PlannerRemote = api;
})(globalThis);
