"use strict";
(function () {
    "use strict";
    const appNode = document.getElementById("app");
    if (!(appNode instanceof HTMLElement))
        return;
    const root = appNode;
    let requestToken = 0;
    let segmentFlight = 0;
    let highlightTimer = 0;
    let moveUndo = null;
    let sortables = [];
    let sortSource = "day";
    let sorting = false;
    let hoverDay = null;
    let swallowTimer = 0;
    let swallowClick = null;
    let routeToken = 0;
    let geocodeToken = 0;
    let routeSignature = "";
    let pendingPairs = [];
    let legLookupToken = 0;
    let legLookup = Promise.resolve();
    let legRoutePending = false;
    let legSaving = false;
    let regenToken = 0;
    let regenFlight = 0;
    let optimizing = false;
    let legMinuteMap = null;
    let durationBase = null;
    let departOrigin = null;
    /** 這次調整無法把午餐放進 11:30–13:30 時的原因。空字串表示沒有失敗。 */
    let mealFitNote = "";
    /** 第一次載入時不把整理過的行程寫回，避免改到剛轉移的原始內容。 */
    let bootLoading = true;
    let library = { version: 1, activeId: "", trips: [] };
    function isoFromLocal(date) {
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return String(date.getFullYear()) + "-" + month + "-" + day;
    }
    function initialDraft() {
        const start = PlannerFormat.addDays(isoFromLocal(new Date()), 14);
        return {
            destination: "",
            startDate: start,
            endDate: PlannerFormat.addDays(start, 2),
            travelers: "2",
            budgetAmount: "30000",
            budgetCurrency: "TWD",
            interests: [],
            pace: "moderate",
            note: ""
        };
    }
    const STORAGE_KEY = "ai-planner-result-v1";
    const TRIP_LIBRARY_KEY = "ai-planner-trips-v1";
    function emptyStay() {
        return {
            id: "",
            name: "",
            checkIn: "",
            checkOut: "",
            price: "",
            currency: "TWD",
            rooms: "1",
            bookingUrl: "",
            note: "",
            lat: "",
            lng: ""
        };
    }
    function emptyRide() {
        return {
            id: "",
            mode: "flight",
            from: "",
            to: "",
            departAt: "",
            arriveAt: "",
            price: "",
            currency: "TWD",
            bookingRef: "",
            note: ""
        };
    }
    const state = {
        step: 1,
        draft: initialDraft(),
        error: "",
        plan: null,
        planSource: null,
        activeDay: 0,
        mapKind: "street",
        sketchScope: { kind: "overview" },
        sketchTitle: "",
        addOpen: false,
        addName: "",
        addType: "attraction",
        addNote: "",
        editItemId: "",
        addAfter: 0,
        stayOpen: false,
        stayDraft: emptyStay(),
        stayError: "",
        rideOpen: false,
        rideDraft: emptyRide(),
        rideError: "",
        legDraft: null,
        legError: "",
        routeProgress: null,
        regen: null,
        rates: PlannerRates.homeRates("TWD"),
        rateError: "",
        canUndoMove: false,
        progress: null,
        routeNote: null,
        libraryOpen: false,
        tripError: "",
        pendingDeleteId: "",
        renameId: "",
        renameDraft: "",
        tripList: [],
        activeTripId: ""
    };
    function fieldValue(name) {
        const field = root.querySelector('[data-field="' + name + '"]');
        if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
            return field.value;
        }
        return null;
    }
    function isPlaceType(value) {
        return value === "attraction" || value === "restaurant" || value === "hotel" || value === "shopping";
    }
    function isPace(value) {
        return value === "relaxed" || value === "moderate" || value === "packed";
    }
    function syncAll() {
        const destination = fieldValue("destination");
        if (destination !== null)
            state.draft.destination = destination;
        const startDate = fieldValue("start-date");
        if (startDate !== null)
            state.draft.startDate = startDate;
        const endDate = fieldValue("end-date");
        if (endDate !== null)
            state.draft.endDate = endDate;
        const travelers = fieldValue("travelers");
        if (travelers !== null)
            state.draft.travelers = travelers;
        const budgetAmount = fieldValue("budget-amount");
        if (budgetAmount !== null)
            state.draft.budgetAmount = budgetAmount;
        const budgetCurrency = fieldValue("budget-currency");
        if (budgetCurrency !== null)
            state.draft.budgetCurrency = budgetCurrency;
        const note = fieldValue("note");
        if (note !== null)
            state.draft.note = note;
        const rename = fieldValue("rename-trip");
        if (rename !== null)
            state.renameDraft = rename;
        const addName = fieldValue("add-name");
        if (addName !== null)
            state.addName = addName;
        const addType = fieldValue("add-type");
        if (addType !== null && isPlaceType(addType))
            state.addType = addType;
        const addNote = fieldValue("add-note");
        if (addNote !== null)
            state.addNote = addNote;
        const addAfter = fieldValue("add-after");
        if (addAfter !== null && /^\d+$/.test(addAfter))
            state.addAfter = Number(addAfter);
        if (state.stayOpen) {
            const stayName = fieldValue("stay-name");
            if (stayName !== null)
                state.stayDraft.name = stayName;
            const checkIn = fieldValue("stay-check-in");
            if (checkIn !== null)
                state.stayDraft.checkIn = checkIn;
            const checkOut = fieldValue("stay-check-out");
            if (checkOut !== null)
                state.stayDraft.checkOut = checkOut;
            const stayPrice = fieldValue("stay-price");
            if (stayPrice !== null)
                state.stayDraft.price = stayPrice;
            const stayCurrency = fieldValue("stay-currency");
            if (stayCurrency !== null)
                state.stayDraft.currency = stayCurrency;
            const rooms = fieldValue("stay-rooms");
            if (rooms !== null)
                state.stayDraft.rooms = rooms;
            const stayUrl = fieldValue("stay-url");
            if (stayUrl !== null)
                state.stayDraft.bookingUrl = stayUrl;
            const stayNote = fieldValue("stay-note");
            if (stayNote !== null)
                state.stayDraft.note = stayNote;
            const stayLat = fieldValue("stay-lat");
            if (stayLat !== null)
                state.stayDraft.lat = stayLat;
            const stayLng = fieldValue("stay-lng");
            if (stayLng !== null)
                state.stayDraft.lng = stayLng;
        }
        if (state.rideOpen) {
            const rideMode = fieldValue("ride-mode");
            if (rideMode !== null && isIntercityMode(rideMode))
                state.rideDraft.mode = rideMode;
            const rideFrom = fieldValue("ride-from");
            if (rideFrom !== null)
                state.rideDraft.from = rideFrom;
            const rideTo = fieldValue("ride-to");
            if (rideTo !== null)
                state.rideDraft.to = rideTo;
            const rideDepart = fieldValue("ride-depart");
            if (rideDepart !== null)
                state.rideDraft.departAt = rideDepart;
            const rideArrive = fieldValue("ride-arrive");
            if (rideArrive !== null)
                state.rideDraft.arriveAt = rideArrive;
            const ridePrice = fieldValue("ride-price");
            if (ridePrice !== null)
                state.rideDraft.price = ridePrice;
            const rideCurrency = fieldValue("ride-currency");
            if (rideCurrency !== null)
                state.rideDraft.currency = rideCurrency;
            const rideRef = fieldValue("ride-ref");
            if (rideRef !== null)
                state.rideDraft.bookingRef = rideRef;
            const rideNote = fieldValue("ride-note");
            if (rideNote !== null)
                state.rideDraft.note = rideNote;
        }
        const sketchTitle = fieldValue("sketch-title");
        if (sketchTitle !== null)
            state.sketchTitle = sketchTitle;
        if (state.legDraft) {
            const legMode = fieldValue("leg-mode");
            if (legMode !== null && isTransportMode(legMode))
                state.legDraft.mode = legMode;
            const legMinutes = fieldValue("leg-minutes");
            if (legMinutes !== null)
                state.legDraft.minutes = legMinutes;
            const legPrice = fieldValue("leg-price");
            if (legPrice !== null)
                state.legDraft.price = legPrice;
            const legCurrency = fieldValue("leg-currency");
            if (legCurrency !== null)
                state.legDraft.currency = legCurrency;
        }
    }
    function isTransportMode(value) {
        return value === "walk" || value === "train" || value === "bus" || value === "car" || value === "taxi";
    }
    function isIntercityMode(value) {
        return value === "flight" || value === "train" || value === "hsr" || value === "bus" || value === "car" || value === "ferry" || value === "other";
    }
    function focusTarget(token) {
        const byId = document.getElementById(token);
        if (byId instanceof HTMLElement) {
            byId.focus();
            return;
        }
        const field = root.querySelector('[data-field="' + token + '"]');
        if (field instanceof HTMLElement)
            field.focus();
    }
    function fallbackPoints() {
        const points = [];
        if (!state.plan)
            return points;
        for (let dayIndex = 0; dayIndex < state.plan.days.length; dayIndex += 1) {
            const day = state.plan.days[dayIndex];
            if (!day)
                continue;
            for (let itemIndex = 0; itemIndex < day.items.length; itemIndex += 1) {
                const item = day.items[itemIndex];
                if (item)
                    points.push(item.location);
            }
        }
        return points;
    }
    function mountDayMap() {
        const container = document.getElementById("day-map");
        const day = activeDayPlan();
        if (!(container instanceof HTMLElement) || !state.plan || !day)
            return;
        const lodging = [];
        for (let index = 0; index < state.plan.accommodations.length; index += 1) {
            const stay = state.plan.accommodations[index];
            if (stay && PlannerBudget.coversNight(stay, day.date))
                lodging.push(stay);
        }
        PlannerMap.mount({
            container: container,
            items: day.items,
            lodging: lodging,
            destination: state.plan.destination,
            fallbackPoints: fallbackPoints(),
            onSelect: function (id) {
                highlightStop(id);
            }
        });
    }
    function highlightStop(id) {
        const cards = root.querySelectorAll(".is-focus");
        for (let index = 0; index < cards.length; index += 1) {
            const card = cards[index];
            if (card instanceof HTMLElement)
                card.classList.remove("is-focus");
        }
        const target = document.getElementById("stop-" + id) || document.getElementById("stay-" + id);
        if (!(target instanceof HTMLElement))
            return;
        target.classList.add("is-focus");
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        target.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
        window.clearTimeout(highlightTimer);
        highlightTimer = window.setTimeout(function () {
            target.classList.remove("is-focus");
        }, 1600);
    }
    function focusStop(id) {
        if (state.mapKind === "sketch")
            highlightSketch(id);
        else
            PlannerMap.focus(id);
        highlightStop(id);
    }
    function highlightSketch(id) {
        const nodes = root.querySelectorAll(".sketch-node.is-on");
        for (let index = 0; index < nodes.length; index += 1) {
            const node = nodes[index];
            if (node instanceof HTMLElement || node instanceof SVGElement)
                node.classList.remove("is-on");
        }
        const selector = '[data-sketch-id="' + id.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"]';
        const target = root.querySelector(selector);
        if (target instanceof SVGElement)
            target.classList.add("is-on");
    }
    function displaySketchTitle() {
        if (!state.plan)
            return "";
        const typed = state.sketchTitle.trim();
        if (typed !== "")
            return typed;
        return PlannerSketch.defaultTitle(state.plan);
    }
    function paintSketchTitle() {
        const title = displaySketchTitle();
        const node = document.getElementById("sketch-map-title");
        if (node)
            node.textContent = title;
        const tip = document.getElementById("sketch-map-tip");
        if (tip)
            tip.textContent = title;
        const svg = root.querySelector("#sketch-map svg");
        if (svg instanceof SVGElement)
            svg.setAttribute("aria-label", title);
    }
    function enableSketchDownload() {
        const button = root.querySelector("[data-action='download-sketch']");
        if (!(button instanceof HTMLButtonElement))
            return;
        const finish = function () {
            if (button.isConnected)
                button.disabled = false;
        };
        const fonts = document.fonts;
        if (!fonts) {
            finish();
            return;
        }
        fonts.load('32px "jf open huninn"').then(finish).catch(finish);
    }
    function centerSketchOnSmallScreen() {
        if (!window.matchMedia("(max-width: 640px)").matches)
            return;
        const stage = root.querySelector("#sketch-map");
        if (!(stage instanceof HTMLElement))
            return;
        stage.scrollLeft = Math.max(0, (stage.scrollWidth - stage.clientWidth) / 2);
    }
    let sketchFontData = null;
    function sketchFontUrl() {
        const existing = sketchFontData;
        if (existing)
            return existing;
        const pending = fetch("fonts/jf-openhuninn-2.1.woff2").then(function (response) {
            if (!response.ok)
                throw new Error("font");
            return response.blob();
        }).then(function (blob) {
            const typed = blob.type !== "" ? blob : new Blob([blob], { type: "font/woff2" });
            return new Promise(function (resolve, reject) {
                const reader = new FileReader();
                reader.onload = function () {
                    if (typeof reader.result === "string")
                        resolve(reader.result);
                    else
                        reject(new Error("font"));
                };
                reader.onerror = function () {
                    reject(new Error("font"));
                };
                reader.readAsDataURL(typed);
            });
        }).catch(function (error) {
            sketchFontData = null;
            throw error;
        });
        sketchFontData = pending;
        return pending;
    }
    function pngName(title) {
        const clean = title.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
        return (clean !== "" ? clean : "旅遊地圖") + ".png";
    }
    function downloadSketch() {
        const svg = root.querySelector("#sketch-map svg");
        const button = root.querySelector("[data-action='download-sketch']");
        if (!(svg instanceof SVGSVGElement) || !state.plan)
            return;
        if (button instanceof HTMLButtonElement)
            button.disabled = true;
        paintSketchTitle();
        const title = displaySketchTitle();
        void sketchFontUrl().then(function (dataUrl) {
            return document.fonts.load('32px "jf open huninn"').catch(function () {
                return [];
            }).then(function () {
                return dataUrl;
            });
        }).then(function (dataUrl) {
            const clone = svg.cloneNode(true);
            if (!(clone instanceof SVGSVGElement))
                return;
            clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
            clone.setAttribute("width", "1200");
            clone.setAttribute("height", "820");
            const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
            style.textContent = '@font-face{font-family:"jf open huninn";src:url("' + dataUrl + '") format("woff2");font-weight:400;font-style:normal;}';
            clone.insertBefore(style, clone.firstChild);
            const xml = new XMLSerializer().serializeToString(clone);
            const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const image = new Image();
            image.onload = function () {
                const scale = 2;
                const canvas = document.createElement("canvas");
                canvas.width = 1200 * scale;
                canvas.height = 820 * scale;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    URL.revokeObjectURL(url);
                    if (button instanceof HTMLButtonElement)
                        button.disabled = false;
                    return;
                }
                ctx.fillStyle = "#fff6ef";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.setTransform(scale, 0, 0, scale, 0, 0);
                ctx.drawImage(image, 0, 0, 1200, 820);
                canvas.toBlob(function (png) {
                    URL.revokeObjectURL(url);
                    if (button instanceof HTMLButtonElement)
                        button.disabled = false;
                    if (!png)
                        return;
                    const link = document.createElement("a");
                    const objectUrl = URL.createObjectURL(png);
                    link.href = objectUrl;
                    link.download = pngName(title);
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    URL.revokeObjectURL(objectUrl);
                }, "image/png");
            };
            image.onerror = function () {
                URL.revokeObjectURL(url);
                if (button instanceof HTMLButtonElement)
                    button.disabled = false;
            };
            image.src = url;
        }).catch(function () {
            if (button instanceof HTMLButtonElement)
                button.disabled = false;
        });
    }
    function anchorForNewStop(items) {
        for (let index = items.length - 1; index >= 0; index -= 1) {
            const item = items[index];
            if (item && PlannerFormat.isMappableLocation(item.location))
                return item.location;
        }
        if (!state.plan)
            return undefined;
        const city = PlannerMap.cityCenter(state.plan.destination);
        return city || undefined;
    }
    function releaseStuckProgress() {
        if (segmentFlight > 0)
            return;
        const progress = state.progress;
        if (!progress || !progress.running)
            return;
        progress.running = false;
    }
    function releaseStuckRegen() {
        if (regenFlight > 0)
            return;
        if (!state.regen || !state.regen.running)
            return;
        state.regen = null;
    }
    function render(focus) {
        publishTrips();
        releaseStuckProgress();
        releaseStuckRegen();
        window.clearTimeout(highlightTimer);
        destroySortable();
        PlannerMap.unmount();
        let startRoutes = false;
        if (state.step === 4)
            startRoutes = prepareActiveDay();
        else {
            routeToken += 1;
            routeSignature = "";
            pendingPairs = [];
            state.routeProgress = null;
            PlannerRoutes.cancelPending();
        }
        document.body.dataset.step = String(state.step);
        root.innerHTML = PlannerView.renderApp(state);
        if (state.step === 2)
            refreshDayCount();
        if (state.step === 4) {
            mountSortable();
            if (state.mapKind === "street") {
                mountDayMap();
                PlannerMap.setRoutes(daySegments());
            }
            else {
                enableSketchDownload();
                centerSketchOnSmallScreen();
            }
            if (startRoutes) {
                const token = routeToken;
                const jobs = pendingPairs.slice();
                const progress = state.routeProgress;
                const done = progress ? progress.done : 0;
                const total = progress ? progress.total : jobs.length;
                void runJobs(token, jobs, done, total);
            }
            queueOpeningRoute();
        }
        if (focus)
            focusTarget(focus);
    }
    function refreshDayCount() {
        const node = root.querySelector("[data-day-count]");
        if (!(node instanceof HTMLElement))
            return;
        const days = PlannerFormat.inclusiveDays(state.draft.startDate, state.draft.endDate);
        node.textContent = PlannerFormat.formatStayLength(state.draft.startDate, state.draft.endDate);
        node.classList.toggle("is-bad", days <= 0);
        const quota = root.querySelector("[data-quota-hint]");
        if (quota instanceof HTMLElement) {
            const text = PlannerView.quotaSentence(days);
            quota.textContent = text;
            quota.hidden = text === "";
        }
        const end = document.getElementById("end-date");
        if (end instanceof HTMLInputElement && PlannerFormat.parseIsoDate(state.draft.startDate) !== null) {
            end.min = state.draft.startDate;
        }
    }
    function refreshCityChips() {
        const name = state.draft.destination.trim();
        const chips = root.querySelectorAll("[data-city]");
        for (let index = 0; index < chips.length; index += 1) {
            const chip = chips[index];
            if (!(chip instanceof HTMLElement))
                continue;
            const on = chip.getAttribute("data-city") === name;
            chip.classList.toggle("is-on", on);
            chip.setAttribute("aria-pressed", on ? "true" : "false");
        }
    }
    function activeDayPlan() {
        if (!state.plan)
            return null;
        const day = state.plan.days[state.activeDay];
        return day || null;
    }
    function goNext() {
        const destination = state.draft.destination.trim();
        if (destination === "") {
            state.error = "請先輸入目的地。";
            render("form-error");
            return;
        }
        if (destination.length > 40) {
            state.error = "目的地請不要超過 40 個字。";
            render("form-error");
            return;
        }
        state.draft.destination = destination;
        state.error = "";
        state.step = 2;
        render("start-date");
    }
    function goBack() {
        state.error = "";
        state.step = 1;
        render("destination");
    }
    function readyDraft() {
        const destination = state.draft.destination.trim();
        if (destination === "") {
            state.error = "請先輸入目的地。";
            return null;
        }
        if (PlannerFormat.parseIsoDate(state.draft.startDate) === null || PlannerFormat.parseIsoDate(state.draft.endDate) === null) {
            state.error = "請填寫出發日期與結束日期。";
            return null;
        }
        const days = PlannerFormat.inclusiveDays(state.draft.startDate, state.draft.endDate);
        if (days <= 0) {
            state.error = "結束日期要在出發當天或之後。";
            return null;
        }
        if (days > 30) {
            state.error = "這一步最多先排 30 天。";
            return null;
        }
        const travelersText = state.draft.travelers.trim();
        if (!/^\d+$/.test(travelersText)) {
            state.error = "人數請填 1 到 20 的整數。";
            return null;
        }
        const travelers = Number(travelersText);
        if (travelers < 1 || travelers > 20) {
            state.error = "人數請填 1 到 20 的整數。";
            return null;
        }
        const budgetText = state.draft.budgetAmount.trim();
        if (!/^\d+$/.test(budgetText)) {
            state.error = "預算請填 0 以上的整數。";
            return null;
        }
        const amount = Number(budgetText);
        if (amount > 100000000) {
            state.error = "預算金額太大了，請填 1 億以內的整數。";
            return null;
        }
        if (state.draft.note.trim().length > 300) {
            state.error = "補充說明請留在 300 字以內。";
            return null;
        }
        const currency = PlannerFormat.isCurrencyCode(state.draft.budgetCurrency) ? state.draft.budgetCurrency : "TWD";
        state.error = "";
        return {
            destination: destination,
            startDate: state.draft.startDate,
            endDate: state.draft.endDate,
            travelers: travelers,
            budget: { amount: amount, currency: currency },
            interests: state.draft.interests.slice(),
            pace: state.draft.pace,
            note: state.draft.note.trim()
        };
    }
    function isTripPlan(value) {
        if (!value || typeof value !== "object")
            return false;
        const plan = value;
        if (typeof plan.destination !== "string" || !Array.isArray(plan.days) || plan.days.length === 0)
            return false;
        for (let dayIndex = 0; dayIndex < plan.days.length; dayIndex += 1) {
            const day = plan.days[dayIndex];
            if (!day || !Array.isArray(day.items))
                return false;
            for (let itemIndex = 0; itemIndex < day.items.length; itemIndex += 1) {
                const item = day.items[itemIndex];
                if (!item || typeof item.name !== "string" || !item.cost || !item.location)
                    return false;
            }
        }
        return true;
    }
    function messageFrom(body, status) {
        let message = "";
        let code = "";
        if (body && typeof body === "object") {
            const record = body;
            if (typeof record.error === "string")
                message = record.error.trim();
            if (typeof record.code === "string")
                code = record.code.trim();
        }
        if (message === "") {
            if (status > 0)
                return "這次沒有產生出行程（HTTP " + String(status) + "）。可以回到上一步再試，或先改用示範資料。";
            return "這次沒有產生出行程。可以回到上一步再試，或先改用示範資料。";
        }
        return code !== "" ? message + "（" + code + "）" : message;
    }
    function normalizePlan(plan) {
        if (!Array.isArray(plan.accommodations))
            plan.accommodations = [];
        if (!Array.isArray(plan.transports))
            plan.transports = [];
        if (!Array.isArray(plan.interests))
            plan.interests = [];
        if (!Array.isArray(plan.unscheduled))
            plan.unscheduled = [];
    }
    function parkClosedDays() {
        const plan = state.plan;
        if (!plan)
            return false;
        if (!Array.isArray(plan.unscheduled))
            plan.unscheduled = [];
        let changed = false;
        for (let dayIndex = 0; dayIndex < plan.days.length; dayIndex += 1) {
            const day = plan.days[dayIndex];
            if (!day || day.items.length === 0)
                continue;
            if (!PlannerFormat.dayClosed(PlannerFormat.dayWindow(plan, day.date)))
                continue;
            for (let itemIndex = 0; itemIndex < day.items.length; itemIndex += 1) {
                const item = day.items[itemIndex];
                if (!item)
                    continue;
                delete item.transportToNext;
                plan.unscheduled.push(item);
            }
            day.items = [];
            changed = true;
        }
        return changed;
    }
    function cloneJson(value) {
        return JSON.parse(JSON.stringify(value));
    }
    function writeLibrary() {
        try {
            localStorage.setItem(TRIP_LIBRARY_KEY, JSON.stringify(library));
            return true;
        }
        catch (err) {
            state.tripError = "行程存不進去，瀏覽器的儲存空間可能已滿。";
            return false;
        }
    }
    function findTrip(id) {
        for (let index = 0; index < library.trips.length; index += 1) {
            const trip = library.trips[index];
            if (trip && trip.id === id)
                return trip;
        }
        return null;
    }
    function activeSaved() {
        return findTrip(library.activeId);
    }
    function tripSpan(snapshot) {
        const plan = snapshot.plan;
        if (plan && typeof plan.startDate === "string" && typeof plan.endDate === "string" && Array.isArray(plan.days)) {
            return { start: plan.startDate, end: plan.endDate, days: plan.days.length };
        }
        const progress = snapshot.progress;
        if (progress && progress.request) {
            return {
                start: progress.request.startDate,
                end: progress.request.endDate,
                days: progress.totalDays
            };
        }
        return { start: "", end: "", days: 0 };
    }
    function tripNameFromSnapshot(snapshot) {
        const plan = snapshot.plan;
        if (plan && typeof plan.destination === "string" && plan.destination.trim() !== "") {
            const range = typeof plan.startDate === "string" && typeof plan.endDate === "string"
                ? PlannerFormat.formatDateRange(plan.startDate, plan.endDate)
                : "";
            return range === "" ? plan.destination.trim() : plan.destination.trim() + " " + range;
        }
        const progress = snapshot.progress;
        if (progress && progress.request && progress.request.destination.trim() !== "") {
            return progress.request.destination.trim() + " " +
                PlannerFormat.formatDateRange(progress.request.startDate, progress.request.endDate);
        }
        return "未命名行程";
    }
    function limitName(name) {
        const trimmed = name.trim();
        const next = trimmed === "" ? "未命名行程" : trimmed;
        return next.length > 80 ? next.slice(0, 80) : next;
    }
    function copyName(name) {
        return limitName(limitName(name) + " 副本");
    }
    function blankSnapshot() {
        return { activeDay: 0, rates: PlannerRates.homeRates("TWD") };
    }
    function blankTrip() {
        const now = new Date().toISOString();
        return {
            id: PlannerFormat.createId(),
            name: "未命名行程",
            createdAt: now,
            updatedAt: now,
            snapshot: blankSnapshot()
        };
    }
    function publishTrips() {
        const items = [];
        for (let index = 0; index < library.trips.length; index += 1) {
            const trip = library.trips[index];
            if (!trip)
                continue;
            const span = tripSpan(trip.snapshot);
            items.push({
                id: trip.id,
                name: trip.name,
                startDate: span.start,
                endDate: span.end,
                days: span.days,
                updatedAt: trip.updatedAt
            });
        }
        state.tripList = items;
        state.activeTripId = library.activeId;
    }
    function currentRecord() {
        const record = {
            activeDay: state.activeDay,
            rates: state.rates
        };
        if (state.plan && state.planSource) {
            record.plan = state.plan;
            record.planSource = state.planSource;
        }
        if (state.progress) {
            record.progress = {
                nextOffset: state.progress.nextOffset,
                totalDays: state.progress.totalDays,
                useFallback: state.progress.useFallback,
                error: state.progress.error,
                request: state.progress.request,
                stays: state.progress.stays,
                rides: state.progress.rides
            };
        }
        return record;
    }
    function rememberTrip(trip) {
        const record = cloneJson(currentRecord());
        trip.snapshot = record;
        if (trip.name === "未命名行程")
            trip.name = limitName(tripNameFromSnapshot(record));
        trip.updatedAt = new Date().toISOString();
        writeLibrary();
    }
    function saveResult() {
        if (bootLoading)
            return;
        if ((!state.plan || !state.planSource) && !state.progress)
            return;
        try {
            const trip = activeSaved();
            if (!trip)
                return;
            rememberTrip(trip);
        }
        catch (err) {
            return;
        }
    }
    function readStoredLibrary() {
        let raw = null;
        try {
            raw = localStorage.getItem(TRIP_LIBRARY_KEY);
        }
        catch (err) {
            return null;
        }
        if (!raw)
            return null;
        try {
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object")
                return null;
            const record = parsed;
            if (record.version !== 1 || !Array.isArray(record.trips))
                return null;
            const trips = [];
            for (let index = 0; index < record.trips.length; index += 1) {
                const trip = record.trips[index];
                if (!trip || typeof trip.id !== "string" || typeof trip.name !== "string")
                    continue;
                if (!trip.snapshot || typeof trip.snapshot !== "object")
                    continue;
                trips.push({
                    id: trip.id,
                    name: trip.name,
                    createdAt: typeof trip.createdAt === "string" ? trip.createdAt : new Date().toISOString(),
                    updatedAt: typeof trip.updatedAt === "string" ? trip.updatedAt : new Date().toISOString(),
                    snapshot: trip.snapshot
                });
            }
            if (trips.length === 0)
                return null;
            let activeId = typeof record.activeId === "string" ? record.activeId : "";
            if (!findIn(trips, activeId))
                activeId = trips[0] ? trips[0].id : "";
            return { version: 1, activeId: activeId, trips: trips };
        }
        catch (err) {
            return null;
        }
    }
    function findIn(trips, id) {
        for (let index = 0; index < trips.length; index += 1) {
            const trip = trips[index];
            if (trip && trip.id === id)
                return true;
        }
        return false;
    }
    function ensureLibrary() {
        const existing = readStoredLibrary();
        if (existing) {
            library = existing;
            return;
        }
        let raw = null;
        try {
            raw = localStorage.getItem(STORAGE_KEY);
        }
        catch (err) {
            raw = null;
        }
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === "object") {
                    const snapshot = parsed;
                    const now = new Date().toISOString();
                    const trip = {
                        id: PlannerFormat.createId(),
                        name: limitName(tripNameFromSnapshot(snapshot)),
                        createdAt: now,
                        updatedAt: now,
                        snapshot: snapshot
                    };
                    library = { version: 1, activeId: trip.id, trips: [trip] };
                    writeLibrary();
                    return;
                }
            }
            catch (err) {
                raw = null;
            }
        }
        const created = blankTrip();
        library = { version: 1, activeId: created.id, trips: [created] };
        writeLibrary();
    }
    function resetTripView() {
        requestToken += 1;
        geocodeToken += 1;
        routeToken += 1;
        clearMoveUndo();
        state.addOpen = false;
        state.addName = "";
        state.stayOpen = false;
        state.rideOpen = false;
        state.legDraft = null;
        state.stayDraft = emptyStay();
        state.rideDraft = emptyRide();
        state.stayError = "";
        state.rideError = "";
        state.legError = "";
        state.rateError = "";
        state.regen = null;
        state.routeNote = null;
        state.sketchScope = { kind: "overview" };
        state.sketchTitle = "";
        mealFitNote = "";
    }
    function emptyScreen() {
        state.step = 1;
        state.plan = null;
        state.planSource = null;
        state.progress = null;
        state.activeDay = 0;
        state.rates = PlannerRates.homeRates("TWD");
        state.draft = initialDraft();
        state.error = "";
    }
    function showActiveTrip() {
        resetTripView();
        const loaded = loadActiveTrip();
        if (!loaded)
            emptyScreen();
        publishTrips();
        const focus = state.step === 4 ? "trip-title" : state.step === 3 ? "plan-continue" : "destination";
        render(focus);
        if (state.step === 4)
            scheduleStayGeocode();
    }
    function tripStoredContent(snapshot) {
        return !!snapshot.plan || !!snapshot.progress;
    }
    function screenHasContent() {
        return (!!state.plan && !!state.planSource) || !!state.progress;
    }
    function newTrip() {
        if (!screenHasContent()) {
            state.tripError = "目前已經是空白行程。";
            state.libraryOpen = true;
            render("destination");
            return;
        }
        saveResult();
        const created = blankTrip();
        library.trips.push(created);
        library.activeId = created.id;
        writeLibrary();
        state.tripError = "";
        state.pendingDeleteId = "";
        state.renameId = "";
        state.libraryOpen = true;
        resetTripView();
        emptyScreen();
        publishTrips();
        render("destination");
    }
    function saveTripAs() {
        if (!screenHasContent()) {
            state.tripError = "目前行程還沒有內容，無法另存。";
            state.libraryOpen = true;
            render();
            return;
        }
        saveResult();
        const source = activeSaved();
        if (!source)
            return;
        const now = new Date().toISOString();
        const copy = {
            id: PlannerFormat.createId(),
            name: copyName(source.name),
            createdAt: now,
            updatedAt: now,
            snapshot: cloneJson(source.snapshot)
        };
        library.trips.push(copy);
        library.activeId = copy.id;
        writeLibrary();
        state.tripError = "";
        state.pendingDeleteId = "";
        state.renameId = "";
        state.libraryOpen = true;
        showActiveTrip();
    }
    function duplicateTrip(id) {
        if (id === library.activeId)
            saveResult();
        const source = findTrip(id);
        if (!source || !tripStoredContent(source.snapshot)) {
            state.tripError = "這筆行程還沒有內容，無法複製。";
            state.libraryOpen = true;
            render();
            return;
        }
        const now = new Date().toISOString();
        library.trips.push({
            id: PlannerFormat.createId(),
            name: copyName(source.name),
            createdAt: now,
            updatedAt: now,
            snapshot: cloneJson(source.snapshot)
        });
        writeLibrary();
        state.tripError = "";
        state.libraryOpen = true;
        render();
    }
    function openTrip(id) {
        if (id === library.activeId || !findTrip(id))
            return;
        saveResult();
        library.activeId = id;
        writeLibrary();
        state.tripError = "";
        state.pendingDeleteId = "";
        state.renameId = "";
        state.libraryOpen = true;
        showActiveTrip();
    }
    function beginRename(id) {
        const trip = findTrip(id);
        if (!trip)
            return;
        state.renameId = id;
        state.renameDraft = trip.name;
        state.pendingDeleteId = "";
        state.tripError = "";
        state.libraryOpen = true;
        render("rename-trip");
    }
    function commitRename() {
        const trip = findTrip(state.renameId);
        if (!trip)
            return;
        const name = state.renameDraft.trim();
        if (name === "") {
            state.tripError = "請填行程名稱。";
            render("rename-trip");
            return;
        }
        if (name.length > 80) {
            state.tripError = "行程名稱請留在 80 字以內。";
            render("rename-trip");
            return;
        }
        trip.name = name;
        trip.updatedAt = new Date().toISOString();
        state.renameId = "";
        state.renameDraft = "";
        state.tripError = "";
        writeLibrary();
        render();
    }
    function askDelete(id) {
        if (!findTrip(id))
            return;
        state.pendingDeleteId = id;
        state.renameId = "";
        state.tripError = "";
        state.libraryOpen = true;
        render();
    }
    function confirmDelete() {
        const id = state.pendingDeleteId;
        let index = -1;
        for (let tripIndex = 0; tripIndex < library.trips.length; tripIndex += 1) {
            const trip = library.trips[tripIndex];
            if (trip && trip.id === id)
                index = tripIndex;
        }
        if (index < 0)
            return;
        const removingActive = library.activeId === id;
        library.trips.splice(index, 1);
        state.pendingDeleteId = "";
        state.tripError = "";
        if (library.trips.length === 0) {
            const created = blankTrip();
            library.trips.push(created);
            library.activeId = created.id;
            writeLibrary();
            state.libraryOpen = true;
            resetTripView();
            emptyScreen();
            publishTrips();
            render("destination");
            return;
        }
        if (removingActive) {
            const next = library.trips[index] || library.trips[index - 1] || library.trips[0];
            library.activeId = next ? next.id : "";
            writeLibrary();
            state.libraryOpen = true;
            showActiveTrip();
            return;
        }
        writeLibrary();
        state.libraryOpen = true;
        render();
    }
    function fileStem(name) {
        const cleaned = name.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
        return cleaned === "" ? "行程" : cleaned.slice(0, 80);
    }
    function exportTrip(id) {
        if (id === library.activeId)
            saveResult();
        const trip = findTrip(id);
        if (!trip || !tripStoredContent(trip.snapshot)) {
            state.tripError = "這筆行程還沒有內容，無法匯出。";
            state.libraryOpen = true;
            render();
            return;
        }
        const payload = { name: trip.name, snapshot: cloneJson(trip.snapshot) };
        const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileStem(trip.name) + ".json";
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }
    function snapshotFrom(value) {
        if (!value || typeof value !== "object")
            return null;
        const raw = value;
        const progress = raw.progress ? readProgress(raw.progress) : null;
        let plan = null;
        let source = null;
        if (raw.plan) {
            if (!isTripPlan(raw.plan))
                return null;
            if (!Array.isArray(raw.plan.accommodations))
                raw.plan.accommodations = [];
            if (!Array.isArray(raw.plan.transports))
                raw.plan.transports = [];
            if (!Array.isArray(raw.plan.interests))
                raw.plan.interests = [];
            const budget = raw.plan.budget;
            const budgetOk = !!budget && typeof budget.amount === "number" && typeof budget.currency === "string";
            const picked = raw.planSource === "ai" || raw.planSource === "mock" ? raw.planSource : null;
            if (!budgetOk || typeof raw.plan.travelers !== "number" || !savedListsOk(raw.plan) || !picked)
                return null;
            plan = raw.plan;
            source = picked;
        }
        if (!plan && !progress)
            return null;
        const home = plan ? plan.budget.currency : progress ? progress.request.budget.currency : "TWD";
        const snapshot = {
            activeDay: typeof raw.activeDay === "number" ? raw.activeDay : 0,
            rates: savedRates(raw.rates, home)
        };
        if (plan && source) {
            snapshot.plan = plan;
            snapshot.planSource = source;
        }
        if (progress) {
            snapshot.progress = {
                nextOffset: progress.nextOffset,
                totalDays: progress.totalDays,
                useFallback: progress.useFallback,
                error: progress.error,
                request: progress.request,
                stays: progress.stays,
                rides: progress.rides
            };
        }
        return snapshot;
    }
    function readImported(value) {
        if (!value || typeof value !== "object")
            return null;
        const raw = value;
        const body = raw.snapshot && typeof raw.snapshot === "object" ? raw.snapshot : value;
        const snapshot = snapshotFrom(body);
        if (!snapshot)
            return null;
        let name = typeof raw.name === "string" ? raw.name.trim() : "";
        if (raw.snapshot === undefined)
            name = "";
        if (name === "" || name.length > 80)
            name = limitName(tripNameFromSnapshot(snapshot));
        return { name: name, snapshot: cloneJson(snapshot) };
    }
    function importTripText(text) {
        let parsed;
        try {
            parsed = JSON.parse(text);
        }
        catch (err) {
            state.tripError = "這個檔案不是 JSON。";
            state.libraryOpen = true;
            render();
            return;
        }
        const loaded = readImported(parsed);
        if (!loaded) {
            state.tripError = "這個檔案沒有可用的行程。";
            state.libraryOpen = true;
            render();
            return;
        }
        saveResult();
        const now = new Date().toISOString();
        library.trips.push({
            id: PlannerFormat.createId(),
            name: loaded.name,
            createdAt: now,
            updatedAt: now,
            snapshot: loaded.snapshot
        });
        writeLibrary();
        state.tripError = "";
        state.libraryOpen = true;
        render();
    }
    function readTripFile(file) {
        const reader = new FileReader();
        reader.onload = function () {
            const text = typeof reader.result === "string" ? reader.result : "";
            importTripText(text);
        };
        reader.readAsText(file);
    }
    function applyPlan(plan, source) {
        normalizePlan(plan);
        clearMoveUndo();
        state.plan = plan;
        state.planSource = source;
        state.activeDay = 0;
        state.addOpen = false;
        state.addName = "";
        state.stayOpen = false;
        state.rideOpen = false;
        state.legDraft = null;
        state.stayError = "";
        state.rideError = "";
        state.legError = "";
        state.rateError = "";
        state.regen = null;
        state.error = "";
        state.rates = PlannerRates.homeRates(plan.budget.currency || "TWD");
        state.step = 4;
        parkClosedDays();
        saveResult();
        render("trip-title");
        scheduleStayGeocode();
    }
    function placeKey(name) {
        return name.trim().toLowerCase().replace(/\s+/g, "");
    }
    function collectAvoidNames(plan, exceptDate) {
        const seen = new Set();
        const names = [];
        if (!plan)
            return names;
        for (let dayIndex = 0; dayIndex < plan.days.length; dayIndex += 1) {
            const day = plan.days[dayIndex];
            if (!day || (exceptDate && day.date === exceptDate))
                continue;
            for (let itemIndex = 0; itemIndex < day.items.length; itemIndex += 1) {
                const item = day.items[itemIndex];
                if (!item || item.type === "hotel")
                    continue;
                const name = item.name.trim();
                const key = placeKey(name);
                if (key === "" || seen.has(key))
                    continue;
                seen.add(key);
                names.push(name);
            }
        }
        const held = plan.unscheduled || [];
        for (let index = 0; index < held.length; index += 1) {
            const item = held[index];
            if (!item || item.type === "hotel")
                continue;
            const name = item.name.trim();
            const key = placeKey(name);
            if (key === "" || seen.has(key))
                continue;
            seen.add(key);
            names.push(name);
        }
        if (names.length > 80)
            return names.slice(names.length - 80);
        return names;
    }
    function stayHasPoint(stay) {
        return PlannerFormat.isMappableLocation(stay.location);
    }
    function mergeStays(list) {
        const merged = [];
        for (let index = 0; index < list.length; index += 1) {
            const stay = list[index];
            if (!stay)
                continue;
            const key = placeKey(stay.name);
            let target = null;
            for (let inner = 0; inner < merged.length; inner += 1) {
                const existing = merged[inner];
                if (!existing || placeKey(existing.name) !== key)
                    continue;
                if (existing.checkIn <= stay.checkOut && stay.checkIn <= existing.checkOut) {
                    target = existing;
                    break;
                }
            }
            if (!target) {
                merged.push(stay);
                continue;
            }
            if (stay.checkIn < target.checkIn)
                target.checkIn = stay.checkIn;
            if (stay.checkOut > target.checkOut)
                target.checkOut = stay.checkOut;
            if (!stayHasPoint(target) && stayHasPoint(stay)) {
                target.location = {
                    name: target.location.name,
                    lat: stay.location.lat,
                    lng: stay.location.lng
                };
            }
        }
        return merged;
    }
    function cloneStay(stay) {
        const copy = {
            id: stay.id,
            name: stay.name,
            location: { name: stay.location.name },
            checkIn: stay.checkIn,
            checkOut: stay.checkOut,
            pricePerNight: { amount: stay.pricePerNight.amount, currency: stay.pricePerNight.currency },
            rooms: stay.rooms
        };
        if (typeof stay.location.lat === "number")
            copy.location.lat = stay.location.lat;
        if (typeof stay.location.lng === "number")
            copy.location.lng = stay.location.lng;
        if (stay.bookingUrl)
            copy.bookingUrl = stay.bookingUrl;
        if (stay.note)
            copy.note = stay.note;
        return copy;
    }
    function cloneRide(ride) {
        const copy = {
            id: ride.id,
            mode: ride.mode,
            from: ride.from,
            to: ride.to,
            departAt: ride.departAt,
            cost: { amount: ride.cost.amount, currency: ride.cost.currency }
        };
        if (ride.arriveAt)
            copy.arriveAt = ride.arriveAt;
        if (ride.bookingRef)
            copy.bookingRef = ride.bookingRef;
        if (ride.note)
            copy.note = ride.note;
        return copy;
    }
    function keptStays() {
        const progress = state.progress;
        if (!progress || progress.stays.length === 0)
            return [];
        const copies = [];
        for (let index = 0; index < progress.stays.length; index += 1) {
            const stay = progress.stays[index];
            if (stay)
                copies.push(cloneStay(stay));
        }
        return copies;
    }
    function keptRides() {
        const progress = state.progress;
        if (!progress || progress.rides.length === 0)
            return [];
        const copies = [];
        for (let index = 0; index < progress.rides.length; index += 1) {
            const ride = progress.rides[index];
            if (ride)
                copies.push(cloneRide(ride));
        }
        return copies;
    }
    function adoptChunk(ready, chunk) {
        const days = chunk.days.slice();
        const stays = Array.isArray(chunk.accommodations) ? chunk.accommodations : [];
        const lockedStays = keptStays();
        if (!state.plan) {
            const plan = {
                id: typeof chunk.id === "string" && chunk.id !== "" ? chunk.id : PlannerFormat.createId(),
                destination: ready.destination,
                startDate: ready.startDate,
                endDate: ready.endDate,
                travelers: ready.travelers,
                budget: { amount: ready.budget.amount, currency: ready.budget.currency },
                interests: ready.interests.slice(),
                pace: ready.pace,
                days: days,
                accommodations: lockedStays.length > 0 ? lockedStays : stays.slice(),
                transports: keptRides(),
                unscheduled: []
            };
            if (ready.note !== "")
                plan.note = ready.note;
            normalizePlan(plan);
            state.plan = plan;
            state.planSource = "ai";
            state.rates = PlannerRates.homeRates(plan.budget.currency || "TWD");
            for (let index = 0; index < days.length; index += 1) {
                const day = days[index];
                if (day)
                    anchorGeneratedDay(plan, day);
            }
            return;
        }
        for (let index = 0; index < days.length; index += 1) {
            const day = days[index];
            if (day)
                state.plan.days.push(day);
        }
        state.plan.days.sort(function (left, right) { return left.dayIndex - right.dayIndex; });
        if (lockedStays.length === 0)
            state.plan.accommodations = mergeStays(state.plan.accommodations.concat(stays));
        normalizePlan(state.plan);
        parkClosedDays();
        for (let index = 0; index < days.length; index += 1) {
            const day = days[index];
            if (day)
                anchorGeneratedDay(state.plan, day);
        }
    }
    function stayBody(stay) {
        const row = {
            name: stay.name,
            location: stay.location.name,
            checkIn: stay.checkIn,
            checkOut: stay.checkOut
        };
        if (stay.note && stay.note.trim() !== "")
            row.note = stay.note.trim();
        if (typeof stay.location.lat === "number" && typeof stay.location.lng === "number") {
            row.lat = stay.location.lat;
            row.lng = stay.location.lng;
        }
        return row;
    }
    function rideBody(ride) {
        return {
            mode: ride.mode,
            from: ride.from,
            to: ride.to,
            departAt: ride.departAt,
            arriveAt: ride.arriveAt || ""
        };
    }
    function postChunk(ready, offset, count, names, useFallback, stays, rides) {
        const payload = {
            destination: ready.destination,
            startDate: ready.startDate,
            endDate: ready.endDate,
            travelers: ready.travelers,
            budget: ready.budget,
            interests: ready.interests,
            pace: ready.pace,
            note: ready.note,
            chunkStart: offset,
            chunkDays: count,
            avoidNames: names,
            useFallback: useFallback,
            stays: stays.map(stayBody),
            rides: rides.map(rideBody)
        };
        const headers = { "Content-Type": "application/json" };
        if (!PlannerRemote.onLocalHost()) {
            const code = PlannerRemote.passcode();
            if (code === "") {
                return Promise.resolve({ ok: false, plan: null, usedFallback: false, error: "請先填通行碼並按儲存。" });
            }
            headers["X-Planner-Pass"] = code;
        }
        return fetch(PlannerRemote.planUrl(), {
            method: "POST",
            headers: headers,
            body: JSON.stringify(payload)
        }).then(function (response) {
            return response.json().then(function (body) {
                return { ok: response.ok, status: response.status, body: body };
            }, function () {
                return { ok: response.ok, status: response.status, body: null };
            });
        }).then(function (result) {
            const body = result.body && typeof result.body === "object"
                ? result.body
                : null;
            const plan = body ? body.plan : null;
            if (!result.ok || !isTripPlan(plan)) {
                return { ok: false, plan: null, usedFallback: false, error: messageFrom(result.body, result.status) };
            }
            return {
                ok: true,
                plan: plan,
                usedFallback: body !== null && body.usedFallback === true,
                error: ""
            };
        }).catch(function () {
            return { ok: false, plan: null, usedFallback: false, error: "連不到行程服務，請檢查網路後再試。" };
        });
    }
    async function runSegments(token) {
        const progress = state.progress;
        if (!progress)
            return;
        segmentFlight += 1;
        progress.running = true;
        try {
            state.step = state.plan && state.plan.days.length > 0 ? 4 : 3;
            saveResult();
            render(state.step === 4 ? "trip-title" : undefined);
            while (progress.nextOffset < progress.totalDays) {
                if (token !== requestToken)
                    return;
                const count = Math.min(2, progress.totalDays - progress.nextOffset);
                const result = await postChunk(progress.request, progress.nextOffset, count, collectAvoidNames(state.plan), progress.useFallback, progress.stays, progress.rides);
                if (token !== requestToken)
                    return;
                if (!result.ok || !result.plan || result.plan.days.length !== count) {
                    progress.running = false;
                    const message = result.error !== "" ? result.error : "AI 回傳的天數不對。可以再試一次，或先改用示範資料。";
                    progress.error = message;
                    const kept = state.plan !== null && state.plan.days.length > 0;
                    state.error = kept ? "" : message;
                    state.step = kept ? 4 : 3;
                    saveResult();
                    render("plan-continue");
                    return;
                }
                const landed = state.plan ? state.plan.days.length : 0;
                adoptChunk(progress.request, result.plan);
                if (state.plan && state.plan.days[landed])
                    state.activeDay = landed;
                progress.nextOffset += count;
                progress.useFallback = result.usedFallback;
                progress.error = "";
                state.error = "";
                state.step = 4;
                saveResult();
                render("trip-title");
                scheduleStayGeocode();
            }
            if (token !== requestToken)
                return;
            state.progress = null;
            state.error = "";
            saveResult();
            render("trip-title");
            scheduleStayGeocode();
        }
        finally {
            segmentFlight = Math.max(0, segmentFlight - 1);
            if (segmentFlight === 0 && state.progress === progress && progress.running) {
                progress.running = false;
                saveResult();
                render(state.plan ? "trip-title" : "plan-continue");
            }
        }
    }
    function generate() {
        const ready = readyDraft();
        if (!ready) {
            render("form-error");
            return;
        }
        if (!PlannerRemote.onLocalHost() && PlannerRemote.passcode() === "") {
            state.error = "請先填通行碼並按儲存。";
            render("form-error");
            return;
        }
        const token = requestToken + 1;
        requestToken = token;
        regenToken += 1;
        clearMoveUndo();
        const stays = state.plan ? state.plan.accommodations.map(cloneStay) : [];
        const rides = state.plan ? state.plan.transports.map(cloneRide) : [];
        state.regen = null;
        state.error = "";
        state.plan = null;
        state.planSource = null;
        state.activeDay = 0;
        state.addOpen = false;
        state.addName = "";
        state.stayOpen = false;
        state.rideOpen = false;
        state.legDraft = null;
        state.stayError = "";
        state.rideError = "";
        state.legError = "";
        state.progress = {
            nextOffset: 0,
            totalDays: PlannerFormat.inclusiveDays(ready.startDate, ready.endDate),
            useFallback: false,
            running: true,
            error: "",
            request: ready,
            stays: stays,
            rides: rides
        };
        void runSegments(token);
    }
    function regenerateAll() {
        const plan = state.plan;
        if (!plan)
            return;
        if (state.progress && state.progress.running)
            return;
        if (state.regen && state.regen.running)
            return;
        const days = PlannerFormat.inclusiveDays(plan.startDate, plan.endDate);
        if (days < 1)
            return;
        if (!PlannerRemote.onLocalHost() && PlannerRemote.passcode() === "") {
            state.error = "請先填通行碼並按儲存。";
            render("trip-title");
            return;
        }
        const calls = Math.ceil(days / 2);
        const agreed = window.confirm("依目前的住宿與大交通，重新產生全部 " + String(days) + " 天。\n" +
            "這次大約會用掉 " + String(calls) + " 次 Gemini 額度（每 2 天 1 次）。\n" +
            "已填的住宿和大交通會保留，每天的景點會被換掉。\n要開始嗎？");
        if (!agreed)
            return;
        const ready = readyFromPlan(plan);
        const stays = plan.accommodations.map(cloneStay);
        const rides = plan.transports.map(cloneRide);
        const token = requestToken + 1;
        requestToken = token;
        regenToken += 1;
        clearMoveUndo();
        state.regen = null;
        state.error = "";
        state.plan = null;
        state.planSource = null;
        state.activeDay = 0;
        state.addOpen = false;
        state.addName = "";
        state.stayOpen = false;
        state.rideOpen = false;
        state.legDraft = null;
        state.stayError = "";
        state.rideError = "";
        state.legError = "";
        state.progress = {
            nextOffset: 0,
            totalDays: days,
            useFallback: false,
            running: true,
            error: "",
            request: ready,
            stays: stays,
            rides: rides
        };
        void runSegments(token);
    }
    function continuePlan() {
        const progress = state.progress;
        if (!progress || progress.running)
            return;
        const token = requestToken + 1;
        requestToken = token;
        progress.useFallback = false;
        progress.error = "";
        state.error = "";
        void runSegments(token);
    }
    function useMock() {
        requestToken += 1;
        const ready = readyDraft();
        if (!ready) {
            state.step = 2;
            render("form-error");
            return;
        }
        state.progress = null;
        applyPlan(PlannerMock.createPlan(ready), "mock");
    }
    function editPreferences() {
        requestToken += 1;
        state.error = "";
        if (state.progress) {
            state.progress.running = false;
            saveResult();
        }
        state.step = 2;
        render("note");
    }
    function restart() {
        const agreed = window.confirm("重新規劃會清空目前這筆行程的內容，其他行程會保留。要繼續嗎？");
        if (!agreed)
            return;
        requestToken += 1;
        geocodeToken += 1;
        clearMoveUndo();
        state.step = 1;
        state.plan = null;
        state.planSource = null;
        state.progress = null;
        state.activeDay = 0;
        state.addOpen = false;
        state.addName = "";
        state.stayOpen = false;
        state.rideOpen = false;
        state.legDraft = null;
        state.stayDraft = emptyStay();
        state.rideDraft = emptyRide();
        state.stayError = "";
        state.rideError = "";
        state.legError = "";
        state.rateError = "";
        state.regen = null;
        state.rates = PlannerRates.homeRates("TWD");
        state.error = "";
        state.draft = initialDraft();
        state.routeNote = null;
        const trip = activeSaved();
        if (trip) {
            trip.snapshot = blankSnapshot();
            trip.updatedAt = new Date().toISOString();
            writeLibrary();
        }
        render("destination");
    }
    function selectDay(index) {
        if (!state.plan || !state.plan.days[index])
            return;
        state.activeDay = index;
        state.addOpen = false;
        state.addName = "";
        state.stayOpen = false;
        state.rideOpen = false;
        state.legDraft = null;
        state.error = "";
        state.stayError = "";
        state.rideError = "";
        state.legError = "";
        saveResult();
        render("day-tab-" + String(index));
    }
    function removeStop(items, index) {
        if (!Number.isInteger(index) || index < 0 || index >= items.length)
            return false;
        const previous = index > 0 ? items[index - 1] : undefined;
        const hasNext = index < items.length - 1;
        items.splice(index, 1);
        if (!previous)
            return true;
        if (!hasNext) {
            delete previous.transportToNext;
            return true;
        }
        const next = items[index];
        if (!next) {
            delete previous.transportToNext;
            return true;
        }
        previous.transportToNext = estimateLeg(previous, next);
        return true;
    }
    function insertStop(items, item, afterIndex) {
        if (items.length === 0) {
            delete item.transportToNext;
            items.push(item);
            return;
        }
        const index = Math.max(0, Math.min(afterIndex, items.length - 1));
        const next = items[index + 1];
        const current = items[index];
        if (!current)
            return;
        current.transportToNext = estimateLeg(current, item);
        if (next)
            item.transportToNext = estimateLeg(item, next);
        else
            delete item.transportToNext;
        items.splice(index + 1, 0, item);
    }
    function cloneLeg(leg) {
        const copy = { mode: leg.mode, minutes: leg.minutes };
        if (leg.estimated)
            copy.estimated = true;
        if (leg.distanceEstimate)
            copy.distanceEstimate = true;
        if (leg.manual)
            copy.manual = true;
        if (typeof leg.distanceMeters === "number")
            copy.distanceMeters = leg.distanceMeters;
        if (leg.routeSource)
            copy.routeSource = leg.routeSource;
        if (leg.cost)
            copy.cost = { amount: leg.cost.amount, currency: leg.cost.currency };
        return copy;
    }
    function legPairKey(fromId, toId) {
        return fromId + "\n" + toId;
    }
    function captureLegs(days) {
        const map = {};
        for (let dayIndex = 0; dayIndex < days.length; dayIndex += 1) {
            const day = days[dayIndex];
            if (!day)
                continue;
            for (let index = 0; index < day.items.length; index += 1) {
                const item = day.items[index];
                const next = day.items[index + 1];
                if (!item || !next || !item.transportToNext)
                    continue;
                map[legPairKey(item.id, next.id)] = cloneLeg(item.transportToNext);
            }
        }
        return map;
    }
    function estimateLeg(from, to) {
        if (!PlannerFormat.isMappableLocation(from.location) || !PlannerFormat.isMappableLocation(to.location)) {
            return { mode: "walk", minutes: 15, estimated: true, routeSource: "estimate" };
        }
        const km = PlannerFormat.straightKm(from.location, to.location);
        const mode = km <= 1.2 ? "walk" : "train";
        const shape = PlannerRoutes.preview(from.location, to.location, mode);
        const leg = {
            mode: mode,
            minutes: shape.durationMinutes,
            estimated: true,
            distanceMeters: shape.distanceMeters,
            routeSource: sourceOf(mode, shape.network)
        };
        if (!shape.network)
            leg.distanceEstimate = true;
        return leg;
    }
    function rewireLegs(days, previous) {
        for (let dayIndex = 0; dayIndex < days.length; dayIndex += 1) {
            const day = days[dayIndex];
            if (!day)
                continue;
            for (let index = 0; index < day.items.length; index += 1) {
                const item = day.items[index];
                if (!item)
                    continue;
                const next = day.items[index + 1];
                if (!next) {
                    delete item.transportToNext;
                    continue;
                }
                const kept = previous[legPairKey(item.id, next.id)];
                if (kept)
                    item.transportToNext = cloneLeg(kept);
                else
                    item.transportToNext = estimateLeg(item, next);
            }
        }
    }
    function sourceOf(mode, network) {
        if (network && (mode === "walk" || mode === "car" || mode === "taxi"))
            return "route";
        return "estimate";
    }
    function applyResult(item, mode, shape, keepMinutes) {
        const leg = item.transportToNext;
        if (!leg || shape.cancelled)
            return;
        const next = {
            mode: mode,
            minutes: keepMinutes ? leg.minutes : shape.durationMinutes,
            distanceMeters: shape.distanceMeters,
            routeSource: sourceOf(mode, shape.network)
        };
        if (leg.manual)
            next.manual = true;
        if (leg.estimated && !leg.manual)
            next.estimated = true;
        if (!shape.network)
            next.distanceEstimate = true;
        if (leg.cost)
            next.cost = { amount: leg.cost.amount, currency: leg.cost.currency };
        item.transportToNext = next;
    }
    function findPair(fromId, toId) {
        if (!state.plan)
            return null;
        for (let dayIndex = 0; dayIndex < state.plan.days.length; dayIndex += 1) {
            const day = state.plan.days[dayIndex];
            if (!day)
                continue;
            for (let index = 0; index < day.items.length - 1; index += 1) {
                const item = day.items[index];
                const next = day.items[index + 1];
                if (item && next && item.id === fromId && next.id === toId)
                    return { item: item, next: next };
            }
        }
        return null;
    }
    function tryFinishFromCache(pair) {
        const leg = pair.item.transportToNext;
        if (!leg)
            return true;
        const from = pair.item.location;
        const to = pair.next.location;
        if (!PlannerFormat.isMappableLocation(from) || !PlannerFormat.isMappableLocation(to))
            return true;
        if (leg.manual) {
            const hit = PlannerRoutes.cached(from, to, leg.mode);
            if (!hit)
                return false;
            applyResult(pair.item, leg.mode, hit, true);
            return true;
        }
        if (leg.estimated) {
            const km = PlannerFormat.straightKm(from, to);
            if (km > 1.2) {
                const train = PlannerRoutes.cached(from, to, "train");
                if (!train)
                    return false;
                applyResult(pair.item, "train", train, false);
                return true;
            }
            const foot = PlannerRoutes.cached(from, to, "walk");
            if (!foot)
                return false;
            if (foot.distanceMeters <= 1200) {
                applyResult(pair.item, "walk", foot, false);
                return true;
            }
            const train = PlannerRoutes.cached(from, to, "train");
            if (!train)
                return false;
            applyResult(pair.item, "train", train, false);
            return true;
        }
        const hit = PlannerRoutes.cached(from, to, leg.mode);
        if (!hit)
            return false;
        applyResult(pair.item, leg.mode, hit, false);
        return true;
    }
    function commitRoute(fromId, toId, mode, shape, keepMinutes) {
        if (shape.cancelled)
            return false;
        const pair = findPair(fromId, toId);
        if (!pair || !pair.item.transportToNext)
            return true;
        const leg = pair.item.transportToNext;
        if (leg.manual && leg.mode !== mode)
            return true;
        const keep = leg.manual === true || keepMinutes;
        applyResult(pair.item, mode, shape, keep);
        saveResult();
        return true;
    }
    async function resolvePair(fromId, toId, token) {
        if (token !== routeToken)
            return false;
        const initial = findPair(fromId, toId);
        if (!initial || !initial.item.transportToNext)
            return true;
        const from = initial.item.location;
        const to = initial.next.location;
        if (!PlannerFormat.isMappableLocation(from) || !PlannerFormat.isMappableLocation(to))
            return true;
        const leg = initial.item.transportToNext;
        let mode = leg.mode;
        const auto = leg.estimated === true && leg.manual !== true;
        if (auto) {
            const km = PlannerFormat.straightKm(from, to);
            if (km > 1.2)
                mode = "train";
            else {
                const foot = await PlannerRoutes.lookup(from, to, "walk", false);
                if (token !== routeToken || foot.cancelled)
                    return false;
                if (foot.distanceMeters <= 1200)
                    return commitRoute(fromId, toId, "walk", foot, false);
                mode = "train";
            }
        }
        const shape = await PlannerRoutes.lookup(from, to, mode, false);
        if (token !== routeToken || shape.cancelled)
            return false;
        const current = findPair(fromId, toId);
        const keep = current !== null && current.item.transportToNext !== undefined &&
            current.item.transportToNext.manual === true && current.item.transportToNext.mode === mode;
        return commitRoute(fromId, toId, mode, shape, keep);
    }
    function segmentKey(day) {
        let key = String(state.activeDay) + "\n" + day.date;
        for (let index = 0; index < day.items.length; index += 1) {
            const item = day.items[index];
            key += "\n" + (item ? item.id : "");
        }
        return key;
    }
    function routablePairs(day) {
        const pairs = [];
        for (let index = 0; index < day.items.length - 1; index += 1) {
            const item = day.items[index];
            const next = day.items[index + 1];
            if (!item || !next || !item.transportToNext)
                continue;
            if (!PlannerFormat.isMappableLocation(item.location) || !PlannerFormat.isMappableLocation(next.location))
                continue;
            pairs.push({ item: item, next: next });
        }
        return pairs;
    }
    function prepareActiveDay() {
        const day = activeDayPlan();
        if (!day) {
            state.routeProgress = null;
            pendingPairs = [];
            return false;
        }
        const signature = segmentKey(day);
        if (signature === routeSignature)
            return false;
        routeToken += 1;
        PlannerRoutes.cancelPending();
        routeSignature = signature;
        const refreshed = refreshDayEstimates(day.items);
        const pairs = routablePairs(day);
        const waiting = [];
        let done = 0;
        for (let index = 0; index < pairs.length; index += 1) {
            const pair = pairs[index];
            if (!pair)
                continue;
            if (tryFinishFromCache(pair))
                done += 1;
            else
                waiting.push(pair);
        }
        pendingPairs = waiting;
        state.routeProgress = waiting.length === 0 ? null : { done: done, total: pairs.length };
        const plan = state.plan;
        const topped = waiting.length === 0 && plan ? topUpDinnerGap(plan, day) : false;
        if (done > 0 || refreshed || topped)
            saveResult();
        return waiting.length > 0;
    }
    function daySegments() {
        const day = activeDayPlan();
        if (!day)
            return [];
        const segments = [];
        for (let index = 0; index < day.items.length - 1; index += 1) {
            const item = day.items[index];
            const next = day.items[index + 1];
            if (!item || !next || !item.transportToNext)
                continue;
            if (!PlannerFormat.isMappableLocation(item.location) || !PlannerFormat.isMappableLocation(next.location))
                continue;
            const mode = item.transportToNext.mode;
            const hit = PlannerRoutes.cached(item.location, next.location, mode);
            let coordinates;
            if (hit && hit.network && hit.coordinates.length >= 2)
                coordinates = hit.coordinates;
            else
                coordinates = [[item.location.lat, item.location.lng], [next.location.lat, next.location.lng]];
            let kind = "loading";
            if (hit && hit.network) {
                if (mode === "walk")
                    kind = "walk";
                else if (mode === "car" || mode === "taxi")
                    kind = "drive";
                else
                    kind = "transit";
            }
            else if (item.transportToNext.routeSource === "estimate" && (mode === "train" || mode === "bus")) {
                kind = "transit";
            }
            segments.push({ coordinates: coordinates, kind: kind });
        }
        return segments;
    }
    function syncProgressNode() {
        const node = document.getElementById("route-progress");
        const progress = state.routeProgress;
        if (!progress || progress.done >= progress.total) {
            if (node)
                node.remove();
            return;
        }
        const text = "正在計算路線 " + String(progress.done) + "／" + String(progress.total) + "…";
        if (node)
            node.textContent = text;
    }
    function refreshDayPanel() {
        PlannerMap.setRoutes(daySegments());
        if (sorting || state.legDraft || state.addOpen || state.stayOpen || state.rideOpen) {
            syncProgressNode();
            return;
        }
        const panel = document.getElementById("day-panel");
        if (!(panel instanceof HTMLElement))
            return;
        destroySortable();
        panel.innerHTML = PlannerView.renderDayPanel(state);
        mountSortable();
    }
    async function runJobs(token, jobs, done, total) {
        for (let index = 0; index < jobs.length; index += 1) {
            const pair = jobs[index];
            if (!pair || token !== routeToken)
                return;
            const settled = await resolvePair(pair.item.id, pair.next.id, token);
            if (token !== routeToken || !settled)
                return;
            done += 1;
            state.routeProgress = done >= total ? null : { done: done, total: total };
            refreshDayPanel();
        }
        const plan = state.plan;
        const day = activeDayPlan();
        if (token === routeToken && plan && day && topUpDinnerGap(plan, day)) {
            saveResult();
            refreshDayPanel();
        }
    }
    function cloneDays(days) {
        const parsed = JSON.parse(JSON.stringify(days));
        if (!Array.isArray(parsed))
            return [];
        return parsed;
    }
    function cloneHeld(items) {
        const parsed = JSON.parse(JSON.stringify(items));
        if (!Array.isArray(parsed))
            return [];
        return parsed;
    }
    function clearMoveUndo() {
        moveUndo = null;
        state.canUndoMove = false;
    }
    function rememberMove() {
        state.routeNote = null;
        if (!state.plan)
            return;
        const held = state.plan.unscheduled || [];
        moveUndo = { days: cloneDays(state.plan.days), activeDay: state.activeDay, unscheduled: cloneHeld(held) };
        state.canUndoMove = true;
    }
    function moveWithinDay(fromIndex, toIndex) {
        const plan = state.plan;
        const day = activeDayPlan();
        if (!plan || !day)
            return;
        if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || fromIndex === toIndex)
            return;
        if (fromIndex < 0 || toIndex < 0 || fromIndex >= day.items.length || toIndex >= day.items.length)
            return;
        const moved = day.items[fromIndex];
        if (!moved)
            return;
        const previous = captureLegs(plan.days);
        rememberMove();
        day.items.splice(fromIndex, 1);
        day.items.splice(toIndex, 0, moved);
        rewireLegs(plan.days, previous);
        closeEditors();
        saveResult();
        render();
    }
    function moveToDayEnd(fromIndex, dayIndex) {
        const plan = state.plan;
        const source = activeDayPlan();
        if (!plan || !source)
            return;
        const target = plan.days[dayIndex];
        if (!target)
            return;
        if (PlannerFormat.dayClosed(PlannerFormat.dayWindow(plan, target.date))) {
            state.error = "這天沒有可排時段，不能把景點排進來。";
            render();
            return;
        }
        if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= source.items.length)
            return;
        if (dayIndex === state.activeDay && fromIndex === source.items.length - 1)
            return;
        const moved = source.items[fromIndex];
        if (!moved)
            return;
        const previous = captureLegs(plan.days);
        rememberMove();
        source.items.splice(fromIndex, 1);
        target.items.push(moved);
        rewireLegs(plan.days, previous);
        state.activeDay = dayIndex;
        state.error = "";
        closeEditors();
        saveResult();
        render("day-tab-" + String(dayIndex));
    }
    function moveHeldToDay(fromIndex, dayIndex) {
        const plan = state.plan;
        if (!plan)
            return;
        if (!Array.isArray(plan.unscheduled))
            plan.unscheduled = [];
        const target = plan.days[dayIndex];
        if (!target)
            return;
        if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= plan.unscheduled.length)
            return;
        if (PlannerFormat.dayClosed(PlannerFormat.dayWindow(plan, target.date))) {
            state.error = "這天沒有可排時段，景點留在未排入的景點。";
            render();
            return;
        }
        const moved = plan.unscheduled[fromIndex];
        if (!moved)
            return;
        const previous = captureLegs(plan.days);
        rememberMove();
        plan.unscheduled.splice(fromIndex, 1);
        delete moved.transportToNext;
        target.items.push(moved);
        rewireLegs(plan.days, previous);
        state.activeDay = dayIndex;
        state.error = "";
        closeEditors();
        saveResult();
        render("day-tab-" + String(dayIndex));
    }
    function deleteHeld(index) {
        const plan = state.plan;
        if (!plan || !Array.isArray(plan.unscheduled))
            return;
        if (!Number.isInteger(index) || index < 0 || index >= plan.unscheduled.length)
            return;
        plan.unscheduled.splice(index, 1);
        clearMoveUndo();
        closeEditors();
        saveResult();
        render();
    }
    function undoMove() {
        const plan = state.plan;
        if (!plan || !moveUndo)
            return;
        state.routeNote = null;
        const snapshot = moveUndo;
        plan.days = cloneDays(snapshot.days);
        plan.unscheduled = cloneHeld(snapshot.unscheduled);
        state.activeDay = plan.days[snapshot.activeDay] ? snapshot.activeDay : 0;
        clearMoveUndo();
        closeEditors();
        saveResult();
        render("day-tab-" + String(state.activeDay));
    }
    function morningOrigin(plan, date) {
        const previous = PlannerFormat.addDays(date, -1);
        const stays = plan.accommodations;
        for (let index = 0; index < stays.length; index += 1) {
            const stay = stays[index];
            if (!stay || !PlannerBudget.coversNight(stay, previous))
                continue;
            const point = PlannerFormat.stayAnchor(stay);
            if (point)
                return point;
        }
        return null;
    }
    function morningStayPoint(plan, date) {
        const previous = PlannerFormat.addDays(date, -1);
        const stays = plan.accommodations;
        for (let index = 0; index < stays.length; index += 1) {
            const stay = stays[index];
            if (!stay || !PlannerBudget.coversNight(stay, previous))
                continue;
            const point = PlannerFormat.stayPoint(stay);
            if (point)
                return point;
        }
        return null;
    }
    function hopMinutes(from, to) {
        const km = PlannerFormat.straightKm(from, to);
        if (!(km >= 0.08))
            return 0;
        const mode = km <= 1.2 ? "walk" : "train";
        const shape = PlannerRoutes.preview(from, to, mode);
        if (!Number.isFinite(shape.durationMinutes) || shape.durationMinutes <= 0)
            return 0;
        return shape.durationMinutes;
    }
    function queueOpeningRoute() {
        const plan = state.plan;
        const day = activeDayPlan();
        if (!plan || !day || day.items.length === 0)
            return;
        const origin = morningStayPoint(plan, day.date);
        const first = day.items[0];
        if (!origin || !first || !PlannerFormat.isMappableLocation(first.location))
            return;
        const km = PlannerFormat.straightKm(origin, first.location);
        if (!(km >= 0.08))
            return;
        const mode = km <= 1.2 ? "walk" : "train";
        if (PlannerRoutes.cached(origin, first.location, mode))
            return;
        const token = routeToken;
        void PlannerRoutes.lookup(origin, first.location, mode, false).then(function (shape) {
            if (token !== routeToken || shape.cancelled)
                return;
            refreshDayPanel();
        });
    }
    function tonightPoint(plan, date) {
        const stays = plan.accommodations;
        for (let index = 0; index < stays.length; index += 1) {
            const stay = stays[index];
            if (!stay || !PlannerBudget.coversNight(stay, date))
                continue;
            const point = PlannerFormat.stayAnchor(stay);
            if (point)
                return point;
        }
        return null;
    }
    function nearestStops(origin, pool) {
        const remaining = pool.slice();
        const ordered = [];
        let current = origin;
        while (remaining.length > 0) {
            let bestIndex = 0;
            let bestDistance = Number.POSITIVE_INFINITY;
            let bestOrder = Number.POSITIVE_INFINITY;
            for (let index = 0; index < remaining.length; index += 1) {
                const pick = remaining[index];
                if (!pick || !PlannerFormat.isMappableLocation(pick.item.location))
                    continue;
                const distance = PlannerFormat.straightKm(current, pick.item.location);
                const closer = distance + 0.000001 < bestDistance;
                const tied = Math.abs(distance - bestDistance) <= 0.000001 && pick.order < bestOrder;
                if (closer || tied) {
                    bestIndex = index;
                    bestDistance = distance;
                    bestOrder = pick.order;
                }
            }
            const picked = remaining.splice(bestIndex, 1)[0];
            if (!picked)
                break;
            ordered.push(picked.item);
            if (PlannerFormat.isMappableLocation(picked.item.location)) {
                current = { lat: picked.item.location.lat, lng: picked.item.location.lng };
            }
        }
        return ordered;
    }
    function previewMinutes(from, to) {
        if (legMinuteMap) {
            const known = legMinuteMap[legPairKey(from.id, to.id)];
            if (typeof known === "number" && known > 0)
                return known;
        }
        const minutes = estimateLeg(from, to).minutes;
        if (!Number.isFinite(minutes) || minutes <= 0)
            return 0;
        return minutes;
    }
    function jumpClock(cursor, blocks) {
        let next = cursor;
        let guard = 0;
        while (guard < blocks.length + 2) {
            let moved = false;
            for (let index = 0; index < blocks.length; index += 1) {
                const block = blocks[index];
                if (!block)
                    continue;
                if (next >= block.startMinutes && next < block.endMinutes) {
                    next = block.endMinutes;
                    moved = true;
                }
            }
            if (!moved)
                return next;
            guard += 1;
        }
        return next;
    }
    function minuteBlocked(minute, blocks, endMinutes) {
        if (endMinutes !== null && minute > endMinutes)
            return true;
        for (let index = 0; index < blocks.length; index += 1) {
            const block = blocks[index];
            if (block && minute >= block.startMinutes && minute < block.endMinutes)
                return true;
        }
        return false;
    }
    function previewArrivals(items, startMinutes, blocks) {
        const arrivals = [];
        let cursor = jumpClock(startMinutes, blocks);
        const first = items[0];
        if (first && departOrigin && PlannerFormat.isMappableLocation(first.location)) {
            cursor += hopMinutes(departOrigin, first.location);
        }
        for (let index = 0; index < items.length; index += 1) {
            const item = items[index];
            cursor = jumpClock(cursor, blocks);
            arrivals.push(cursor);
            if (!item)
                continue;
            const stay = Number.isFinite(item.durationMinutes) && item.durationMinutes > 0 ? item.durationMinutes : 0;
            cursor += stay;
            if (typeof item.breakMinutes === "number" && item.breakMinutes > 0)
                cursor += item.breakMinutes;
            const next = items[index + 1];
            if (next)
                cursor += previewMinutes(item, next);
        }
        return arrivals;
    }
    function mealWindow(slot) {
        const windows = PlannerFormat.mealWindows();
        for (let index = 0; index < windows.length; index += 1) {
            const window = windows[index];
            if (window && window.slot === slot)
                return window;
        }
        return null;
    }
    function minutesOutside(clock, meal) {
        const early = meal.slot === "lunch" ? PlannerSchedule.mealEarlySlackMinutes() : 0;
        const start = meal.start - early;
        if (clock < start)
            return start - clock;
        if (clock > meal.end)
            return clock - meal.end;
        return 0;
    }
    function insertionDetour(previous, restaurant, next, origin) {
        if (!PlannerFormat.isMappableLocation(restaurant.location))
            return 0;
        let incoming = 0;
        if (previous && PlannerFormat.isMappableLocation(previous.location)) {
            incoming = PlannerFormat.straightKm(previous.location, restaurant.location);
        }
        else if (!previous && origin) {
            incoming = PlannerFormat.straightKm(origin, restaurant.location);
        }
        let outgoing = 0;
        if (next && PlannerFormat.isMappableLocation(next.location)) {
            outgoing = PlannerFormat.straightKm(restaurant.location, next.location);
        }
        let direct = 0;
        if (previous && next &&
            PlannerFormat.isMappableLocation(previous.location) &&
            PlannerFormat.isMappableLocation(next.location)) {
            direct = PlannerFormat.straightKm(previous.location, next.location);
        }
        else if (!previous && next && origin && PlannerFormat.isMappableLocation(next.location)) {
            direct = PlannerFormat.straightKm(origin, next.location);
        }
        const extra = incoming + outgoing - direct;
        if (!Number.isFinite(extra) || extra < 0)
            return 0;
        return extra;
    }
    function extendRoom(item) {
        const cap = PlannerSchedule.maxExtendMinutes();
        const base = durationBase && typeof durationBase[item.id] === "number" ? durationBase[item.id] : item.durationMinutes;
        return Math.max(0, base + cap - item.durationMinutes);
    }
    function collectStretch(sequence, index, needed, unlimited) {
        const stretches = [];
        let left = needed;
        for (let cursor = index - 1; cursor >= 0 && left > 0; cursor -= 1) {
            const item = sequence[cursor];
            if (!item || item.type === "restaurant")
                break;
            const room = unlimited ? left : extendRoom(item);
            const add = Math.min(room, left);
            if (add <= 0)
                continue;
            stretches.push({ item: item, add: add });
            left -= add;
        }
        return stretches;
    }
    function shiftStretch(stretches, direction) {
        for (let index = 0; index < stretches.length; index += 1) {
            const row = stretches[index];
            if (!row)
                continue;
            row.item.durationMinutes += direction * row.add;
        }
    }
    function stretchTotal(stretches) {
        let total = 0;
        for (let index = 0; index < stretches.length; index += 1) {
            const row = stretches[index];
            if (row)
                total += row.add;
        }
        return total;
    }
    function applyStretchAt(sequence, index, extendBy, delay) {
        if (extendBy <= 0 || index <= 0)
            return;
        const capped = collectStretch(sequence, index, extendBy);
        shiftStretch(capped, 1);
        const used = stretchTotal(capped);
        if (delay && extendBy > used)
            shiftStretch(collectStretch(sequence, index, extendBy - used, true), 1);
    }
    function mealCandidates(sequence, restaurant, startMinutes, meal, origin, blocks, endMinutes, indexFrom, indexTo) {
        const candidates = [];
        const first = indexFrom > 0 ? indexFrom : 0;
        const last = indexTo < sequence.length ? indexTo : sequence.length;
        for (let index = first; index <= last; index += 1) {
            const previous = index > 0 ? sequence[index - 1] : undefined;
            const next = sequence[index];
            const adjacent = (previous !== undefined && previous.type === "restaurant") ||
                (next !== undefined && next.type === "restaurant");
            const trial = sequence.slice();
            trial.splice(index, 0, restaurant);
            const arrivals = previewArrivals(trial, startMinutes, blocks);
            const arrival = arrivals[index];
            const clock = PlannerFormat.clockMinutes(typeof arrival === "number" ? arrival : startMinutes);
            const extendBy = 0;
            const usedArrival = typeof arrival === "number" ? arrival : startMinutes;
            let outside = minutesOutside(clock, meal);
            if (minuteBlocked(usedArrival, blocks, endMinutes))
                outside += 24 * 60;
            let incoming = 0;
            if (previous)
                incoming = previewMinutes(previous, restaurant);
            else if (departOrigin && PlannerFormat.isMappableLocation(restaurant.location)) {
                incoming = hopMinutes(departOrigin, restaurant.location);
            }
            candidates.push({
                index: index,
                outside: outside,
                midpointGap: Math.abs(clock - meal.midpoint),
                detourKm: insertionDetour(previous, restaurant, next, origin),
                adjacent: adjacent,
                extendBy: extendBy,
                longIncoming: incoming > PlannerSchedule.longLegMinutes()
            });
        }
        const open = [];
        for (let index = 0; index < candidates.length; index += 1) {
            const candidate = candidates[index];
            if (candidate && !candidate.adjacent)
                open.push(candidate);
        }
        if (open.length > 0)
            return open;
        return candidates;
    }
    function preferMealStop(candidate, current) {
        if (candidate.outside !== current.outside)
            return candidate.outside < current.outside;
        if (Math.abs(candidate.detourKm - current.detourKm) > 0.05)
            return candidate.detourKm < current.detourKm;
        if (candidate.extendBy !== current.extendBy)
            return candidate.extendBy < current.extendBy;
        if (candidate.midpointGap !== current.midpointGap)
            return candidate.midpointGap < current.midpointGap;
        return candidate.index < current.index;
    }
    function leastDetour(list) {
        let best = null;
        for (let index = 0; index < list.length; index += 1) {
            const candidate = list[index];
            if (!candidate)
                continue;
            if (!best || preferMealStop(candidate, best))
                best = candidate;
        }
        return best;
    }
    function chooseMealIndex(sequence, restaurant, startMinutes, meal, origin, blocks, endMinutes, indexFrom, indexTo) {
        const candidates = mealCandidates(sequence, restaurant, startMinutes, meal, origin, blocks, endMinutes, indexFrom, indexTo);
        const local = [];
        const localClose = [];
        for (let index = 0; index < candidates.length; index += 1) {
            const candidate = candidates[index];
            if (!candidate || candidate.longIncoming)
                continue;
            local.push(candidate);
            if (candidate.outside <= 30)
                localClose.push(candidate);
        }
        const localOnTime = [];
        for (let index = 0; index < localClose.length; index += 1) {
            const candidate = localClose[index];
            if (candidate && candidate.outside === 0)
                localOnTime.push(candidate);
        }
        const stayLocal = leastDetour(localOnTime) || leastDetour(localClose) || leastDetour(local);
        if (stayLocal)
            return stayLocal;
        const fallback = leastDetour(candidates);
        if (fallback)
            return fallback;
        const at = indexTo < sequence.length ? indexTo : sequence.length;
        return {
            index: at,
            outside: 0,
            midpointGap: 0,
            detourKm: 0,
            adjacent: false,
            extendBy: 0,
            longIncoming: false
        };
    }
    function timeFit(sequence, restaurant, startMinutes, meal, origin, blocks, endMinutes) {
        const candidates = mealCandidates(sequence, restaurant, startMinutes, meal, origin, blocks, endMinutes, 0, sequence.length);
        let best = candidates[0];
        for (let index = 1; index < candidates.length; index += 1) {
            const candidate = candidates[index];
            if (!candidate || !best)
                continue;
            if (candidate.outside < best.outside || (candidate.outside === best.outside && candidate.midpointGap < best.midpointGap)) {
                best = candidate;
            }
        }
        if (!best)
            return { outside: 0, midpointGap: 0 };
        return { outside: best.outside, midpointGap: best.midpointGap };
    }
    function chosenWindow(sequence, restaurant, startMinutes, prefer, origin, blocks, endMinutes) {
        const lunch = mealWindow("lunch");
        const dinner = mealWindow("dinner");
        if (prefer === "lunch")
            return lunch || dinner;
        if (prefer === "dinner")
            return dinner || lunch;
        if (!lunch)
            return dinner;
        if (!dinner)
            return lunch;
        const lunchFit = timeFit(sequence, restaurant, startMinutes, lunch, origin, blocks, endMinutes);
        const dinnerFit = timeFit(sequence, restaurant, startMinutes, dinner, origin, blocks, endMinutes);
        if (lunchFit.outside < dinnerFit.outside)
            return lunch;
        if (dinnerFit.outside < lunchFit.outside)
            return dinner;
        if (lunchFit.midpointGap <= dinnerFit.midpointGap)
            return lunch;
        return dinner;
    }
    function insertMeal(sequence, restaurant, startMinutes, prefer, origin, blocks, endMinutes) {
        const meal = chosenWindow(sequence, restaurant, startMinutes, prefer, origin, blocks, endMinutes);
        if (!meal) {
            sequence.push(restaurant);
            return;
        }
        const slot = chooseMealIndex(sequence, restaurant, startMinutes, meal, origin, blocks, endMinutes, 0, sequence.length);
        applyStretchAt(sequence, slot.index, slot.extendBy, meal.slot === "dinner");
        sequence.splice(slot.index, 0, restaurant);
    }
    function moveClosestToEnd(items, target) {
        let best = -1;
        let bestKm = Number.POSITIVE_INFINITY;
        for (let index = 0; index < items.length; index += 1) {
            const item = items[index];
            if (!item || !PlannerFormat.isMappableLocation(item.location))
                continue;
            const distance = PlannerFormat.straightKm(item.location, target);
            if (distance < bestKm) {
                bestKm = distance;
                best = index;
            }
        }
        if (best < 0 || best === items.length - 1)
            return;
        const picked = items.splice(best, 1)[0];
        if (picked)
            items.push(picked);
    }
    function refreshDayEstimates(items) {
        let changed = false;
        for (let index = 0; index < items.length - 1; index += 1) {
            const item = items[index];
            const next = items[index + 1];
            if (!item || !next || !item.transportToNext)
                continue;
            const leg = item.transportToNext;
            if (leg.manual || leg.routeSource === "route")
                continue;
            if (!PlannerFormat.isMappableLocation(item.location) || !PlannerFormat.isMappableLocation(next.location))
                continue;
            const meters = typeof leg.distanceMeters === "number" && leg.distanceMeters > 0
                ? leg.distanceMeters
                : PlannerFormat.straightKm(item.location, next.location) * 1000;
            const legacy = PlannerSchedule.isLegacyIntercityEstimate(leg.mode, meters, leg.minutes);
            if (!legacy && leg.distanceEstimate !== true)
                continue;
            const minutes = PlannerSchedule.travelMinutes(leg.mode, meters);
            if (minutes === leg.minutes)
                continue;
            leg.minutes = minutes;
            leg.estimated = true;
            leg.routeSource = "estimate";
            if (typeof leg.distanceMeters !== "number")
                leg.distanceMeters = Math.max(0, Math.round(meters));
            changed = true;
        }
        return changed;
    }
    function itemSide(item, morning, evening) {
        if (!PlannerFormat.isMappableLocation(item.location))
            return "morning";
        const toEvening = PlannerFormat.straightKm(item.location, evening);
        const toMorning = PlannerFormat.straightKm(item.location, morning);
        if (toEvening + 0.05 < toMorning)
            return "evening";
        return "morning";
    }
    function orderedSide(pool, geographic, origin, endTarget) {
        const ordered = [];
        if (geographic && origin && pool.length > 0) {
            const nearest = nearestStops(origin, pool.slice());
            for (let index = 0; index < nearest.length; index += 1) {
                const item = nearest[index];
                if (item)
                    ordered.push(item);
            }
        }
        else {
            for (let index = 0; index < pool.length; index += 1) {
                const pick = pool[index];
                if (pick)
                    ordered.push(pick.item);
            }
        }
        if (geographic && endTarget)
            moveClosestToEnd(ordered, endTarget);
        return ordered;
    }
    function insertAt(sequence, restaurant, slot, delay) {
        applyStretchAt(sequence, slot.index, slot.extendBy, delay);
        sequence.splice(slot.index, 0, restaurant);
    }
    function placeRegionMeals(sequence, restaurants, minIndex, prefer, startMinutes, origin, blocks, endMinutes) {
        const meal = mealWindow(prefer);
        if (!meal || restaurants.length === 0) {
            for (let index = 0; index < restaurants.length; index += 1) {
                const restaurant = restaurants[index];
                if (restaurant)
                    sequence.push(restaurant);
            }
            return;
        }
        let chosen = -1;
        let chosenSlot = null;
        let forced = -1;
        let forcedSlot = null;
        for (let index = 0; index < restaurants.length; index += 1) {
            const restaurant = restaurants[index];
            if (!restaurant)
                continue;
            const slot = chooseMealIndex(sequence, restaurant, startMinutes, meal, origin, blocks, endMinutes, minIndex, sequence.length);
            if (slot.outside === 0) {
                chosen = index;
                chosenSlot = slot;
                break;
            }
            if (!forcedSlot || preferMealStop(slot, forcedSlot)) {
                forced = index;
                forcedSlot = slot;
            }
        }
        const useIndex = chosen >= 0 ? chosen : forced;
        const useSlot = chosen >= 0 ? chosenSlot : forcedSlot;
        if (useIndex >= 0 && useSlot) {
            const restaurant = restaurants[useIndex];
            if (restaurant)
                insertAt(sequence, restaurant, useSlot, prefer === "dinner");
        }
        for (let index = 0; index < restaurants.length; index += 1) {
            if (index === useIndex)
                continue;
            const restaurant = restaurants[index];
            if (restaurant)
                sequence.push(restaurant);
        }
    }
    function nearerSlot(clock) {
        const lunch = mealWindow("lunch");
        const dinner = mealWindow("dinner");
        if (!lunch || !dinner)
            return lunch ? "lunch" : "dinner";
        const minute = PlannerFormat.clockMinutes(clock);
        if (minute <= lunch.end)
            return "lunch";
        if (minute >= dinner.start)
            return "dinner";
        return minute - lunch.end <= dinner.start - minute ? "lunch" : "dinner";
    }
    function naturalArrival(sequence, restaurant, startMinutes, blocks, origin) {
        let bestIndex = sequence.length;
        let bestDetour = Number.POSITIVE_INFINITY;
        for (let index = 0; index <= sequence.length; index += 1) {
            const previous = index > 0 ? sequence[index - 1] : undefined;
            const next = sequence[index];
            const detour = insertionDetour(previous, restaurant, next, origin);
            if (detour < bestDetour) {
                bestDetour = detour;
                bestIndex = index;
            }
        }
        const trial = sequence.slice();
        trial.splice(bestIndex, 0, restaurant);
        const arrivals = previewArrivals(trial, startMinutes, blocks);
        const arrival = arrivals[bestIndex];
        return typeof arrival === "number" ? arrival : startMinutes;
    }
    function placeOneMeal(sequence, restaurant, minIndex, prefer, startMinutes, origin, blocks, endMinutes) {
        const meal = mealWindow(prefer);
        if (!meal) {
            sequence.push(restaurant);
            return;
        }
        const slot = chooseMealIndex(sequence, restaurant, startMinutes, meal, origin, blocks, endMinutes, minIndex, sequence.length);
        insertAt(sequence, restaurant, slot, prefer === "dinner");
    }
    /** 兩間餐廳：先到的是午餐、後到的是晚餐。只有一間且靠近午餐時段時，算午餐。延後只套在晚餐。 */
    function placeDayMeals(sequence, restaurants, startMinutes, origin, blocks, endMinutes) {
        if (restaurants.length === 1) {
            const only = restaurants[0];
            if (!only)
                return;
            const prefer = nearerSlot(naturalArrival(sequence, only, startMinutes, blocks, origin));
            placeOneMeal(sequence, only, 0, prefer, startMinutes, origin, blocks, endMinutes);
            return;
        }
        if (restaurants.length !== 2)
            return;
        const lunchItem = restaurants[0];
        const dinnerItem = restaurants[1];
        if (!lunchItem || !dinnerItem)
            return;
        placeOneMeal(sequence, lunchItem, 0, "lunch", startMinutes, origin, blocks, endMinutes);
        const lunchAt = sequence.indexOf(lunchItem);
        const dinnerFrom = lunchAt >= 0 ? lunchAt + 1 : 0;
        placeOneMeal(sequence, dinnerItem, dinnerFrom, "dinner", startMinutes, origin, blocks, endMinutes);
    }
    function buildTransferSequence(items, morning, evening, geographic, startMinutes, blocks, endMinutes) {
        const morningStops = [];
        const eveningStops = [];
        const morningRestaurants = [];
        const eveningRestaurants = [];
        const dayRestaurants = [];
        const loose = [];
        for (let index = 0; index < items.length; index += 1) {
            const item = items[index];
            if (!item)
                continue;
            const side = itemSide(item, morning, evening);
            if (item.type === "restaurant") {
                dayRestaurants.push(item);
                if (side === "evening")
                    eveningRestaurants.push(item);
                else
                    morningRestaurants.push(item);
                continue;
            }
            if (!PlannerFormat.isMappableLocation(item.location)) {
                loose.push(item);
                continue;
            }
            const bucket = side === "evening" ? eveningStops : morningStops;
            bucket.push({ item: item, order: index });
        }
        const sequence = orderedSide(morningStops, geographic, morning, null);
        for (let index = 0; index < loose.length; index += 1) {
            const item = loose[index];
            if (item)
                sequence.push(item);
        }
        if (dayRestaurants.length === 1 || dayRestaurants.length === 2) {
            const earlyTail = sequence.length > 0 ? sequence[sequence.length - 1] : undefined;
            const earlyFrom = earlyTail && PlannerFormat.isMappableLocation(earlyTail.location)
                ? { lat: earlyTail.location.lat, lng: earlyTail.location.lng }
                : morning;
            const earlyEvening = orderedSide(eveningStops, geographic, earlyFrom, evening);
            for (let index = 0; index < earlyEvening.length; index += 1) {
                const item = earlyEvening[index];
                if (item)
                    sequence.push(item);
            }
            placeDayMeals(sequence, dayRestaurants, startMinutes, morning, blocks, endMinutes);
            return sequence;
        }
        placeRegionMeals(sequence, morningRestaurants, 0, "lunch", startMinutes, morning, blocks, endMinutes);
        const tail = sequence.length > 0 ? sequence[sequence.length - 1] : undefined;
        const from = tail && PlannerFormat.isMappableLocation(tail.location)
            ? { lat: tail.location.lat, lng: tail.location.lng }
            : morning;
        const eveningOrdered = orderedSide(eveningStops, geographic, from, evening);
        const boundary = sequence.length;
        for (let index = 0; index < eveningOrdered.length; index += 1) {
            const item = eveningOrdered[index];
            if (item)
                sequence.push(item);
        }
        placeRegionMeals(sequence, eveningRestaurants, boundary, "dinner", startMinutes, evening, blocks, endMinutes);
        return sequence;
    }
    function rememberLegMinutes(items) {
        const map = {};
        for (let index = 0; index < items.length - 1; index += 1) {
            const item = items[index];
            const next = items[index + 1];
            if (!item || !next || !item.transportToNext)
                continue;
            const minutes = item.transportToNext.minutes;
            if (Number.isFinite(minutes) && minutes > 0)
                map[legPairKey(item.id, next.id)] = minutes;
        }
        legMinuteMap = map;
    }
    function withoutLodgingStops(plan, day) {
        const lodging = PlannerFormat.dayLodging(plan, day.date);
        const kept = [];
        for (let index = 0; index < day.items.length; index += 1) {
            const item = day.items[index];
            if (!item)
                continue;
            if (PlannerFormat.lodgingRole(item.name, lodging) !== "")
                continue;
            kept.push(item);
        }
        return kept;
    }
    function restorePlannedStays(items) {
        for (let index = 0; index < items.length; index += 1) {
            const item = items[index];
            if (!item || item.type === "restaurant")
                continue;
            if (typeof item.baseDurationMinutes !== "number" || item.baseDurationMinutes <= 0)
                continue;
            item.durationMinutes = item.baseDurationMinutes;
            item.breakMinutes = 0;
        }
    }
    function rememberStayBase(item) {
        if (typeof item.baseDurationMinutes === "number" && item.baseDurationMinutes > 0)
            return;
        item.baseDurationMinutes = item.durationMinutes;
    }
    function dinnerStopIndex(sequence, startMinutes, blocks) {
        const found = [];
        for (let index = 0; index < sequence.length; index += 1) {
            const item = sequence[index];
            if (item && item.type === "restaurant")
                found.push(index);
        }
        if (found.length >= 2) {
            const later = found[found.length - 1];
            return typeof later === "number" ? later : -1;
        }
        if (found.length !== 1)
            return -1;
        const only = found[0];
        if (typeof only !== "number")
            return -1;
        const arrivals = previewArrivals(sequence, startMinutes, blocks);
        const clock = PlannerFormat.clockMinutes(arrivals[only] || startMinutes);
        if (nearerSlot(clock) === "lunch")
            return -1;
        return only;
    }
    function shrinkBeforeDinner(sequence, index, needed) {
        let left = needed;
        for (let cursor = index - 1; cursor >= 0 && left > 0; cursor -= 1) {
            const item = sequence[cursor];
            if (!item || item.type === "restaurant")
                break;
            const floor = typeof item.baseDurationMinutes === "number" && item.baseDurationMinutes > 0
                ? item.baseDurationMinutes
                : 1;
            const removable = Math.max(0, item.durationMinutes - floor);
            const cut = Math.min(removable, left);
            if (cut <= 0)
                continue;
            item.durationMinutes -= cut;
            left -= cut;
        }
    }
    function stopsBeforeDinner(sequence, index) {
        const indexes = [];
        for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
            const item = sequence[cursor];
            if (!item || item.type === "restaurant")
                break;
            indexes.push(cursor);
        }
        indexes.reverse();
        return indexes;
    }
    /** 把先前為了等晚餐而超過上限的停留收回。多出來的空檔另外記成自由時間。 */
    function peelDinnerOverstretch(sequence, index, startMinutes, blocks) {
        const indexes = stopsBeforeDinner(sequence, index);
        for (let step = 0; step < indexes.length; step += 1) {
            const at = indexes[step];
            const item = at === undefined ? undefined : sequence[at];
            if (at === undefined || !item)
                continue;
            const arrivals = previewArrivals(sequence, startMinutes, blocks);
            const arrival = arrivals[at];
            const cap = PlannerSchedule.dinnerStayCap(item, typeof arrival === "number" ? arrival : startMinutes);
            if (item.durationMinutes > cap)
                item.durationMinutes = cap;
        }
    }
    function positiveStay(item) {
        return Number.isFinite(item.durationMinutes) && item.durationMinutes > 0 ? item.durationMinutes : 0;
    }
    function positiveBreak(item) {
        return typeof item.breakMinutes === "number" && item.breakMinutes > 0 ? item.breakMinutes : 0;
    }
    /** 和畫面上的抵達時刻同一套：出發車程四捨五入，站與站之間用已記住的交通分鐘。 */
    function shownTimeline(items, startMinutes, blocks, watch) {
        const arrivals = [];
        let cursor = jumpClock(startMinutes, blocks);
        const first = items[0];
        let lead = 0;
        if (first && departOrigin && PlannerFormat.isMappableLocation(first.location)) {
            if (PlannerFormat.straightKm(departOrigin, first.location) >= 0.08) {
                const hop = hopMinutes(departOrigin, first.location);
                if (Number.isFinite(hop) && hop > 0)
                    lead = Math.round(hop);
            }
        }
        if (items.length > 0 && lead > 0)
            cursor += lead;
        let lunchJumped = false;
        let lunchEntered = cursor;
        for (let index = 0; index < items.length; index += 1) {
            const item = items[index];
            const entered = cursor;
            const arrived = jumpClock(cursor, blocks);
            arrivals.push(arrived);
            if (watch && item === watch && arrived !== entered) {
                lunchJumped = true;
                lunchEntered = entered;
            }
            cursor = arrived;
            if (!item)
                continue;
            cursor += positiveStay(item);
            cursor += positiveBreak(item);
            const next = items[index + 1];
            if (next)
                cursor += previewMinutes(item, next);
        }
        return {
            arrivals: arrivals,
            end: jumpClock(cursor, blocks),
            lunchJumped: lunchJumped,
            lunchEntered: lunchEntered
        };
    }
    function blockContaining(minute, blocks) {
        for (let index = 0; index < blocks.length; index += 1) {
            const block = blocks[index];
            if (!block)
                continue;
            if (minute >= block.startMinutes && minute < block.endMinutes)
                return block;
        }
        return null;
    }
    function overlappingBlock(start, end, blocks) {
        for (let index = 0; index < blocks.length; index += 1) {
            const block = blocks[index];
            if (!block)
                continue;
            if (start < block.endMinutes && end > block.startMinutes)
                return block;
        }
        return null;
    }
    function longBoundary(sequence) {
        const limit = PlannerSchedule.longLegMinutes();
        for (let index = 0; index < sequence.length - 1; index += 1) {
            const item = sequence[index];
            const next = sequence[index + 1];
            if (!item || !next)
                continue;
            if (previewMinutes(item, next) > limit)
                return index + 1;
        }
        return -1;
    }
    function takeLunchSnap(sequence) {
        const order = [];
        const durations = [];
        const breaks = [];
        for (let index = 0; index < sequence.length; index += 1) {
            const item = sequence[index];
            if (!item)
                continue;
            order.push(item);
            durations.push(item.durationMinutes);
            breaks.push(positiveBreak(item));
        }
        return { order: order, durations: durations, breaks: breaks };
    }
    function restoreLunchSnap(sequence, snap) {
        for (let index = 0; index < snap.order.length; index += 1) {
            const item = snap.order[index];
            if (!item)
                continue;
            item.durationMinutes = snap.durations[index] || 0;
            item.breakMinutes = snap.breaks[index] || 0;
        }
        sequence.length = 0;
        for (let index = 0; index < snap.order.length; index += 1) {
            const item = snap.order[index];
            if (item)
                sequence.push(item);
        }
    }
    /** 兩間以上餐廳時，較早抵達的是午餐。只有一間且靠近午餐時段才算午餐。 */
    function findLunchItem(sequence, startMinutes, blocks) {
        const found = [];
        for (let index = 0; index < sequence.length; index += 1) {
            const item = sequence[index];
            if (item && item.type === "restaurant")
                found.push(item);
        }
        if (found.length === 0)
            return null;
        const shown = shownTimeline(sequence, startMinutes, blocks, null);
        if (found.length >= 2) {
            let best = found[0];
            let bestAt = Number.POSITIVE_INFINITY;
            for (let index = 0; index < found.length; index += 1) {
                const item = found[index];
                if (!item || !best)
                    continue;
                const at = sequence.indexOf(item);
                const minute = at >= 0 ? shown.arrivals[at] : undefined;
                const arrival = typeof minute === "number" ? minute : Number.POSITIVE_INFINITY;
                if (arrival < bestAt) {
                    bestAt = arrival;
                    best = item;
                }
            }
            return best || null;
        }
        const only = found[0];
        if (!only)
            return null;
        const at = sequence.indexOf(only);
        const minute = at >= 0 ? shown.arrivals[at] : startMinutes;
        if (nearerSlot(typeof minute === "number" ? minute : startMinutes) !== "lunch")
            return null;
        return only;
    }
    function lunchProblem(sequence, lunchItem, startMinutes, blocks, endMinutes) {
        const meal = mealWindow("lunch");
        const none = { problem: "", block: null };
        if (!meal)
            return none;
        const index = sequence.indexOf(lunchItem);
        if (index < 0)
            return none;
        const shown = shownTimeline(sequence, startMinutes, blocks, lunchItem);
        const seen = shown.arrivals[index];
        if (typeof seen !== "number")
            return none;
        const clock = PlannerFormat.clockMinutes(seen);
        const occupied = seen + positiveStay(lunchItem) + positiveBreak(lunchItem);
        let hit = overlappingBlock(seen, occupied, blocks);
        if (shown.lunchJumped) {
            const entered = blockContaining(shown.lunchEntered, blocks);
            if (entered)
                hit = entered;
        }
        if (endMinutes !== null && (seen > endMinutes || shown.end > endMinutes)) {
            return { problem: "deadline", block: hit };
        }
        if (shown.lunchJumped || hit)
            return { problem: "block", block: hit };
        if (clock < meal.start)
            return { problem: "early", block: null };
        if (clock > meal.end)
            return { problem: "late", block: null };
        return none;
    }
    /**
     * 換飯店日只把長程移動前、靠近前一晚住宿的景點挪到午餐前。
     * 不把今晚那座城市的站拉回來。
     */
    function pullMorningBeforeLunch(sequence, lunchItem, morning, evening, transfer) {
        if (!transfer || !morning || !evening)
            return;
        const lunchIndex = sequence.indexOf(lunchItem);
        if (lunchIndex < 0)
            return;
        const boundary = longBoundary(sequence);
        if (boundary >= 0 && lunchIndex >= boundary)
            return;
        const last = boundary >= 0 ? boundary : sequence.length;
        const moving = [];
        for (let index = lunchIndex + 1; index < last; index += 1) {
            const item = sequence[index];
            if (!item || item.type === "restaurant")
                continue;
            if (itemSide(item, morning, evening) !== "morning")
                continue;
            moving.push(item);
        }
        if (moving.length === 0)
            return;
        for (let index = 0; index < moving.length; index += 1) {
            const item = moving[index];
            if (!item)
                continue;
            const at = sequence.indexOf(item);
            if (at >= 0)
                sequence.splice(at, 1);
        }
        const insertAt = sequence.indexOf(lunchItem);
        if (insertAt < 0)
            return;
        for (let index = 0; index < moving.length; index += 1) {
            const item = moving[index];
            if (item)
                sequence.splice(insertAt + index, 0, item);
        }
    }
    /** 要延後午餐時，只加長午餐前、且在長程移動前的景點。越靠近餐廳的先加。 */
    function lunchExtendIndexes(sequence, lunchItem, morning, evening, transfer) {
        const lunchIndex = sequence.indexOf(lunchItem);
        if (lunchIndex < 0)
            return [];
        const boundary = longBoundary(sequence);
        const limit = boundary >= 0 && lunchIndex >= boundary ? boundary : lunchIndex;
        const indexes = [];
        for (let cursor = limit - 1; cursor >= 0; cursor -= 1) {
            const item = sequence[cursor];
            if (!item || item.type === "restaurant")
                break;
            if (transfer && morning && evening && itemSide(item, morning, evening) !== "morning")
                continue;
            indexes.push(cursor);
        }
        return indexes;
    }
    function stayNames(sequence, indexes) {
        const names = [];
        const ordered = indexes.slice().sort(function (left, right) { return left - right; });
        for (let index = 0; index < ordered.length; index += 1) {
            const at = ordered[index];
            const item = at === undefined ? undefined : sequence[at];
            if (item && names.length < 2)
                names.push(item.name);
        }
        if (names.length === 0)
            return "午餐前的景點";
        return names.join("、");
    }
    function blockText(block) {
        if (!block)
            return "移動時段";
        if (block.endMinutes >= 24 * 60)
            return PlannerFormat.formatMinuteClock(block.startMinutes) + " 出發";
        return PlannerFormat.formatMinuteClock(block.startMinutes) + "–" + PlannerFormat.formatMinuteClock(block.endMinutes);
    }
    function lunchFailureText(problem, sequence, indexes, block, endMinutes) {
        if (problem === "late")
            return "無法把午餐調進 11:30–13:30：午餐已晚於 13:30，加長前面景點的停留只會更晚。";
        if (problem === "block") {
            return "無法把午餐調到 11:30：再延後會碰到 " + blockText(block) + " 的交通，無法在 11:30–13:30 用餐後再出發。";
        }
        if (problem === "deadline") {
            const when = endMinutes !== null ? PlannerFormat.formatMinuteClock(Math.max(0, endMinutes)) : "";
            return "無法把午餐調到 11:30：再延後會超過" + (when === "" ? "" : " " + when + " 前") + "要結束的時間。";
        }
        if (indexes.length === 0)
            return "無法把午餐調到 11:30：午餐前沒有可再停留的景點。";
        return "無法把午餐調到 11:30：" + stayNames(sequence, indexes) + "最多再停留 " +
            String(PlannerSchedule.maxExtendMinutes()) + " 分鐘，抵達仍早於 11:30。";
    }
    function extendRoomTotal(sequence, indexes) {
        let room = 0;
        for (let index = 0; index < indexes.length; index += 1) {
            const at = indexes[index];
            const item = at === undefined ? undefined : sequence[at];
            if (!item)
                continue;
            room += extendRoom(item);
        }
        return room;
    }
    function addStayBeforeLunch(sequence, indexes, amount) {
        let left = amount;
        for (let index = 0; index < indexes.length && left > 0; index += 1) {
            const at = indexes[index];
            const item = at === undefined ? undefined : sequence[at];
            if (!item)
                continue;
            rememberStayBase(item);
            const room = extendRoom(item);
            const add = Math.min(room, left);
            if (add <= 0)
                continue;
            item.durationMinutes += add;
            left -= add;
        }
        return amount - left;
    }
    /**
     * 午餐抵達必須落在 11:30–13:30（不是提前 15 分鐘的寬限）。
     * 先把同一側、長程移動前的景點挪到午餐前，仍太早才加長停留，每站最多 90 分鐘。
     * 會撞上固定交通或當天截止就不採用，並留下原因。
     */
    function fitLunchClock(sequence, startMinutes, blocks, endMinutes, morning, evening, transfer) {
        const meal = mealWindow("lunch");
        if (!meal || sequence.length === 0 || startMinutes > meal.end)
            return;
        const lunchItem = findLunchItem(sequence, startMinutes, blocks);
        if (!lunchItem)
            return;
        const snap = takeLunchSnap(sequence);
        const original = lunchProblem(sequence, lunchItem, startMinutes, blocks, endMinutes);
        if (original.problem === "")
            return;
        if (original.problem !== "early") {
            mealFitNote = lunchFailureText(original.problem, sequence, [], original.block, endMinutes);
            return;
        }
        pullMorningBeforeLunch(sequence, lunchItem, morning, evening, transfer);
        let current = lunchProblem(sequence, lunchItem, startMinutes, blocks, endMinutes);
        if (current.problem === "late" || current.problem === "block" || current.problem === "deadline") {
            restoreLunchSnap(sequence, snap);
            current = lunchProblem(sequence, lunchItem, startMinutes, blocks, endMinutes);
        }
        if (current.problem === "")
            return;
        const clock = PlannerFormat.clockMinutes(shownLunchMinute(sequence, lunchItem, startMinutes, blocks));
        const deficit = meal.start - clock;
        const indexes = lunchExtendIndexes(sequence, lunchItem, morning, evening, transfer);
        if (deficit <= 0 || extendRoomTotal(sequence, indexes) < deficit) {
            const problem = deficit <= 0 ? current.problem : "early";
            mealFitNote = lunchFailureText(problem, sequence, indexes, current.block, endMinutes);
            restoreLunchSnap(sequence, snap);
            return;
        }
        addStayBeforeLunch(sequence, indexes, deficit);
        current = lunchProblem(sequence, lunchItem, startMinutes, blocks, endMinutes);
        if (current.problem === "")
            return;
        mealFitNote = lunchFailureText(current.problem, sequence, indexes, current.block, endMinutes);
        restoreLunchSnap(sequence, snap);
    }
    function shownLunchMinute(sequence, lunchItem, startMinutes, blocks) {
        const shown = shownTimeline(sequence, startMinutes, blocks, lunchItem);
        const index = sequence.indexOf(lunchItem);
        const minute = index >= 0 ? shown.arrivals[index] : startMinutes;
        return typeof minute === "number" ? minute : startMinutes;
    }
    function settleMeals(sequence, opening, morning, evening) {
        const transfer = morning !== null && evening !== null &&
            PlannerSchedule.separateStay(PlannerFormat.straightKm(morning, evening) * 1000);
        fitLunchClock(sequence, opening.startMinutes, opening.blocks, opening.endMinutes, morning, evening, transfer);
        fitDinnerClock(sequence, opening.startMinutes, opening.blocks);
        return sequence;
    }
    /** 晚餐早於 17:30 時，前面每一站最多拉長到原停留加 60 分鐘，且不超過已知收攤時間。剩下的空檔不塞進景點。 */
    function fitDinnerClock(sequence, startMinutes, blocks) {
        const index = dinnerStopIndex(sequence, startMinutes, blocks);
        if (index < 0)
            return;
        const dinner = mealWindow("dinner");
        if (!dinner)
            return;
        const before = stopsBeforeDinner(sequence, index);
        for (let step = 0; step < before.length; step += 1) {
            const at = before[step];
            const item = at === undefined ? undefined : sequence[at];
            if (!item)
                continue;
            rememberStayBase(item);
            item.breakMinutes = 0;
        }
        peelDinnerOverstretch(sequence, index, startMinutes, blocks);
        const arrivals = previewArrivals(sequence, startMinutes, blocks);
        const clock = PlannerFormat.clockMinutes(arrivals[index] || startMinutes);
        const delta = dinner.start - clock;
        if (delta > 1) {
            let left = delta;
            for (let step = 0; step < before.length && left > 0; step += 1) {
                const at = before[step];
                const item = at === undefined ? undefined : sequence[at];
                if (at === undefined || !item)
                    continue;
                const nextArrivals = previewArrivals(sequence, startMinutes, blocks);
                const arrival = nextArrivals[at];
                const room = Math.max(0, PlannerSchedule.dinnerStayCap(item, typeof arrival === "number" ? arrival : startMinutes) - item.durationMinutes);
                const add = Math.min(room, left);
                if (add <= 0)
                    continue;
                item.durationMinutes += add;
                left -= add;
            }
            if (left > 1) {
                const host = sequence[index - 1];
                if (host)
                    host.breakMinutes = left;
            }
            return;
        }
        if (delta < -1) {
            let left = -delta;
            const host = sequence[index - 1];
            if (host && typeof host.breakMinutes === "number" && host.breakMinutes > 0) {
                const cut = Math.min(host.breakMinutes, left);
                host.breakMinutes -= cut;
                left -= cut;
                if (host.breakMinutes <= 0)
                    host.breakMinutes = 0;
            }
            if (left > 0)
                shrinkBeforeDinner(sequence, index, left);
            for (let step = 0; step < before.length; step += 1) {
                const at = before[step];
                const item = at === undefined ? undefined : sequence[at];
                if (!item)
                    continue;
                if (typeof item.baseDurationMinutes !== "number" || item.baseDurationMinutes > item.durationMinutes) {
                    item.baseDurationMinutes = item.durationMinutes;
                }
            }
        }
    }
    function pointOf(item) {
        if (!PlannerFormat.isMappableLocation(item.location))
            return null;
        return { lat: item.location.lat, lng: item.location.lng };
    }
    function pointsKm(items, start, end) {
        let total = 0;
        let previous = start;
        for (let index = 0; index < items.length; index += 1) {
            const item = items[index];
            if (!item)
                continue;
            const point = pointOf(item);
            if (!point)
                continue;
            if (previous)
                total += PlannerFormat.straightKm(previous, point);
            previous = point;
        }
        if (previous && end)
            total += PlannerFormat.straightKm(previous, end);
        return total;
    }
    function formatRouteKm(km) {
        const rounded = Number.isFinite(km) ? Math.round(km * 10) / 10 : 0;
        return rounded.toFixed(1);
    }
    function sameIdOrder(before, next) {
        if (before.length !== next.length)
            return false;
        for (let index = 0; index < next.length; index += 1) {
            const item = next[index];
            if (!item || item.id !== before[index])
                return false;
        }
        return true;
    }
    function permuteStops(stops, visit) {
        const current = [];
        const used = [];
        for (let index = 0; index < stops.length; index += 1)
            used.push(false);
        const walk = function () {
            if (current.length === stops.length) {
                visit(current);
                return;
            }
            for (let index = 0; index < stops.length; index += 1) {
                if (used[index])
                    continue;
                const item = stops[index];
                if (!item)
                    continue;
                used[index] = true;
                current.push(item);
                walk();
                current.pop();
                used[index] = false;
            }
        };
        walk();
    }
    function reverseSlice(order, from, to) {
        const next = order.slice();
        let left = from;
        let right = to;
        while (left < right) {
            const swap = next[left];
            next[left] = next[right];
            next[right] = swap;
            left += 1;
            right -= 1;
        }
        return next;
    }
    function nearestOrder(stops, origin) {
        if (!origin)
            return stops.slice();
        const remaining = stops.slice();
        const ordered = [];
        let current = origin;
        while (remaining.length > 0) {
            let bestIndex = 0;
            let bestKm = Number.POSITIVE_INFINITY;
            for (let index = 0; index < remaining.length; index += 1) {
                const item = remaining[index];
                const point = item ? pointOf(item) : null;
                if (!point)
                    continue;
                const distance = PlannerFormat.straightKm(current, point);
                if (distance < bestKm) {
                    bestKm = distance;
                    bestIndex = index;
                }
            }
            const picked = remaining.splice(bestIndex, 1)[0];
            if (!picked)
                break;
            ordered.push(picked);
            const point = pointOf(picked);
            if (point)
                current = point;
        }
        return ordered;
    }
    function twoOpt(order, start, end) {
        let route = order.slice();
        let guard = 0;
        let improved = true;
        while (improved && guard < 40) {
            improved = false;
            guard += 1;
            let bestKm = pointsKm(route, start, end);
            let best = null;
            for (let from = 0; from < route.length - 1; from += 1) {
                for (let to = from + 1; to < route.length; to += 1) {
                    const next = reverseSlice(route, from, to);
                    const km = pointsKm(next, start, end);
                    if (km + 0.000001 < bestKm) {
                        bestKm = km;
                        best = next;
                    }
                }
            }
            if (best) {
                route = best;
                improved = true;
            }
        }
        return route;
    }
    function shortestStops(stops, start, end) {
        if (stops.length <= 1)
            return stops.slice();
        if (stops.length > 8) {
            const seeds = [stops.slice(), nearestOrder(stops, start), stops.slice().reverse()];
            let best = stops.slice();
            let bestKm = pointsKm(best, start, end);
            for (let index = 0; index < seeds.length; index += 1) {
                const seed = seeds[index];
                if (!seed)
                    continue;
                const improved = twoOpt(seed, start, end);
                const km = pointsKm(improved, start, end);
                if (km + 0.000001 < bestKm) {
                    bestKm = km;
                    best = improved;
                }
            }
            return best;
        }
        let best = stops.slice();
        let bestKm = Number.POSITIVE_INFINITY;
        permuteStops(stops, function (order) {
            const km = pointsKm(order, start, end);
            if (km + 0.000001 < bestKm) {
                bestKm = km;
                best = order.slice();
            }
        });
        return best;
    }
    function orderPenalty(sequence, original) {
        let penalty = 0;
        for (let index = 0; index < sequence.length; index += 1) {
            const item = sequence[index];
            if (!item)
                continue;
            let at = -1;
            for (let cursor = 0; cursor < original.length; cursor += 1) {
                if (original[cursor] === item) {
                    at = cursor;
                    break;
                }
            }
            if (at !== index)
                penalty += 1;
        }
        return penalty;
    }
    function exactOutside(clock, start, end) {
        const minute = PlannerFormat.clockMinutes(clock);
        if (minute < start)
            return start - minute;
        if (minute > end)
            return minute - end;
        return 0;
    }
    function mealViolation(sequence, lunch, dinner, startMinutes, blocks, endMinutes) {
        const arrivals = previewArrivals(sequence, startMinutes, blocks);
        const lunchWindow = mealWindow("lunch");
        const dinnerWindow = mealWindow("dinner");
        let penalty = 0;
        if (lunch) {
            const index = sequence.indexOf(lunch);
            const arrival = arrivals[index];
            if (!lunchWindow || typeof arrival !== "number" || minuteBlocked(arrival, blocks, endMinutes))
                penalty += 24 * 60;
            else
                penalty += exactOutside(arrival, lunchWindow.start, lunchWindow.end);
        }
        if (dinner) {
            const index = sequence.indexOf(dinner);
            const arrival = arrivals[index];
            if (!dinnerWindow || typeof arrival !== "number" || minuteBlocked(arrival, blocks, endMinutes))
                penalty += 24 * 60;
            else {
                const minute = PlannerFormat.clockMinutes(arrival);
                if (minute > dinnerWindow.end)
                    penalty += minute - dinnerWindow.end;
            }
        }
        return penalty;
    }
    function placeMeals(stops, lunch, dinner, before, between, extras) {
        const sequence = [];
        const cut = Math.max(0, Math.min(before, stops.length));
        for (let index = 0; index < cut; index += 1) {
            const item = stops[index];
            if (item)
                sequence.push(item);
        }
        if (lunch)
            sequence.push(lunch);
        const mid = Math.max(cut, Math.min(cut + between, stops.length));
        for (let index = cut; index < mid; index += 1) {
            const item = stops[index];
            if (item)
                sequence.push(item);
        }
        if (dinner)
            sequence.push(dinner);
        for (let index = mid; index < stops.length; index += 1) {
            const item = stops[index];
            if (item)
                sequence.push(item);
        }
        for (let index = 0; index < extras.length; index += 1) {
            const item = extras[index];
            if (item)
                sequence.push(item);
        }
        return sequence;
    }
    function mealAssignments(restaurants, late) {
        const first = restaurants[0] || null;
        const second = restaurants[1] || null;
        if (!first)
            return [{ lunch: null, dinner: null, extras: [] }];
        if (late === "dinner" || late === "stay") {
            if (!second)
                return [{ lunch: null, dinner: first, extras: [] }];
            return [
                { lunch: null, dinner: first, extras: [second] },
                { lunch: null, dinner: second, extras: [first] }
            ];
        }
        if (!second) {
            return [
                { lunch: first, dinner: null, extras: [] },
                { lunch: null, dinner: first, extras: [] }
            ];
        }
        return [
            { lunch: first, dinner: second, extras: [] },
            { lunch: second, dinner: first, extras: [] }
        ];
    }
    function marketLateMinutes(sequence, startMinutes, blocks, endMinutes) {
        const arrivals = previewArrivals(sequence, startMinutes, blocks);
        let late = 0;
        for (let index = 0; index < sequence.length; index += 1) {
            const item = sequence[index];
            if (!item)
                continue;
            const close = PlannerSchedule.closingMinute(item);
            if (close === null)
                continue;
            const arrival = arrivals[index];
            if (typeof arrival !== "number" || minuteBlocked(arrival, blocks, endMinutes)) {
                late += 24 * 60;
                continue;
            }
            const minute = PlannerFormat.clockMinutes(arrival);
            if (minute >= close)
                late += minute - close + 1;
        }
        return late;
    }
    function betterRoute(next, prev, useViolation) {
        if (!prev)
            return true;
        if (useViolation) {
            if (next.violation + 0.1 < prev.violation)
                return true;
            if (Math.abs(next.violation - prev.violation) > 0.1)
                return false;
        }
        if (next.km + 0.0001 < prev.km)
            return true;
        if (Math.abs(next.km - prev.km) > 0.0001)
            return false;
        return next.penalty < prev.penalty;
    }
    /**
     * 住宿固定當起點和終點。中間景點看整段排列：8 站以內枚舉全部順序，再多就用 2-opt。
     * 午餐必須落在 11:30–13:30，晚餐不得晚於 19:30（提早會在後面拉長到 17:30）。
     * 朝市、晨間市集必須在 12:00 前抵達，和用餐時段同一級。
     * 只在全部時段都排得進的排法裡留直線距離最短的；朝市怎麼排都趕不上就不硬塞。
     */
    function optimizeOpenRoute(source, start, end, window) {
        if (window.late === "stay")
            return source.slice();
        const restaurants = [];
        const stops = [];
        const loose = [];
        for (let index = 0; index < source.length; index += 1) {
            const item = source[index];
            if (!item)
                continue;
            if (item.type === "restaurant")
                restaurants.push(item);
            else if (pointOf(item))
                stops.push(item);
            else
                loose.push(item);
        }
        if (restaurants.length > 2 || window.late === "dinner") {
            const sequence = shortestStops(stops, start, end);
            for (let index = 0; index < loose.length; index += 1) {
                const item = loose[index];
                if (item)
                    sequence.push(item);
            }
            for (let index = 0; index < restaurants.length; index += 1) {
                const restaurant = restaurants[index];
                if (!restaurant)
                    continue;
                const prefer = window.late === "dinner" ? "dinner" : index === 0 ? "lunch" : "dinner";
                insertMeal(sequence, restaurant, window.startMinutes, prefer, start, window.blocks, window.endMinutes);
            }
            return sequence;
        }
        const bodies = [];
        if (stops.length > 8) {
            const seeds = [stops.slice(), nearestOrder(stops, start), stops.slice().reverse()];
            const seen = {};
            for (let index = 0; index < seeds.length; index += 1) {
                const seed = seeds[index];
                if (!seed)
                    continue;
                const improved = twoOpt(seed, start, end);
                const keyed = [];
                for (let stopIndex = 0; stopIndex < improved.length; stopIndex += 1) {
                    const stop = improved[stopIndex];
                    if (stop)
                        keyed.push(stop.id);
                }
                const key = keyed.join("\n");
                if (seen[key])
                    continue;
                seen[key] = true;
                const body = improved.slice();
                for (let looseIndex = 0; looseIndex < loose.length; looseIndex += 1) {
                    const item = loose[looseIndex];
                    if (item)
                        body.push(item);
                }
                bodies.push(body);
            }
        }
        else {
            permuteStops(stops, function (order) {
                const body = order.slice();
                for (let index = 0; index < loose.length; index += 1) {
                    const item = loose[index];
                    if (item)
                        body.push(item);
                }
                bodies.push(body);
            });
        }
        const plans = mealAssignments(restaurants, window.late);
        const picked = { full: null, meals: null, either: null, marketCanOpen: false };
        const consider = function (sequence, lunch, dinner) {
            const meals = mealViolation(sequence, lunch, dinner, window.startMinutes, window.blocks, window.endMinutes);
            const late = marketLateMinutes(sequence, window.startMinutes, window.blocks, window.endMinutes);
            const km = pointsKm(sequence, start, end);
            const penalty = orderPenalty(sequence, source);
            const row = { sequence: sequence, violation: meals, km: km, penalty: penalty };
            if (late === 0)
                picked.marketCanOpen = true;
            if (meals === 0 && late === 0 && betterRoute(row, picked.full, false))
                picked.full = row;
            if (betterRoute(row, picked.meals, true))
                picked.meals = row;
            const either = { sequence: sequence, violation: meals + late, km: km, penalty: penalty };
            if (betterRoute(either, picked.either, true))
                picked.either = either;
        };
        for (let bodyIndex = 0; bodyIndex < bodies.length; bodyIndex += 1) {
            const body = bodies[bodyIndex];
            if (!body)
                continue;
            for (let planIndex = 0; planIndex < plans.length; planIndex += 1) {
                const plan = plans[planIndex];
                if (!plan)
                    continue;
                if (plan.lunch && plan.dinner) {
                    for (let before = 0; before <= body.length; before += 1) {
                        for (let between = 0; between <= body.length - before; between += 1) {
                            consider(placeMeals(body, plan.lunch, plan.dinner, before, between, plan.extras), plan.lunch, plan.dinner);
                        }
                    }
                }
                else if (plan.lunch) {
                    for (let before = 0; before <= body.length; before += 1) {
                        consider(placeMeals(body, plan.lunch, null, before, 0, plan.extras), plan.lunch, null);
                    }
                }
                else if (plan.dinner) {
                    for (let before = 0; before <= body.length; before += 1) {
                        consider(placeMeals(body, null, plan.dinner, 0, before, plan.extras), null, plan.dinner);
                    }
                }
                else {
                    consider(body.slice(), null, null);
                }
            }
        }
        if (picked.full)
            return picked.full.sequence;
        if (!picked.marketCanOpen && picked.meals)
            return picked.meals.sequence;
        if (picked.either)
            return picked.either.sequence;
        return source.slice();
    }
    /**
     * 路線分鐘比排程時的估算少幾分鐘時，晚餐會提早。
     * 只把差額補進已經存在的自由時間，不改順序，也不動沒有這段空檔的天。
     */
    function topUpDinnerGap(plan, day) {
        const opening = PlannerFormat.dayWindow(plan, day.date);
        const dinner = mealWindow("dinner");
        if (!dinner || opening.late === "stay")
            return false;
        const first = day.items[0];
        const origin = morningStayPoint(plan, day.date);
        let lead = 0;
        if (first && origin && PlannerFormat.isMappableLocation(first.location)) {
            const km = PlannerFormat.straightKm(origin, first.location);
            if (km >= 0.08)
                lead = Math.round(hopMinutes(origin, first.location));
        }
        const clock = PlannerFormat.dayClock(day.items, opening.startMinutes, opening.blocks, lead);
        const found = [];
        for (let index = 0; index < day.items.length; index += 1) {
            const item = day.items[index];
            if (item && item.type === "restaurant")
                found.push(index);
        }
        let index = -1;
        if (found.length >= 2) {
            const later = found[found.length - 1];
            index = typeof later === "number" ? later : -1;
        }
        else if (found.length === 1) {
            const only = found[0];
            if (typeof only === "number") {
                const minute = PlannerFormat.clockMinutes(clock.arrivalMinutes[only] || 0);
                if (nearerSlot(minute) !== "lunch")
                    index = only;
            }
        }
        if (index <= 0)
            return false;
        const arrival = clock.arrivalMinutes[index];
        if (typeof arrival !== "number")
            return false;
        const gap = dinner.start - PlannerFormat.clockMinutes(arrival);
        if (gap <= 1 || gap > 20)
            return false;
        const host = day.items[index - 1];
        if (!host || typeof host.breakMinutes !== "number" || host.breakMinutes <= 0)
            return false;
        host.breakMinutes += gap;
        return true;
    }
    /** 只標這一趟最佳化排出的結果。趕不上已知收攤時間就提醒，不改其他天。 */
    function markClosedVisits(plan, day) {
        const opening = PlannerFormat.dayWindow(plan, day.date);
        const first = day.items[0];
        const origin = morningStayPoint(plan, day.date);
        let lead = 0;
        if (first && origin && PlannerFormat.isMappableLocation(first.location)) {
            const km = PlannerFormat.straightKm(origin, first.location);
            if (km >= 0.08)
                lead = Math.round(hopMinutes(origin, first.location));
        }
        const clock = PlannerFormat.dayClock(day.items, opening.startMinutes, opening.blocks, lead);
        for (let index = 0; index < day.items.length; index += 1) {
            const item = day.items[index];
            if (!item)
                continue;
            const close = PlannerSchedule.closingMinute(item);
            const arrival = clock.arrivalMinutes[index];
            const minute = typeof arrival === "number" ? PlannerFormat.clockMinutes(arrival) : 0;
            item.hoursClosed = close !== null && minute >= close;
        }
    }
    function scheduleItems(plan, day, evening, geographic) {
        const source = withoutLodgingStops(plan, day);
        restorePlannedStays(source);
        const base = {};
        for (let index = 0; index < source.length; index += 1) {
            const item = source[index];
            if (item)
                base[item.id] = item.durationMinutes;
        }
        durationBase = base;
        rememberLegMinutes(source);
        departOrigin = morningStayPoint(plan, day.date);
        try {
            mealFitNote = "";
            const morning = morningOrigin(plan, day.date);
            if (geographic) {
                const window = PlannerFormat.dayWindow(plan, day.date);
                const sequence = optimizeOpenRoute(source, departOrigin, evening, window);
                return settleMeals(sequence, window, morning, evening);
            }
            if (morning && evening && PlannerSchedule.separateStay(PlannerFormat.straightKm(morning, evening) * 1000)) {
                const window = PlannerFormat.dayWindow(plan, day.date);
                const sequence = buildTransferSequence(source, morning, evening, geographic, window.startMinutes, window.blocks, window.endMinutes);
                return settleMeals(sequence, window, morning, evening);
            }
            const restaurants = [];
            const mappable = [];
            const unmapped = [];
            const kept = [];
            for (let index = 0; index < source.length; index += 1) {
                const item = source[index];
                if (!item)
                    continue;
                if (item.type === "restaurant") {
                    restaurants.push(item);
                    continue;
                }
                kept.push(item);
                if (PlannerFormat.isMappableLocation(item.location))
                    mappable.push({ item: item, order: index });
                else
                    unmapped.push(item);
            }
            let origin = morning;
            const sequence = [];
            if (!geographic) {
                for (let index = 0; index < kept.length; index += 1) {
                    const item = kept[index];
                    if (item)
                        sequence.push(item);
                }
            }
            else {
                let pinned = null;
                if (!origin && evening && mappable.length > 0) {
                    let farIndex = 0;
                    let farKm = -1;
                    for (let index = 0; index < mappable.length; index += 1) {
                        const pick = mappable[index];
                        if (!pick || !PlannerFormat.isMappableLocation(pick.item.location))
                            continue;
                        const distance = PlannerFormat.straightKm(pick.item.location, evening);
                        if (distance > farKm) {
                            farKm = distance;
                            farIndex = index;
                        }
                    }
                    pinned = mappable[farIndex] || null;
                    if (pinned && PlannerFormat.isMappableLocation(pinned.item.location)) {
                        origin = { lat: pinned.item.location.lat, lng: pinned.item.location.lng };
                    }
                }
                const pool = [];
                for (let index = 0; index < mappable.length; index += 1) {
                    const pick = mappable[index];
                    if (!pick || pick === pinned)
                        continue;
                    pool.push(pick);
                }
                if (pinned)
                    sequence.push(pinned.item);
                if (origin && pool.length > 0) {
                    const nearest = nearestStops(origin, pool);
                    for (let index = 0; index < nearest.length; index += 1) {
                        const item = nearest[index];
                        if (item)
                            sequence.push(item);
                    }
                }
                else {
                    for (let index = 0; index < pool.length; index += 1) {
                        const pick = pool[index];
                        if (pick)
                            sequence.push(pick.item);
                    }
                }
                for (let index = 0; index < unmapped.length; index += 1) {
                    const item = unmapped[index];
                    if (item)
                        sequence.push(item);
                }
                if (evening)
                    moveClosestToEnd(sequence, evening);
            }
            const window = PlannerFormat.dayWindow(plan, day.date);
            if (window.late !== "dinner" && window.late !== "stay" && (restaurants.length === 1 || restaurants.length === 2)) {
                placeDayMeals(sequence, restaurants, window.startMinutes, origin, window.blocks, window.endMinutes);
            }
            else {
                for (let index = 0; index < restaurants.length; index += 1) {
                    const restaurant = restaurants[index];
                    if (!restaurant)
                        continue;
                    let prefer = "either";
                    if (window.late === "dinner" || window.late === "stay")
                        prefer = "dinner";
                    else if (restaurants.length > 1 && index === 0)
                        prefer = "lunch";
                    else if (restaurants.length > 1 && index === 1)
                        prefer = "dinner";
                    insertMeal(sequence, restaurant, window.startMinutes, prefer, origin, window.blocks, window.endMinutes);
                }
            }
            return settleMeals(sequence, window, morning, evening);
        }
        finally {
            durationBase = null;
            legMinuteMap = null;
            departOrigin = null;
        }
    }
    function arrangementChanged(before, next) {
        if (before.length !== next.length)
            return true;
        for (let index = 0; index < next.length; index += 1) {
            const item = next[index];
            const prev = before[index];
            if (!item || !prev || item.id !== prev.id)
                return true;
        }
        for (let index = 0; index < next.length; index += 1) {
            const item = next[index];
            if (!item)
                continue;
            for (let snapIndex = 0; snapIndex < before.length; snapIndex += 1) {
                const snap = before[snapIndex];
                if (!snap || snap.id !== item.id)
                    continue;
                if (snap.duration !== item.durationMinutes)
                    return true;
            }
        }
        return false;
    }
    function restoreDurations(items, before) {
        for (let index = 0; index < items.length; index += 1) {
            const item = items[index];
            if (!item)
                continue;
            for (let snapIndex = 0; snapIndex < before.length; snapIndex += 1) {
                const snap = before[snapIndex];
                if (!snap || snap.id !== item.id)
                    continue;
                item.durationMinutes = snap.duration;
            }
        }
    }
    function commitArranged(plan, day, evening, geographic) {
        const refreshed = refreshDayEstimates(day.items);
        const startPoint = morningStayPoint(plan, day.date);
        const beforeStops = withoutLodgingStops(plan, day);
        const beforeKm = pointsKm(beforeStops, startPoint, evening);
        const beforeIds = [];
        for (let index = 0; index < beforeStops.length; index += 1) {
            const item = beforeStops[index];
            if (item)
                beforeIds.push(item.id);
        }
        const backupDays = cloneDays(plan.days);
        const backupHeld = cloneHeld(plan.unscheduled || []);
        const snapshot = [];
        for (let index = 0; index < day.items.length; index += 1) {
            const item = day.items[index];
            if (item)
                snapshot.push({ id: item.id, duration: item.durationMinutes });
        }
        const captured = captureLegs(plan.days);
        const next = scheduleItems(plan, day, evening, geographic);
        const orderSame = sameIdOrder(beforeIds, next);
        if (geographic) {
            const afterKm = pointsKm(next, startPoint, evening);
            state.routeNote = {
                date: day.date,
                text: orderSame
                    ? "已是最短路線（" + formatRouteKm(afterKm) + " 公里）"
                    : formatRouteKm(beforeKm) + " → " + formatRouteKm(afterKm) + " 公里"
            };
        }
        else if (state.routeNote && state.routeNote.date === day.date) {
            state.routeNote = null;
        }
        if (mealFitNote !== "") {
            state.routeNote = { date: day.date, text: mealFitNote };
        }
        if (!arrangementChanged(snapshot, next)) {
            restoreDurations(day.items, snapshot);
            if (geographic) {
                markClosedVisits(plan, day);
                saveResult();
                render();
                return;
            }
            if (mealFitNote !== "" || refreshed) {
                if (refreshed)
                    saveResult();
                render();
                return;
            }
            return;
        }
        moveUndo = { days: backupDays, activeDay: state.activeDay, unscheduled: backupHeld };
        state.canUndoMove = true;
        day.items = next;
        rewireLegs(plan.days, captured);
        if (geographic)
            markClosedVisits(plan, day);
        closeEditors();
        saveResult();
        render();
    }
    function anchorGeneratedDay(plan, day) {
        if (day.items.length === 0)
            return;
        const opening = PlannerFormat.dayWindow(plan, day.date);
        if (PlannerFormat.dayClosed(opening))
            return;
        refreshDayEstimates(day.items);
        const captured = captureLegs(plan.days);
        const next = scheduleItems(plan, day, tonightPoint(plan, day.date), false);
        day.items = next;
        rewireLegs(plan.days, captured);
    }
    async function optimizeDay() {
        const plan = state.plan;
        const day = activeDayPlan();
        if (!plan || !day || day.items.length < 2 || optimizing)
            return;
        optimizing = true;
        const date = day.date;
        const window = PlannerFormat.dayWindow(plan, date);
        let evening = null;
        if (window.departToward !== "") {
            const hit = await PlannerGeocode.lookup(window.departToward, window.departToward);
            const current = activeDayPlan();
            if (!state.plan || !current || current.date !== date) {
                optimizing = false;
                return;
            }
            evening = hit;
        }
        else {
            evening = tonightPoint(plan, date);
        }
        const currentDay = activeDayPlan();
        const currentPlan = state.plan;
        optimizing = false;
        if (!currentPlan || !currentDay || currentDay.date !== date || currentDay.items.length < 2)
            return;
        commitArranged(currentPlan, currentDay, evening, true);
    }
    function adjustMeals() {
        const plan = state.plan;
        const day = activeDayPlan();
        if (!plan || !day || day.items.length === 0 || optimizing)
            return;
        if (regenFlight > 0 || segmentFlight > 0)
            return;
        releaseStuckProgress();
        releaseStuckRegen();
        commitArranged(plan, day, tonightPoint(plan, day.date), false);
    }
    function readyFromPlan(plan) {
        return {
            destination: plan.destination,
            startDate: plan.startDate,
            endDate: plan.endDate,
            travelers: plan.travelers,
            budget: { amount: plan.budget.amount, currency: plan.budget.currency },
            interests: plan.interests.slice(),
            pace: plan.pace,
            note: plan.note ? plan.note : ""
        };
    }
    async function regenerateDay() {
        const plan = state.plan;
        const day = activeDayPlan();
        if (!plan || !day)
            return;
        if (regenFlight > 0)
            return;
        if (segmentFlight > 0)
            return;
        releaseStuckProgress();
        releaseStuckRegen();
        const offset = PlannerFormat.inclusiveDays(plan.startDate, day.date) - 1;
        if (offset < 0)
            return;
        const token = regenToken + 1;
        regenToken = token;
        const dayIndex = state.activeDay;
        regenFlight += 1;
        state.regen = { day: dayIndex, running: true, error: "" };
        state.error = "";
        try {
            render();
            const result = await postChunk(readyFromPlan(plan), offset, 1, collectAvoidNames(plan, day.date), false, plan.accommodations, plan.transports);
            if (token !== regenToken)
                return;
            const current = state.plan;
            const target = current ? current.days[dayIndex] : undefined;
            const fresh = result.plan ? result.plan.days[0] : undefined;
            if (!result.ok || !result.plan || result.plan.days.length !== 1 || !target || !fresh) {
                state.regen = {
                    day: dayIndex,
                    running: false,
                    error: result.error !== "" ? result.error : "這一天沒有產生出來，請再試一次。"
                };
                render("regen-error");
                return;
            }
            target.items = fresh.items;
            if (state.routeNote && state.routeNote.date === target.date)
                state.routeNote = null;
            if (current)
                anchorGeneratedDay(current, target);
            state.regen = null;
            closeEditors();
            saveResult();
            render("day-tab-" + String(dayIndex));
            scheduleStayGeocode();
        }
        finally {
            regenFlight = Math.max(0, regenFlight - 1);
            if (regenFlight === 0 && state.regen && state.regen.running) {
                if (token === regenToken) {
                    state.regen = {
                        day: dayIndex,
                        running: false,
                        error: "這一天沒有產生出來，請再試一次。"
                    };
                }
                else {
                    state.regen = null;
                }
                render(state.plan ? "trip-title" : undefined);
            }
        }
    }
    function sortableLib() {
        const host = globalThis;
        const candidate = host.Sortable;
        if (!candidate || typeof candidate.create !== "function")
            return null;
        return candidate;
    }
    function pointFromEvent(event) {
        if (!event)
            return null;
        if ("changedTouches" in event) {
            const list = event.changedTouches;
            const touch = list && list.length > 0 ? list[0] : undefined;
            if (touch && Number.isFinite(touch.clientX) && Number.isFinite(touch.clientY)) {
                return { x: touch.clientX, y: touch.clientY };
            }
        }
        if ("clientX" in event && "clientY" in event) {
            const point = event;
            if (!Number.isFinite(point.clientX) || !Number.isFinite(point.clientY))
                return null;
            return { x: point.clientX, y: point.clientY };
        }
        return null;
    }
    function dayFromPoint(x, y) {
        if (!Number.isFinite(x) || !Number.isFinite(y))
            return null;
        const stack = document.elementsFromPoint(x, y);
        for (let index = 0; index < stack.length; index += 1) {
            const el = stack[index];
            if (!(el instanceof Element))
                continue;
            if (el.closest(".sortable-fallback"))
                continue;
            const tab = el.closest("[data-action='select-day']");
            if (!(tab instanceof HTMLElement))
                continue;
            return readIndex(tab);
        }
        return null;
    }
    function clearTabHover() {
        hoverDay = null;
        const tabs = root.querySelectorAll(".is-drop-target");
        for (let index = 0; index < tabs.length; index += 1) {
            const tab = tabs[index];
            if (tab instanceof HTMLElement)
                tab.classList.remove("is-drop-target");
        }
    }
    function markTabHover(index) {
        const tabs = root.querySelectorAll(".day-tabs button.is-drop-target");
        for (let indexTab = 0; indexTab < tabs.length; indexTab += 1) {
            const tab = tabs[indexTab];
            if (tab instanceof HTMLElement)
                tab.classList.remove("is-drop-target");
        }
        hoverDay = index;
        if (index === null)
            return;
        const next = document.getElementById("day-tab-" + String(index));
        if (next)
            next.classList.add("is-drop-target");
    }
    function onSortPointer(event) {
        if (!sorting)
            return;
        const point = pointFromEvent(event);
        if (!point)
            return;
        markTabHover(dayFromPoint(point.x, point.y));
    }
    function unbindSortPointer() {
        document.removeEventListener("pointermove", onSortPointer);
        document.removeEventListener("touchmove", onSortPointer);
    }
    function swallowNextClick() {
        if (swallowClick)
            document.removeEventListener("click", swallowClick, true);
        const swallow = function (event) {
            event.preventDefault();
            event.stopPropagation();
            if (swallowClick === swallow)
                swallowClick = null;
            document.removeEventListener("click", swallow, true);
            window.clearTimeout(swallowTimer);
        };
        swallowClick = swallow;
        document.addEventListener("click", swallow, true);
        window.clearTimeout(swallowTimer);
        swallowTimer = window.setTimeout(function () {
            if (swallowClick !== swallow)
                return;
            swallowClick = null;
            document.removeEventListener("click", swallow, true);
        }, 400);
    }
    function destroySortable() {
        unbindSortPointer();
        sorting = false;
        clearTabHover();
        document.body.classList.remove("is-sorting");
        const current = sortables;
        sortables = [];
        sortSource = "day";
        for (let index = 0; index < current.length; index += 1) {
            const item = current[index];
            if (item)
                item.destroy();
        }
    }
    function finishSort(evt) {
        const point = pointFromEvent(evt.originalEvent);
        const tabDay = point ? dayFromPoint(point.x, point.y) : hoverDay;
        const oldIndex = typeof evt.oldDraggableIndex === "number" ? evt.oldDraggableIndex : typeof evt.oldIndex === "number" ? evt.oldIndex : null;
        const newIndex = typeof evt.newDraggableIndex === "number" ? evt.newDraggableIndex : typeof evt.newIndex === "number" ? evt.newIndex : null;
        const fromHeld = sortSource === "held";
        sorting = false;
        unbindSortPointer();
        clearTabHover();
        document.body.classList.remove("is-sorting");
        swallowNextClick();
        window.setTimeout(function () {
            if (oldIndex === null || !state.plan)
                return;
            if (fromHeld) {
                if (tabDay !== null)
                    moveHeldToDay(oldIndex, tabDay);
                else
                    render();
                return;
            }
            if (tabDay !== null) {
                moveToDayEnd(oldIndex, tabDay);
                return;
            }
            if (newIndex !== null && newIndex !== oldIndex)
                moveWithinDay(oldIndex, newIndex);
        }, 0);
    }
    function mountSortable() {
        const library = sortableLib();
        if (!library)
            return;
        const lists = root.querySelectorAll(".timeline, .held-list");
        for (let index = 0; index < lists.length; index += 1) {
            const list = lists[index];
            if (!(list instanceof HTMLElement) || !list.querySelector(".stop"))
                continue;
            const sourceKind = list.classList.contains("held-list") ? "held" : "day";
            const created = library.create(list, {
                handle: ".drag-handle",
                draggable: ".stop",
                animation: 150,
                delay: 220,
                delayOnTouchOnly: true,
                touchStartThreshold: 8,
                forceFallback: true,
                fallbackOnBody: true,
                fallbackTolerance: 4,
                scroll: true,
                bubbleScroll: true,
                ghostClass: "is-drop-line",
                dragClass: "is-dragging",
                filter: "button:not(.drag-handle), a, input, select, textarea",
                preventOnFilter: true,
                onStart: function () {
                    sortSource = sourceKind;
                    sorting = true;
                    document.body.classList.add("is-sorting");
                    document.addEventListener("pointermove", onSortPointer);
                    document.addEventListener("touchmove", onSortPointer, { passive: true });
                },
                onEnd: function (evt) {
                    finishSort(evt);
                }
            });
            sortables.push(created);
        }
    }
    function deleteItem(index) {
        const day = activeDayPlan();
        if (!day)
            return;
        if (!removeStop(day.items, index))
            return;
        clearMoveUndo();
        closeEditors();
        saveResult();
        render();
    }
    function openAdd() {
        const day = activeDayPlan();
        if (!day)
            return;
        closeEditors();
        state.addOpen = true;
        state.addName = "";
        state.addType = "attraction";
        state.addNote = "";
        state.editItemId = "";
        state.addAfter = Math.max(0, day.items.length - 1);
        render("add-name");
    }
    function cancelAdd() {
        state.addOpen = false;
        state.addName = "";
        state.addNote = "";
        state.editItemId = "";
        state.error = "";
        render();
    }
    function findStop(id) {
        const onDay = findItem(id);
        if (onDay)
            return onDay;
        const held = state.plan && state.plan.unscheduled ? state.plan.unscheduled : [];
        for (let index = 0; index < held.length; index += 1) {
            const item = held[index];
            if (item && item.id === id)
                return item;
        }
        return null;
    }
    function openEdit(id) {
        const item = findStop(id);
        if (!item)
            return;
        closeEditors();
        state.addOpen = true;
        state.editItemId = id;
        state.addName = item.name;
        state.addType = item.type;
        state.addNote = item.description || "";
        render("add-note");
    }
    function confirmAdd() {
        const day = activeDayPlan();
        if (!day)
            return;
        const name = state.addName.trim();
        const note = state.addNote.trim();
        if (name === "") {
            state.error = "請填寫地點名稱。";
            render("form-error");
            return;
        }
        if (name.length > 40) {
            state.error = "地點名稱請不要超過 40 個字。";
            render("form-error");
            return;
        }
        if (note.length > 300) {
            state.error = "說明請留在 300 字以內。";
            render("form-error");
            return;
        }
        if (state.editItemId !== "") {
            const item = findStop(state.editItemId);
            if (!item) {
                state.error = "找不到要修改的這一站。";
                render("form-error");
                return;
            }
            const previous = item.name;
            item.name = name;
            item.type = state.addType;
            item.description = note;
            if (item.location.name === previous)
                item.location.name = name;
        }
        else {
            const created = PlannerMock.makeCustomItem(name, state.addType, anchorForNewStop(day.items));
            created.description = note;
            insertStop(day.items, created, state.addAfter);
        }
        state.addOpen = false;
        state.addName = "";
        state.addNote = "";
        state.editItemId = "";
        state.error = "";
        clearMoveUndo();
        saveResult();
        render();
    }
    function readStayCount(input, max) {
        const raw = input.value.trim();
        if (!/^\d+$/.test(raw))
            return null;
        const value = Number(raw);
        if (value > max)
            return null;
        return value;
    }
    function applyStayEdit(target) {
        const label = target.closest(".stay-edit");
        if (!(label instanceof HTMLElement))
            return;
        const id = target.getAttribute("data-stop-id") || "";
        const item = findStop(id);
        if (!item)
            return;
        const hoursInput = label.querySelector("[data-field='stay-hours']");
        const minutesInput = label.querySelector("[data-field='stay-minutes']");
        if (!(hoursInput instanceof HTMLInputElement) || !(minutesInput instanceof HTMLInputElement))
            return;
        const hours = readStayCount(hoursInput, 24);
        const minutes = readStayCount(minutesInput, 59);
        if (hours === null || minutes === null) {
            render(target.id);
            return;
        }
        const next = Math.min(24 * 60, hours * 60 + minutes);
        const current = Number.isFinite(item.durationMinutes) ? Math.round(item.durationMinutes) : 0;
        if (next === current)
            return;
        item.durationMinutes = next;
        item.baseDurationMinutes = next;
        saveResult();
        render(target.id);
    }
    function closeEditors() {
        state.addOpen = false;
        state.addName = "";
        state.addNote = "";
        state.editItemId = "";
        state.stayOpen = false;
        state.rideOpen = false;
        state.legDraft = null;
        state.error = "";
        state.stayError = "";
        state.rideError = "";
        state.legError = "";
    }
    function readAmount(text, label) {
        const raw = text.trim();
        if (!/^\d+$/.test(raw))
            return { error: label + "請填 0 以上的整數。" };
        const amount = Number(raw);
        if (amount > 100000000)
            return { error: label + "請填 1 億以內的整數。" };
        return { amount: amount };
    }
    function readCoords(latText, lngText) {
        const latRaw = latText.trim();
        const lngRaw = lngText.trim();
        if (latRaw === "" && lngRaw === "")
            return {};
        if (latRaw === "" || lngRaw === "")
            return { error: "請同時填寫緯度和經度，或都留空。" };
        if (!/^-?\d+(\.\d+)?$/.test(latRaw) || !/^-?\d+(\.\d+)?$/.test(lngRaw)) {
            return { error: "緯度和經度請填數字。" };
        }
        const lat = Number(latRaw);
        const lng = Number(lngRaw);
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return { error: "緯度要在 -90 到 90 之間，經度要在 -180 到 180 之間。" };
        }
        return { lat: lat, lng: lng };
    }
    function normalizeDateTime(value) {
        const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(value.trim());
        if (!match || !match[1] || !match[2] || !match[3])
            return null;
        if (PlannerFormat.parseIsoDate(match[1]) === null)
            return null;
        return match[1] + "T" + match[2] + ":" + match[3];
    }
    function insideTrip(plan, isoDate) {
        return isoDate >= plan.startDate && isoDate <= plan.endDate;
    }
    function openStay(date) {
        if (!state.plan)
            return;
        closeEditors();
        const draft = emptyStay();
        draft.currency = state.plan.budget.currency || "TWD";
        const checkIn = date && insideTrip(state.plan, date) ? date : state.plan.startDate;
        draft.checkIn = checkIn;
        const next = PlannerFormat.addDays(checkIn, 1);
        if (next <= state.plan.endDate && next > checkIn)
            draft.checkOut = next;
        state.stayDraft = draft;
        state.stayOpen = true;
        render("stay-name");
    }
    function editStay(id) {
        if (!state.plan)
            return;
        let found = null;
        for (let index = 0; index < state.plan.accommodations.length; index += 1) {
            const stay = state.plan.accommodations[index];
            if (stay && stay.id === id)
                found = stay;
        }
        if (!found)
            return;
        closeEditors();
        const draft = emptyStay();
        draft.id = found.id;
        draft.name = found.name;
        draft.checkIn = found.checkIn;
        draft.checkOut = found.checkOut;
        draft.price = String(found.pricePerNight.amount);
        draft.currency = found.pricePerNight.currency;
        draft.rooms = String(found.rooms);
        draft.bookingUrl = found.bookingUrl || "";
        draft.note = found.note || "";
        draft.lat = typeof found.location.lat === "number" ? String(found.location.lat) : "";
        draft.lng = typeof found.location.lng === "number" ? String(found.location.lng) : "";
        state.stayDraft = draft;
        state.stayOpen = true;
        render("stay-name");
    }
    function formOpen() {
        return state.addOpen || state.stayOpen || state.rideOpen || state.legDraft !== null;
    }
    function applyPastedCoords(text) {
        const parsed = PlannerFormat.parsePastedCoords(text);
        if (!parsed)
            return false;
        state.stayDraft.lat = String(parsed.lat);
        state.stayDraft.lng = String(parsed.lng);
        const latInput = document.getElementById("stay-lat");
        const lngInput = document.getElementById("stay-lng");
        const pasteInput = document.getElementById("stay-paste");
        if (latInput instanceof HTMLInputElement)
            latInput.value = state.stayDraft.lat;
        if (lngInput instanceof HTMLInputElement)
            lngInput.value = state.stayDraft.lng;
        if (pasteInput instanceof HTMLInputElement)
            pasteInput.value = "";
        return true;
    }
    function scheduleStayGeocode() {
        const plan = state.plan;
        if (!plan || state.step !== 4)
            return;
        geocodeToken += 1;
        const token = geocodeToken;
        const city = plan.destination.trim();
        if (city === "")
            return;
        const jobs = [];
        for (let index = 0; index < plan.accommodations.length; index += 1) {
            const stay = plan.accommodations[index];
            if (!stay || stay.name.trim() === "")
                continue;
            if (PlannerFormat.isMappableLocation(stay.location))
                continue;
            if (state.stayOpen && state.stayDraft.id === stay.id)
                continue;
            jobs.push({ id: stay.id, name: stay.name });
        }
        if (jobs.length === 0)
            return;
        let left = jobs.length;
        let changed = false;
        for (let index = 0; index < jobs.length; index += 1) {
            const job = jobs[index];
            if (!job)
                continue;
            void PlannerGeocode.lookup(job.name, city).then(function (hit) {
                if (token !== geocodeToken || !state.plan)
                    return;
                if (hit) {
                    for (let stayIndex = 0; stayIndex < state.plan.accommodations.length; stayIndex += 1) {
                        const stay = state.plan.accommodations[stayIndex];
                        if (!stay || stay.id !== job.id || stay.name !== job.name)
                            continue;
                        if (PlannerFormat.isMappableLocation(stay.location))
                            continue;
                        if (state.stayOpen && state.stayDraft.id === stay.id)
                            continue;
                        stay.location.lat = hit.lat;
                        stay.location.lng = hit.lng;
                        changed = true;
                    }
                }
                left -= 1;
                if (left > 0 || token !== geocodeToken || !changed || !state.plan)
                    return;
                saveResult();
                if (sorting || formOpen())
                    return;
                render();
            });
        }
    }
    function confirmStay() {
        syncAll();
        const plan = state.plan;
        if (!plan)
            return;
        const pasted = fieldValue("stay-paste");
        if (pasted !== null && pasted.trim() !== "") {
            if (!applyPastedCoords(pasted)) {
                state.stayError = "座標無法辨識。請貼上「緯度, 經度」，或含有座標的 Google 地圖網址。";
                render("stay-error");
                return;
            }
        }
        const draft = state.stayDraft;
        const name = draft.name.trim();
        if (name === "") {
            state.stayError = "請填寫住宿名稱。";
            render("stay-error");
            return;
        }
        if (name.length > 40) {
            state.stayError = "住宿名稱請不要超過 40 個字。";
            render("stay-error");
            return;
        }
        if (PlannerFormat.parseIsoDate(draft.checkIn) === null || PlannerFormat.parseIsoDate(draft.checkOut) === null) {
            state.stayError = "請填寫入住日和退房日。";
            render("stay-error");
            return;
        }
        if (!insideTrip(plan, draft.checkIn) || !insideTrip(plan, draft.checkOut)) {
            state.stayError = "入住日和退房日都要在行程日期內。";
            render("stay-error");
            return;
        }
        if (!(draft.checkOut > draft.checkIn)) {
            state.stayError = "退房日要晚於入住日。";
            render("stay-error");
            return;
        }
        const price = readAmount(draft.price, "每晚價格");
        if ("error" in price) {
            state.stayError = price.error;
            render("stay-error");
            return;
        }
        if (!PlannerFormat.isCurrencyCode(draft.currency)) {
            state.stayError = "請選擇幣別。";
            render("stay-error");
            return;
        }
        const roomsText = draft.rooms.trim();
        if (!/^\d+$/.test(roomsText)) {
            state.stayError = "房間數請填 1 到 20 的整數。";
            render("stay-error");
            return;
        }
        const rooms = Number(roomsText);
        if (rooms < 1 || rooms > 20) {
            state.stayError = "房間數請填 1 到 20 的整數。";
            render("stay-error");
            return;
        }
        const coords = readCoords(draft.lat, draft.lng);
        if ("error" in coords) {
            state.stayError = coords.error;
            render("stay-error");
            return;
        }
        const url = draft.bookingUrl.trim();
        if (url !== "" && !/^https?:\/\/\S+$/i.test(url)) {
            state.stayError = "訂房連結請以 http:// 或 https:// 開頭。";
            render("stay-error");
            return;
        }
        const note = draft.note.trim();
        if (note.length > 300) {
            state.stayError = "備註請留在 300 字以內。";
            render("stay-error");
            return;
        }
        const location = { name: name };
        if (typeof coords.lat === "number" && typeof coords.lng === "number") {
            location.lat = coords.lat;
            location.lng = coords.lng;
        }
        const stay = {
            id: draft.id !== "" ? draft.id : PlannerFormat.createId(),
            name: name,
            location: location,
            checkIn: draft.checkIn,
            checkOut: draft.checkOut,
            pricePerNight: { amount: price.amount, currency: draft.currency },
            rooms: rooms
        };
        if (url !== "")
            stay.bookingUrl = url;
        if (note !== "")
            stay.note = note;
        let replaced = false;
        for (let index = 0; index < plan.accommodations.length; index += 1) {
            const current = plan.accommodations[index];
            if (current && current.id === stay.id) {
                plan.accommodations[index] = stay;
                replaced = true;
            }
        }
        if (!replaced)
            plan.accommodations.push(stay);
        state.stayOpen = false;
        state.stayError = "";
        state.stayDraft = emptyStay();
        clearMoveUndo();
        parkClosedDays();
        saveResult();
        render();
        scheduleStayGeocode();
    }
    function deleteStay(id) {
        if (!state.plan)
            return;
        state.plan.accommodations = state.plan.accommodations.filter(function (stay) {
            return stay.id !== id;
        });
        closeEditors();
        clearMoveUndo();
        parkClosedDays();
        saveResult();
        render();
    }
    function openRide() {
        if (!state.plan)
            return;
        closeEditors();
        const draft = emptyRide();
        draft.currency = state.plan.budget.currency || "TWD";
        draft.departAt = state.plan.startDate + "T08:00";
        state.rideDraft = draft;
        state.rideOpen = true;
        render("ride-from");
    }
    function editRide(id) {
        if (!state.plan)
            return;
        let found = null;
        for (let index = 0; index < state.plan.transports.length; index += 1) {
            const ride = state.plan.transports[index];
            if (ride && ride.id === id)
                found = ride;
        }
        if (!found)
            return;
        closeEditors();
        const draft = emptyRide();
        draft.id = found.id;
        draft.mode = found.mode;
        draft.from = found.from;
        draft.to = found.to;
        draft.departAt = found.departAt;
        draft.arriveAt = found.arriveAt || "";
        draft.price = String(found.cost.amount);
        draft.currency = found.cost.currency;
        draft.bookingRef = found.bookingRef || "";
        draft.note = found.note || "";
        state.rideDraft = draft;
        state.rideOpen = true;
        render("ride-from");
    }
    function confirmRide() {
        const plan = state.plan;
        if (!plan)
            return;
        const draft = state.rideDraft;
        if (!isIntercityMode(draft.mode)) {
            state.rideError = "請選擇交通方式。";
            render("ride-error");
            return;
        }
        const from = draft.from.trim();
        const to = draft.to.trim();
        if (from === "" || to === "") {
            state.rideError = "請填寫出發地和抵達地。";
            render("ride-error");
            return;
        }
        if (from.length > 40 || to.length > 40) {
            state.rideError = "出發地和抵達地請不要超過 40 個字。";
            render("ride-error");
            return;
        }
        const departAt = normalizeDateTime(draft.departAt);
        if (!departAt) {
            state.rideError = "請填寫出發時間。";
            render("ride-error");
            return;
        }
        const departDate = PlannerFormat.datePart(departAt);
        if (!insideTrip(plan, departDate)) {
            state.rideError = "出發日期要在行程日期內。";
            render("ride-error");
            return;
        }
        let arriveAt = "";
        if (draft.arriveAt.trim() !== "") {
            const parsed = normalizeDateTime(draft.arriveAt);
            if (!parsed) {
                state.rideError = "抵達時間的格式不正確。";
                render("ride-error");
                return;
            }
            if (parsed < departAt) {
                state.rideError = "抵達時間要晚於出發時間。";
                render("ride-error");
                return;
            }
            arriveAt = parsed;
        }
        const price = readAmount(draft.price, "費用");
        if ("error" in price) {
            state.rideError = price.error;
            render("ride-error");
            return;
        }
        if (!PlannerFormat.isCurrencyCode(draft.currency)) {
            state.rideError = "請選擇幣別。";
            render("ride-error");
            return;
        }
        const bookingRef = draft.bookingRef.trim();
        if (bookingRef.length > 40) {
            state.rideError = "訂位代號請不要超過 40 個字。";
            render("ride-error");
            return;
        }
        const note = draft.note.trim();
        if (note.length > 300) {
            state.rideError = "備註請留在 300 字以內。";
            render("ride-error");
            return;
        }
        const ride = {
            id: draft.id !== "" ? draft.id : PlannerFormat.createId(),
            mode: draft.mode,
            from: from,
            to: to,
            departAt: departAt,
            cost: { amount: price.amount, currency: draft.currency }
        };
        if (arriveAt !== "")
            ride.arriveAt = arriveAt;
        if (bookingRef !== "")
            ride.bookingRef = bookingRef;
        if (note !== "")
            ride.note = note;
        let replaced = false;
        for (let index = 0; index < plan.transports.length; index += 1) {
            const current = plan.transports[index];
            if (current && current.id === ride.id) {
                plan.transports[index] = ride;
                replaced = true;
            }
        }
        if (!replaced)
            plan.transports.push(ride);
        plan.transports.sort(function (a, b) {
            if (a.departAt < b.departAt)
                return -1;
            if (a.departAt > b.departAt)
                return 1;
            return 0;
        });
        state.rideOpen = false;
        state.rideError = "";
        state.rideDraft = emptyRide();
        clearMoveUndo();
        parkClosedDays();
        saveResult();
        render();
    }
    function deleteRide(id) {
        if (!state.plan)
            return;
        state.plan.transports = state.plan.transports.filter(function (ride) {
            return ride.id !== id;
        });
        closeEditors();
        clearMoveUndo();
        parkClosedDays();
        saveResult();
        render();
    }
    function findItem(id) {
        if (!state.plan)
            return null;
        for (let dayIndex = 0; dayIndex < state.plan.days.length; dayIndex += 1) {
            const day = state.plan.days[dayIndex];
            if (!day)
                continue;
            for (let itemIndex = 0; itemIndex < day.items.length; itemIndex += 1) {
                const item = day.items[itemIndex];
                if (item && item.id === id)
                    return item;
            }
        }
        return null;
    }
    function openLeg(index) {
        const day = activeDayPlan();
        if (!day || !state.plan)
            return;
        const item = day.items[index];
        if (!item || !item.transportToNext)
            return;
        const leg = item.transportToNext;
        closeEditors();
        state.legDraft = {
            itemId: item.id,
            mode: leg.mode,
            originMode: leg.mode,
            minutes: String(leg.minutes),
            price: leg.cost ? String(leg.cost.amount) : "",
            currency: leg.cost ? leg.cost.currency : state.plan.budget.currency
        };
        if (typeof leg.distanceMeters === "number")
            state.legDraft.distanceMeters = leg.distanceMeters;
        if (leg.routeSource)
            state.legDraft.routeSource = leg.routeSource;
        render("leg-mode");
    }
    function legEndpoints(itemId) {
        if (!state.plan)
            return null;
        for (let dayIndex = 0; dayIndex < state.plan.days.length; dayIndex += 1) {
            const day = state.plan.days[dayIndex];
            if (!day)
                continue;
            for (let index = 0; index < day.items.length - 1; index += 1) {
                const item = day.items[index];
                const next = day.items[index + 1];
                if (!item || item.id !== itemId || !next)
                    continue;
                if (!PlannerFormat.isMappableLocation(item.location) || !PlannerFormat.isMappableLocation(next.location))
                    return null;
                return { from: item.location, to: next.location };
            }
        }
        return null;
    }
    function startLegLookup(bypass) {
        const draft = state.legDraft;
        if (!draft)
            return;
        const mode = draft.mode;
        const itemId = draft.itemId;
        const located = legEndpoints(itemId);
        const token = legLookupToken + 1;
        legLookupToken = token;
        delete draft.distanceMeters;
        delete draft.routeSource;
        delete draft.lookedUpMode;
        if (!located) {
            legRoutePending = false;
            legLookup = Promise.resolve();
            state.legError = "這段沒有座標，無法計算路線。";
            render("leg-error");
            return;
        }
        state.legError = "";
        legRoutePending = true;
        legLookup = PlannerRoutes.lookup(located.from, located.to, mode, bypass).then(function (shape) {
            if (token !== legLookupToken || !state.legDraft || state.legDraft.itemId !== itemId || state.legDraft.mode !== mode) {
                legRoutePending = false;
                return;
            }
            legRoutePending = false;
            if (shape.cancelled)
                return;
            state.legDraft.minutes = String(shape.durationMinutes);
            state.legDraft.distanceMeters = shape.distanceMeters;
            state.legDraft.routeSource = sourceOf(mode, shape.network);
            state.legDraft.lookedUpMode = mode;
            const input = document.getElementById("leg-minutes");
            if (input instanceof HTMLInputElement)
                input.value = state.legDraft.minutes;
        });
    }
    function readLegMinutes(text) {
        if (!/^\d+$/.test(text.trim()))
            return null;
        const minutes = Number(text.trim());
        if (minutes < 1 || minutes > 1440)
            return null;
        return minutes;
    }
    function commitOpenLeg() {
        syncAll();
        const draft = state.legDraft;
        if (!draft)
            return;
        const item = findItem(draft.itemId);
        if (!item || !item.transportToNext)
            return;
        if (!isTransportMode(draft.mode)) {
            state.legError = "請選擇交通方式。";
            legSaving = false;
            render("leg-error");
            return;
        }
        const minutes = readLegMinutes(draft.minutes);
        if (minutes === null) {
            state.legError = "交通時間請填 1 到 1440 的整數。";
            legSaving = false;
            render("leg-error");
            return;
        }
        const priceText = draft.price.trim();
        let cost;
        if (priceText !== "") {
            const price = readAmount(priceText, "費用");
            if ("error" in price) {
                state.legError = price.error;
                legSaving = false;
                render("leg-error");
                return;
            }
            if (!PlannerFormat.isCurrencyCode(draft.currency)) {
                state.legError = "請選擇幣別。";
                legSaving = false;
                render("leg-error");
                return;
            }
            cost = { amount: price.amount, currency: draft.currency };
        }
        const previous = item.transportToNext;
        const usedLookup = draft.lookedUpMode === draft.mode;
        const next = { mode: draft.mode, minutes: minutes, manual: true };
        const meters = usedLookup ? draft.distanceMeters : previous.distanceMeters;
        const source = usedLookup ? draft.routeSource : previous.routeSource;
        if (typeof meters === "number")
            next.distanceMeters = meters;
        if (source)
            next.routeSource = source;
        if (cost)
            next.cost = cost;
        item.transportToNext = next;
        state.legDraft = null;
        state.legError = "";
        legLookupToken += 1;
        legRoutePending = false;
        legSaving = false;
        clearMoveUndo();
        saveResult();
        render();
    }
    function confirmLeg() {
        if (legSaving || !state.legDraft)
            return;
        syncAll();
        const draft = state.legDraft;
        if (!draft)
            return;
        const item = findItem(draft.itemId);
        if (!item || !item.transportToNext)
            return;
        if (!isTransportMode(draft.mode)) {
            state.legError = "請選擇交通方式。";
            render("leg-error");
            return;
        }
        const modeChanged = draft.mode !== draft.originMode;
        if (modeChanged && draft.lookedUpMode !== draft.mode && !legRoutePending)
            startLegLookup(false);
        if (!modeChanged && readLegMinutes(draft.minutes) === null) {
            state.legError = "交通時間請填 1 到 1440 的整數。";
            render("leg-error");
            return;
        }
        const priceText = draft.price.trim();
        if (priceText !== "") {
            const price = readAmount(priceText, "費用");
            if ("error" in price) {
                state.legError = price.error;
                render("leg-error");
                return;
            }
            if (!PlannerFormat.isCurrencyCode(draft.currency)) {
                state.legError = "請選擇幣別。";
                render("leg-error");
                return;
            }
        }
        if (modeChanged || legRoutePending) {
            legSaving = true;
            const token = legLookupToken;
            legLookup.then(function () {
                legSaving = false;
                if (token !== legLookupToken || !state.legDraft)
                    return;
                commitOpenLeg();
            });
            return;
        }
        commitOpenLeg();
    }
    function applyRate(code) {
        if (!state.plan || !PlannerFormat.isCurrencyCode(code) || code === state.plan.budget.currency)
            return;
        const raw = fieldValue("rate-" + code);
        if (raw === null)
            return;
        const text = raw.trim();
        if (!/^\d+(\.\d+)?$/.test(text)) {
            state.rateError = "匯率請填大於 0 的數字。";
            render("rate-error");
            return;
        }
        const value = Number(text);
        if (!(value > 0) || value > 1000000) {
            state.rateError = "匯率請填大於 0 的數字。";
            render("rate-error");
            return;
        }
        state.rates[code] = value;
        state.rates[state.plan.budget.currency] = 1;
        state.rateError = "";
        saveResult();
        render("rate-" + code);
    }
    function exportCsv() {
        if (!state.plan)
            return;
        const csv = "\uFEFF" + PlannerBudget.toCsv(state.plan, state.rates);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "行程明細.csv";
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }
    function readIndex(button) {
        const raw = button.getAttribute("data-index");
        if (raw === null || !/^\d+$/.test(raw))
            return null;
        return Number(raw);
    }
    function onClick(event) {
        bootLoading = false;
        const target = event.target;
        if (!(target instanceof Element))
            return;
        if (target.closest("a"))
            return;
        const button = target.closest("[data-action]");
        if (!(button instanceof Element))
            return;
        syncAll();
        const action = button.getAttribute("data-action");
        if (action === "pick-city") {
            const city = button.getAttribute("data-city");
            if (city) {
                state.draft.destination = city;
                state.error = "";
                render("destination");
            }
            return;
        }
        if (action === "next") {
            goNext();
            return;
        }
        if (action === "back" || action === "restart") {
            if (action === "restart")
                restart();
            else
                goBack();
            return;
        }
        if (action === "toggle-interest") {
            const interest = button.getAttribute("data-interest");
            if (!interest)
                return;
            const options = PlannerView.interestOptions();
            const index = options.indexOf(interest);
            if (index === -1)
                return;
            state.draft.interests = PlannerView.nextInterests(state.draft.interests, interest);
            render("interest-" + String(index));
            return;
        }
        if (action === "set-pace") {
            const pace = button.getAttribute("data-pace");
            if (!isPace(pace))
                return;
            state.draft.pace = pace;
            render("pace-" + pace);
            return;
        }
        if (action === "save-passcode") {
            const value = fieldValue("passcode");
            if (value === null || value.trim() === "") {
                state.error = "請先填通行碼。";
                render("passcode");
                return;
            }
            PlannerRemote.savePasscode(value);
            state.error = "";
            render("passcode");
            return;
        }
        if (action === "clear-passcode") {
            PlannerRemote.clearPasscode();
            state.error = "";
            render("passcode");
            return;
        }
        if (action === "generate") {
            generate();
            return;
        }
        if (action === "continue-plan") {
            continuePlan();
            return;
        }
        if (action === "use-mock") {
            useMock();
            return;
        }
        if (action === "edit-preferences") {
            editPreferences();
            return;
        }
        if (action === "select-day") {
            const index = readIndex(button);
            if (index === null)
                return;
            selectDay(index);
            return;
        }
        if (action === "set-map-kind") {
            const kind = button.getAttribute("data-map-kind");
            if (kind !== "street" && kind !== "sketch")
                return;
            if (state.mapKind === kind)
                return;
            state.mapKind = kind;
            render();
            return;
        }
        if (action === "set-sketch-scope") {
            const kind = button.getAttribute("data-sketch-kind");
            if (kind === "overview")
                state.sketchScope = { kind: "overview" };
            else if (kind === "day") {
                const raw = button.getAttribute("data-sketch-day");
                if (raw !== null && /^\d+$/.test(raw)) {
                    const index = Number(raw);
                    if (state.plan && state.plan.days[index]) {
                        state.sketchScope = { kind: "day", index: index };
                        state.activeDay = index;
                    }
                }
            }
            else if (kind === "city") {
                const city = button.getAttribute("data-sketch-city");
                if (city)
                    state.sketchScope = { kind: "city", city: city };
            }
            render();
            return;
        }
        if (action === "download-sketch") {
            downloadSketch();
            return;
        }
        if (action === "undo-move") {
            undoMove();
            return;
        }
        if (action === "optimize-day") {
            void optimizeDay();
            return;
        }
        if (action === "adjust-meals") {
            adjustMeals();
            return;
        }
        if (action === "regenerate-day") {
            void regenerateDay();
            return;
        }
        if (action === "regenerate-all") {
            regenerateAll();
            return;
        }
        if (action === "delete-item") {
            const index = readIndex(button);
            if (index === null)
                return;
            deleteItem(index);
            return;
        }
        if (action === "edit-item") {
            openEdit(button.getAttribute("data-id") || "");
            return;
        }
        if (action === "delete-held") {
            const index = readIndex(button);
            if (index === null)
                return;
            deleteHeld(index);
            return;
        }
        if (action === "focus-stop" || action === "focus-stay") {
            if (target.closest("input, select, textarea, label.stay-edit"))
                return;
            const id = button.getAttribute("data-stop-id");
            if (!id)
                return;
            focusStop(id);
            return;
        }
        if (action === "open-stay") {
            openStay();
            return;
        }
        if (action === "open-stay-night") {
            openStay(button.getAttribute("data-date") || "");
            return;
        }
        if (action === "edit-stay") {
            editStay(button.getAttribute("data-id") || "");
            return;
        }
        if (action === "delete-stay") {
            deleteStay(button.getAttribute("data-id") || "");
            return;
        }
        if (action === "cancel-stay") {
            state.stayOpen = false;
            state.stayError = "";
            state.stayDraft = emptyStay();
            render();
            return;
        }
        if (action === "confirm-stay") {
            confirmStay();
            return;
        }
        if (action === "open-ride") {
            openRide();
            return;
        }
        if (action === "edit-ride") {
            editRide(button.getAttribute("data-id") || "");
            return;
        }
        if (action === "delete-ride") {
            deleteRide(button.getAttribute("data-id") || "");
            return;
        }
        if (action === "cancel-ride") {
            state.rideOpen = false;
            state.rideError = "";
            state.rideDraft = emptyRide();
            render();
            return;
        }
        if (action === "confirm-ride") {
            confirmRide();
            return;
        }
        if (action === "edit-leg") {
            const index = readIndex(button);
            if (index === null)
                return;
            openLeg(index);
            return;
        }
        if (action === "recalc-leg") {
            startLegLookup(true);
            return;
        }
        if (action === "cancel-leg") {
            state.legDraft = null;
            state.legError = "";
            render();
            return;
        }
        if (action === "confirm-leg") {
            confirmLeg();
            return;
        }
        if (action === "export-csv") {
            exportCsv();
            return;
        }
        if (action === "toggle-library") {
            state.libraryOpen = !state.libraryOpen;
            if (!state.libraryOpen) {
                state.pendingDeleteId = "";
                state.renameId = "";
                state.tripError = "";
            }
            render();
            return;
        }
        if (action === "save-trip-as") {
            saveTripAs();
            return;
        }
        if (action === "new-trip") {
            newTrip();
            return;
        }
        if (action === "import-trip") {
            const input = document.getElementById("trip-import");
            if (input instanceof HTMLInputElement)
                input.click();
            return;
        }
        if (action === "open-trip") {
            openTrip(button.getAttribute("data-id") || "");
            return;
        }
        if (action === "rename-trip") {
            beginRename(button.getAttribute("data-id") || "");
            return;
        }
        if (action === "confirm-rename") {
            commitRename();
            return;
        }
        if (action === "cancel-rename") {
            state.renameId = "";
            state.renameDraft = "";
            state.tripError = "";
            render();
            return;
        }
        if (action === "copy-trip") {
            duplicateTrip(button.getAttribute("data-id") || "");
            return;
        }
        if (action === "export-trip") {
            exportTrip(button.getAttribute("data-id") || library.activeId);
            return;
        }
        if (action === "ask-delete-trip") {
            askDelete(button.getAttribute("data-id") || "");
            return;
        }
        if (action === "cancel-delete") {
            state.pendingDeleteId = "";
            render();
            return;
        }
        if (action === "confirm-delete") {
            confirmDelete();
            return;
        }
        if (action === "open-add")
            openAdd();
        else if (action === "cancel-add")
            cancelAdd();
        else if (action === "confirm-add")
            confirmAdd();
    }
    function onInput(event) {
        bootLoading = false;
        const target = event.target;
        if (target instanceof HTMLInputElement && target.id === "trip-import") {
            const file = target.files && target.files[0];
            target.value = "";
            if (file)
                readTripFile(file);
            return;
        }
        syncAll();
        if (target instanceof HTMLInputElement) {
            const stayField = target.getAttribute("data-field");
            if (stayField === "stay-hours" || stayField === "stay-minutes") {
                if (event.type === "input" && event instanceof InputEvent) {
                    const kind = event.inputType;
                    if (kind === "insertText" || kind === "deleteContentBackward" || kind === "deleteContentForward" || kind === "insertCompositionText")
                        return;
                }
                applyStayEdit(target);
                return;
            }
        }
        if (!(target instanceof HTMLElement))
            return;
        const field = target.getAttribute("data-field");
        if (event.type === "change" && field && field.indexOf("rate-") === 0) {
            applyRate(field.slice(5));
            return;
        }
        if (event.type === "change" && field === "leg-mode") {
            startLegLookup(false);
            return;
        }
        if (field === "stay-paste") {
            const pastedNow = fieldValue("stay-paste") || "";
            const fromPaste = event instanceof InputEvent && event.inputType === "insertFromPaste";
            if (fromPaste || event.type === "change")
                applyPastedCoords(pastedNow);
        }
        if (field === "start-date" || field === "end-date")
            refreshDayCount();
        if (field === "destination")
            refreshCityChips();
        if (field === "sketch-title")
            paintSketchTitle();
    }
    function onKeyDown(event) {
        bootLoading = false;
        const target = event.target;
        if (!(target instanceof HTMLElement))
            return;
        const action = target.getAttribute("data-action");
        if ((event.key === "Enter" || event.key === " ") && (action === "focus-stop" || action === "focus-stay")) {
            event.preventDefault();
            const id = target.getAttribute("data-stop-id");
            if (id)
                focusStop(id);
            return;
        }
        if (event.key === "Enter") {
            if (target instanceof HTMLTextAreaElement)
                return;
            if (target instanceof HTMLInputElement) {
                const stayField = target.getAttribute("data-field");
                if (stayField === "stay-hours" || stayField === "stay-minutes") {
                    event.preventDefault();
                    applyStayEdit(target);
                    return;
                }
            }
            if (state.step === 1 && target.getAttribute("data-field") === "destination") {
                event.preventDefault();
                syncAll();
                goNext();
            }
            else if (state.step === 2 && target instanceof HTMLInputElement) {
                event.preventDefault();
                syncAll();
                generate();
            }
            else if (state.addOpen && target.getAttribute("data-field") === "add-name") {
                event.preventDefault();
                syncAll();
                confirmAdd();
            }
            else if (state.stayOpen && target.getAttribute("data-field") === "stay-name") {
                event.preventDefault();
                syncAll();
                confirmStay();
            }
            else if (state.renameId !== "" && target.getAttribute("data-field") === "rename-trip") {
                event.preventDefault();
                syncAll();
                commitRename();
            }
            return;
        }
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft")
            return;
        if (target.getAttribute("role") !== "tab" || !state.plan)
            return;
        event.preventDefault();
        const delta = event.key === "ArrowRight" ? 1 : -1;
        const next = state.activeDay + delta;
        if (next < 0 || next >= state.plan.days.length)
            return;
        selectDay(next);
    }
    function savedRates(value, home) {
        const defaults = PlannerRates.homeRates(home);
        const next = {};
        const source = value && typeof value === "object" ? value : {};
        const choices = PlannerFormat.currencyChoices();
        for (let index = 0; index < choices.length; index += 1) {
            const choice = choices[index];
            if (!choice)
                continue;
            if (choice.code === home) {
                next[choice.code] = 1;
                continue;
            }
            const raw = source[choice.code];
            const fallback = defaults[choice.code];
            if (typeof raw === "number" && Number.isFinite(raw) && raw > 0)
                next[choice.code] = raw;
            else if (typeof fallback === "number")
                next[choice.code] = fallback;
        }
        return next;
    }
    function savedListsOk(plan) {
        for (let index = 0; index < plan.accommodations.length; index += 1) {
            const stay = plan.accommodations[index];
            if (!stay || typeof stay.id !== "string" || typeof stay.name !== "string")
                return false;
            if (typeof stay.checkIn !== "string" || typeof stay.checkOut !== "string")
                return false;
            if (!stay.location || typeof stay.location.name !== "string")
                return false;
            if (!stay.pricePerNight || typeof stay.pricePerNight.amount !== "number")
                return false;
            if (typeof stay.rooms !== "number")
                return false;
        }
        for (let index = 0; index < plan.transports.length; index += 1) {
            const ride = plan.transports[index];
            if (!ride || typeof ride.id !== "string" || typeof ride.from !== "string" || typeof ride.to !== "string")
                return false;
            if (typeof ride.departAt !== "string")
                return false;
            if (!ride.cost || typeof ride.cost.amount !== "number")
                return false;
        }
        return true;
    }
    function readReady(value) {
        if (!value || typeof value !== "object")
            return null;
        const raw = value;
        if (typeof raw.destination !== "string")
            return null;
        const destination = raw.destination.trim();
        if (destination === "" || destination.length > 40)
            return null;
        if (typeof raw.startDate !== "string" || typeof raw.endDate !== "string")
            return null;
        if (PlannerFormat.parseIsoDate(raw.startDate) === null || PlannerFormat.parseIsoDate(raw.endDate) === null)
            return null;
        const total = PlannerFormat.inclusiveDays(raw.startDate, raw.endDate);
        if (total < 1 || total > 30)
            return null;
        if (typeof raw.travelers !== "number" || !Number.isInteger(raw.travelers) || raw.travelers < 1 || raw.travelers > 20)
            return null;
        if (!raw.budget || typeof raw.budget !== "object")
            return null;
        const budget = raw.budget;
        if (typeof budget.amount !== "number" || !Number.isInteger(budget.amount) || budget.amount < 0 || budget.amount > 100000000)
            return null;
        if (typeof budget.currency !== "string" || !PlannerFormat.isCurrencyCode(budget.currency))
            return null;
        if (!Array.isArray(raw.interests) || raw.interests.length > 7)
            return null;
        const interests = [];
        for (let index = 0; index < raw.interests.length; index += 1) {
            const item = raw.interests[index];
            if (typeof item !== "string")
                return null;
            const name = item.trim();
            if (name === "" || name.length > 20)
                return null;
            interests.push(name);
        }
        if (raw.pace !== "relaxed" && raw.pace !== "moderate" && raw.pace !== "packed")
            return null;
        if (typeof raw.note !== "string" || raw.note.length > 300)
            return null;
        return {
            destination: destination,
            startDate: raw.startDate,
            endDate: raw.endDate,
            travelers: raw.travelers,
            budget: { amount: budget.amount, currency: budget.currency },
            interests: interests,
            pace: raw.pace,
            note: raw.note.trim()
        };
    }
    function readProgress(value) {
        if (!value || typeof value !== "object")
            return null;
        const raw = value;
        const request = readReady(raw.request);
        if (!request)
            return null;
        const totalDays = PlannerFormat.inclusiveDays(request.startDate, request.endDate);
        if (typeof raw.totalDays !== "number" || raw.totalDays !== totalDays)
            return null;
        if (typeof raw.nextOffset !== "number" || !Number.isInteger(raw.nextOffset) || raw.nextOffset < 0 || raw.nextOffset >= totalDays)
            return null;
        return {
            nextOffset: raw.nextOffset,
            totalDays: totalDays,
            useFallback: raw.useFallback === true,
            running: false,
            error: typeof raw.error === "string" ? raw.error : "",
            request: request,
            stays: readStoredStays(raw.stays),
            rides: readStoredRides(raw.rides)
        };
    }
    function readStoredStays(value) {
        if (!Array.isArray(value))
            return [];
        const stays = [];
        for (let index = 0; index < value.length; index += 1) {
            const stay = value[index];
            if (!stay || typeof stay.id !== "string" || typeof stay.name !== "string")
                continue;
            if (typeof stay.checkIn !== "string" || typeof stay.checkOut !== "string")
                continue;
            if (!stay.location || typeof stay.location.name !== "string")
                continue;
            if (!stay.pricePerNight || typeof stay.pricePerNight.amount !== "number")
                continue;
            stays.push(stay);
        }
        return stays;
    }
    function readStoredRides(value) {
        if (!Array.isArray(value))
            return [];
        const rides = [];
        for (let index = 0; index < value.length; index += 1) {
            const ride = value[index];
            if (!ride || typeof ride.id !== "string" || typeof ride.from !== "string" || typeof ride.to !== "string")
                continue;
            if (typeof ride.departAt !== "string" || !ride.cost || typeof ride.cost.amount !== "number")
                continue;
            rides.push(ride);
        }
        return rides;
    }
    function applyRequestToDraft(request) {
        state.draft.destination = request.destination;
        state.draft.startDate = request.startDate;
        state.draft.endDate = request.endDate;
        state.draft.travelers = String(request.travelers);
        state.draft.budgetAmount = String(request.budget.amount);
        state.draft.budgetCurrency = request.budget.currency;
        state.draft.interests = request.interests.slice();
        state.draft.pace = request.pace;
        state.draft.note = request.note;
    }
    function applySnapshot(record) {
        try {
            let progress = readProgress(record.progress);
            let plan = null;
            let source = null;
            if (isTripPlan(record.plan)) {
                normalizePlan(record.plan);
                const budget = record.plan.budget;
                const budgetOk = !!budget && typeof budget.amount === "number" && typeof budget.currency === "string";
                const picked = record.planSource === "ai" || record.planSource === "mock" ? record.planSource : null;
                if (budgetOk && typeof record.plan.travelers === "number" && savedListsOk(record.plan) && picked) {
                    plan = record.plan;
                    source = picked;
                }
            }
            if (!plan && !progress)
                return false;
            if (plan && source) {
                if (progress && plan.days.length >= progress.totalDays)
                    progress = null;
                else if (progress)
                    progress.nextOffset = plan.days.length;
                state.plan = plan;
                state.planSource = source;
                state.rates = savedRates(record.rates, plan.budget.currency);
                const active = record.activeDay;
                state.activeDay = typeof active === "number" && plan.days[active] ? active : 0;
                if (parkClosedDays())
                    saveResult();
            }
            else if (progress) {
                state.plan = null;
                state.planSource = null;
                state.rates = PlannerRates.homeRates(progress.request.budget.currency);
                state.activeDay = 0;
            }
            else {
                return false;
            }
            state.progress = progress;
            state.error = progress && !state.plan ? progress.error : "";
            if (progress)
                applyRequestToDraft(progress.request);
            state.step = state.plan ? 4 : 3;
            return true;
        }
        catch (err) {
            return false;
        }
    }
    function loadActiveTrip() {
        const trip = activeSaved();
        if (!trip)
            return false;
        try {
            return applySnapshot(cloneJson(trip.snapshot));
        }
        catch (err) {
            return false;
        }
    }
    function restoreResult() {
        ensureLibrary();
        return loadActiveTrip();
    }
    root.addEventListener("click", onClick);
    root.addEventListener("input", onInput);
    root.addEventListener("change", onInput);
    root.addEventListener("keydown", onKeyDown);
    if (restoreResult()) {
        render(state.step === 4 ? "trip-title" : "plan-continue");
        if (state.step === 4)
            scheduleStayGeocode();
    }
    else
        render("destination");
})();
