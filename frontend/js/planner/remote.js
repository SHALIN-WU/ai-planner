"use strict";
(function (root) {
    "use strict";
    const WORKER_ORIGIN = "https://ai-planner.shalin-wu.workers.dev";
    const PASSCODE_KEY = "ai-planner-passcode";
    function onLocalHost() {
        const host = location.hostname;
        return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
    }
    function planUrl() {
        if (onLocalHost())
            return "/api/plan";
        return WORKER_ORIGIN + "/api/plan";
    }
    function geocodeUrl(name, city) {
        const query = "name=" + encodeURIComponent(name) + "&city=" + encodeURIComponent(city);
        if (onLocalHost())
            return "/api/geocode?" + query;
        return WORKER_ORIGIN + "/api/geocode?" + query;
    }
    function passcode() {
        try {
            const value = localStorage.getItem(PASSCODE_KEY);
            return typeof value === "string" ? value : "";
        }
        catch (err) {
            return "";
        }
    }
    function savePasscode(value) {
        localStorage.setItem(PASSCODE_KEY, value);
    }
    function clearPasscode() {
        localStorage.removeItem(PASSCODE_KEY);
    }
    const api = {
        onLocalHost: onLocalHost,
        planUrl: planUrl,
        geocodeUrl: geocodeUrl,
        passcode: passcode,
        savePasscode: savePasscode,
        clearPasscode: clearPasscode
    };
    root.PlannerRemote = api;
})(globalThis);
