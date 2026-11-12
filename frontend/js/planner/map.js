"use strict";
(function (root) {
    "use strict";
    const CITIES = {
        "東京": [35.6812, 139.7671],
        "大阪": [34.6937, 135.5023],
        "京都": [35.0116, 135.7681],
        "首爾": [37.5665, 126.978],
        "台北": [25.033, 121.5654],
        "福岡": [33.5904, 130.4017]
    };
    const TOKYO = [35.6812, 139.7671];
    let map = null;
    let markers = {};
    let routeLines = [];
    function leaflet() {
        const candidate = root.L;
        if (!candidate || typeof candidate.map !== "function")
            return null;
        return candidate;
    }
    function escapeHtml(value) {
        return value.replace(/[&<>"']/g, function (char) {
            if (char === "&")
                return "&amp;";
            if (char === "<")
                return "&lt;";
            if (char === ">")
                return "&gt;";
            if (char === '"')
                return "&quot;";
            return "&#39;";
        });
    }
    function cityCenter(destination) {
        const hit = CITIES[destination.trim()];
        if (!hit)
            return null;
        return { name: destination.trim(), lat: hit[0], lng: hit[1] };
    }
    function popupHtml(item) {
        const meta = PlannerFormat.placeMeta(item.type);
        const duration = PlannerFormat.formatDuration(item.durationMinutes);
        return '<p class="pin-pop-name">' + escapeHtml(item.name) + "</p>" +
            '<p class="pin-pop-meta">' + escapeHtml(meta.label) + " · 停留 " + escapeHtml(duration) + "</p>";
    }
    function stayPopup(stay) {
        const nights = PlannerFormat.nightCount(stay.checkIn, stay.checkOut);
        return '<p class="pin-pop-name">' + escapeHtml(stay.name) + "</p>" +
            '<p class="pin-pop-meta">今晚住宿 · ' + escapeHtml(String(nights)) + " 晚</p>";
    }
    function usablePoints(points) {
        const list = [];
        for (let index = 0; index < points.length; index += 1) {
            const point = points[index];
            if (!point || !PlannerFormat.isMappableLocation(point))
                continue;
            list.push([point.lat, point.lng]);
        }
        return list;
    }
    function showArea(current, library, destination, fallbackPoints) {
        const city = cityCenter(destination);
        if (city) {
            current.setView([city.lat, city.lng], 12);
            return;
        }
        const points = usablePoints(fallbackPoints);
        if (points.length === 0) {
            current.setView(TOKYO, 12);
            return;
        }
        if (points.length === 1) {
            const only = points[0];
            if (only)
                current.setView(only, 12);
            return;
        }
        current.fitBounds(library.latLngBounds(points), { padding: [28, 28], maxZoom: 12 });
    }
    function clearRouteLines() {
        for (let index = 0; index < routeLines.length; index += 1) {
            const line = routeLines[index];
            if (line)
                line.remove();
        }
        routeLines = [];
    }
    function lineOptions(kind) {
        if (kind === "drive")
            return { color: "#0e7c74", weight: 7, opacity: 0.9, interactive: false };
        if (kind === "transit")
            return { color: "#0e7c74", weight: 4, opacity: 0.9, interactive: false, dashArray: "8 7" };
        if (kind === "walk")
            return { color: "#0e7c74", weight: 4, opacity: 0.9, interactive: false };
        return { color: "#0e7c74", weight: 3, opacity: 0.85, interactive: false };
    }
    function setRoutes(segments) {
        const current = map;
        const library = leaflet();
        if (!current || !library)
            return;
        clearRouteLines();
        const nextLines = [];
        for (let index = 0; index < segments.length; index += 1) {
            const segment = segments[index];
            if (!segment || segment.coordinates.length < 2)
                continue;
            const layer = library.polyline(segment.coordinates.slice(), lineOptions(segment.kind));
            layer.addTo(current);
            nextLines.push(layer);
        }
        routeLines = nextLines;
    }
    function unmount() {
        clearRouteLines();
        if (map)
            map.remove();
        map = null;
        markers = {};
    }
    function mount(options) {
        unmount();
        const found = leaflet();
        if (!found)
            return;
        const library = found;
        const current = library.map(options.container);
        map = current;
        library.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(current);
        const bounds = [];
        const nextMarkers = {};
        for (let index = 0; index < options.items.length; index += 1) {
            const item = options.items[index];
            if (!item || !PlannerFormat.isMappableLocation(item.location))
                continue;
            const latlng = [item.location.lat, item.location.lng];
            bounds.push(latlng);
            const marker = library.marker(latlng, {
                icon: library.divIcon({
                    className: "stop-pin stop-pin-" + item.type,
                    html: String(index + 1),
                    iconSize: [28, 28],
                    iconAnchor: [14, 14]
                }),
                title: item.name,
                keyboard: true
            });
            marker.bindPopup(popupHtml(item));
            marker.on("click", function () {
                options.onSelect(item.id);
            });
            marker.addTo(current);
            nextMarkers[item.id] = marker;
        }
        for (let index = 0; index < options.lodging.length; index += 1) {
            const stay = options.lodging[index];
            if (!stay)
                continue;
            const location = stay.location;
            if (!PlannerFormat.isMappableLocation(location))
                continue;
            const latlng = [location.lat, location.lng];
            bounds.push(latlng);
            const marker = library.marker(latlng, {
                icon: library.divIcon({
                    className: "stop-pin stop-pin-stay",
                    html: "🏨",
                    iconSize: [32, 32],
                    iconAnchor: [16, 16]
                }),
                title: stay.name,
                keyboard: true
            });
            marker.bindPopup(stayPopup(stay));
            marker.on("click", function () {
                options.onSelect(stay.id);
            });
            marker.addTo(current);
            nextMarkers[stay.id] = marker;
        }
        markers = nextMarkers;
        function applyView() {
            if (map !== current)
                return;
            if (bounds.length === 0) {
                showArea(current, library, options.destination, options.fallbackPoints);
                return;
            }
            if (bounds.length === 1) {
                const only = bounds[0];
                if (only)
                    current.setView(only, 15);
                return;
            }
            current.fitBounds(library.latLngBounds(bounds), { padding: [32, 32], maxZoom: 16 });
        }
        applyView();
        requestAnimationFrame(function () {
            if (map !== current)
                return;
            current.invalidateSize();
            applyView();
        });
    }
    function focus(id) {
        const marker = markers[id];
        if (!marker || !map)
            return;
        const point = marker.getLatLng();
        map.panTo([point.lat, point.lng]);
        marker.openPopup();
    }
    const api = {
        mount: mount,
        unmount: unmount,
        focus: focus,
        cityCenter: cityCenter,
        setRoutes: setRoutes
    };
    root.PlannerMap = api;
})(globalThis);
