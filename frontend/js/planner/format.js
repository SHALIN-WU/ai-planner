"use strict";
(function (root) {
    "use strict";
    function parseIsoDate(value) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
        if (!match)
            return null;
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day))
            return null;
        const utc = Date.UTC(year, month - 1, day);
        const check = new Date(utc);
        if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day)
            return null;
        return utc;
    }
    function addDays(isoDate, amount) {
        const start = parseIsoDate(isoDate);
        if (start === null)
            return isoDate;
        const next = new Date(start + amount * 86400000);
        const month = String(next.getUTCMonth() + 1).padStart(2, "0");
        const day = String(next.getUTCDate()).padStart(2, "0");
        return String(next.getUTCFullYear()) + "-" + month + "-" + day;
    }
    function inclusiveDays(start, end) {
        const from = parseIsoDate(start);
        const to = parseIsoDate(end);
        if (from === null || to === null || to < from)
            return 0;
        return Math.round((to - from) / 86400000) + 1;
    }
    function nightCount(checkIn, checkOut) {
        const from = parseIsoDate(checkIn);
        const to = parseIsoDate(checkOut);
        if (from === null || to === null || to <= from)
            return 0;
        return Math.round((to - from) / 86400000);
    }
    function datePart(isoDateTime) {
        const match = /^(\d{4}-\d{2}-\d{2})/.exec(isoDateTime);
        return match && match[1] ? match[1] : "";
    }
    function formatClock(isoDateTime) {
        const match = /T(\d{2}):(\d{2})/.exec(isoDateTime);
        if (!match || !match[1] || !match[2])
            return "";
        return match[1] + ":" + match[2];
    }
    function minutesOfClock(isoDateTime) {
        const match = /T(\d{2}):(\d{2})/.exec(isoDateTime);
        if (!match || !match[1] || !match[2])
            return null;
        const hour = Number(match[1]);
        const minute = Number(match[2]);
        if (hour > 23 || minute > 59)
            return null;
        return hour * 60 + minute;
    }
    function createId() {
        return "p" + Math.random().toString(36).slice(2, 10);
    }
    function formatMoney(money) {
        const symbols = {
            TWD: "NT$",
            JPY: "¥",
            USD: "US$",
            KRW: "₩",
            EUR: "€"
        };
        const prefix = symbols[money.currency] || money.currency + " ";
        return prefix + money.amount.toLocaleString("zh-Hant");
    }
    function formatDuration(minutes) {
        if (minutes < 60)
            return String(minutes) + " 分鐘";
        const hours = Math.floor(minutes / 60);
        const rest = minutes % 60;
        if (rest === 0)
            return String(hours) + " 小時";
        return String(hours) + " 小時 " + String(rest) + " 分鐘";
    }
    function weekday(utc) {
        const weeks = "日一二三四五六";
        return weeks[new Date(utc).getUTCDay()] || "";
    }
    function formatDateLabel(iso, withYear) {
        const utc = parseIsoDate(iso);
        if (utc === null)
            return iso;
        const date = new Date(utc);
        const body = String(date.getUTCMonth() + 1) + "月" + String(date.getUTCDate()) + "日（" + weekday(utc) + "）";
        if (!withYear)
            return body;
        return String(date.getUTCFullYear()) + "年" + body;
    }
    function formatDateRange(start, end) {
        const from = parseIsoDate(start);
        const to = parseIsoDate(end);
        if (from === null || to === null)
            return start + " – " + end;
        const sameYear = new Date(from).getUTCFullYear() === new Date(to).getUTCFullYear();
        if (!sameYear)
            return formatDateLabel(start, true) + " – " + formatDateLabel(end, true);
        return formatDateLabel(start, true) + " – " + formatDateLabel(end, false);
    }
    function formatShortDate(iso) {
        const utc = parseIsoDate(iso);
        if (utc === null)
            return iso;
        const date = new Date(utc);
        return String(date.getUTCMonth() + 1) + "/" + String(date.getUTCDate());
    }
    function formatStayLength(start, end) {
        const days = inclusiveDays(start, end);
        if (days <= 0)
            return "結束日期要在出發當天或之後";
        return "共 " + String(days) + " 天";
    }
    function formatPace(pace) {
        if (pace === "relaxed")
            return "悠閒";
        if (pace === "packed")
            return "緊湊";
        return "適中";
    }
    function paceHint(pace) {
        if (pace === "relaxed")
            return "每天少排一些，多留空檔。";
        if (pace === "packed")
            return "路線排緊一點，想多去幾個地方。";
        return "一般觀光的節奏。";
    }
    function transportIcon(mode) {
        if (mode === "walk")
            return "🚶";
        if (mode === "train")
            return "🚇";
        if (mode === "bus")
            return "🚌";
        if (mode === "car")
            return "🚗";
        return "🚕";
    }
    function transportModeLabel(mode) {
        if (mode === "walk")
            return "步行";
        if (mode === "train")
            return "電車";
        if (mode === "bus")
            return "公車";
        if (mode === "car")
            return "開車";
        return "計程車";
    }
    function intercityIcon(mode) {
        if (mode === "flight")
            return "✈️";
        if (mode === "train")
            return "🚄";
        if (mode === "hsr")
            return "🚄";
        if (mode === "bus")
            return "🚌";
        if (mode === "car")
            return "🚗";
        if (mode === "ferry")
            return "⛴️";
        return "🎫";
    }
    function intercityModeLabel(mode) {
        if (mode === "flight")
            return "飛機";
        if (mode === "train")
            return "火車";
        if (mode === "hsr")
            return "高鐵";
        if (mode === "bus")
            return "巴士";
        if (mode === "car")
            return "開車";
        if (mode === "ferry")
            return "渡輪";
        return "其他";
    }
    function placeMeta(type) {
        if (type === "restaurant")
            return { icon: "🍽️", label: "餐廳" };
        if (type === "hotel")
            return { icon: "🏨", label: "住宿" };
        if (type === "shopping")
            return { icon: "🛍️", label: "購物" };
        return { icon: "🏛️", label: "景點" };
    }
    function isMappableLocation(location) {
        if (!location)
            return false;
        const lat = location.lat;
        const lng = location.lng;
        if (typeof lat !== "number" || typeof lng !== "number")
            return false;
        if (!Number.isFinite(lat) || !Number.isFinite(lng))
            return false;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180)
            return false;
        if (lat === 0 && lng === 0)
            return false;
        return true;
    }
    function acceptCoordPair(latText, lngText) {
        if (!latText || !lngText)
            return null;
        const lat = Number(latText);
        const lng = Number(lngText);
        if (!Number.isFinite(lat) || !Number.isFinite(lng))
            return null;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180)
            return null;
        return { lat: lat, lng: lng };
    }
    function parsePastedCoords(text) {
        const raw = text.trim().replace(/%2C/gi, ",");
        if (raw === "")
            return null;
        const pin = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(raw);
        if (pin)
            return acceptCoordPair(pin[1], pin[2]);
        const at = /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)(?:,|\/|\?|#|$)/.exec(raw);
        if (at)
            return acceptCoordPair(at[1], at[2]);
        const query = /[?&](?:q|query|ll|center)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/.exec(raw);
        if (query)
            return acceptCoordPair(query[1], query[2]);
        const plain = /^(-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)$/.exec(raw);
        if (plain)
            return acceptCoordPair(plain[1], plain[2]);
        return null;
    }
    function totalCost(plan) {
        let amount = 0;
        let currency = "";
        for (let dayIndex = 0; dayIndex < plan.days.length; dayIndex += 1) {
            const day = plan.days[dayIndex];
            if (!day)
                continue;
            for (let itemIndex = 0; itemIndex < day.items.length; itemIndex += 1) {
                const item = day.items[itemIndex];
                if (!item)
                    continue;
                amount += item.cost.amount;
                if (currency === "" && item.cost.currency)
                    currency = item.cost.currency;
            }
        }
        if (currency === "")
            currency = plan.budget.currency;
        return { amount: amount, currency: currency };
    }
    function splitPerPerson(money, travelers) {
        const count = Number.isInteger(travelers) && travelers > 0 ? travelers : 1;
        return { amount: Math.round(money.amount / count), currency: money.currency };
    }
    function perPersonCost(plan) {
        return splitPerPerson(totalCost(plan), plan.travelers);
    }
    function formatDistance(meters) {
        if (!Number.isFinite(meters) || meters < 0)
            return "";
        const rounded = Math.round(meters);
        if (rounded < 1000)
            return String(rounded) + " 公尺";
        const km = Math.round(rounded / 100) / 10;
        return String(km) + " 公里";
    }
    function straightKm(from, to) {
        const radius = 6371;
        const toRad = Math.PI / 180;
        const lat1 = from.lat * toRad;
        const lat2 = to.lat * toRad;
        const dLat = (to.lat - from.lat) * toRad;
        const dLng = (to.lng - from.lng) * toRad;
        const sinLat = Math.sin(dLat / 2);
        const sinLng = Math.sin(dLng / 2);
        const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
        return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
    }
    function formatMinuteClock(totalMinutes) {
        const safe = Number.isFinite(totalMinutes) ? Math.max(0, Math.round(totalMinutes)) : 0;
        const day = Math.floor(safe / 1440);
        const minutes = safe % 1440;
        const clock = String(Math.floor(minutes / 60)).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0");
        if (day <= 0)
            return clock;
        if (day === 1)
            return "翌日 " + clock;
        return "+" + String(day) + " 日 " + clock;
    }
    function positiveMinutes(value) {
        if (!Number.isFinite(value) || value <= 0)
            return 0;
        return value;
    }
    const DAY_START_MINUTES = PlannerSchedule.dayStartMinutes();
    const FLIGHT_BEFORE_MINUTES = 180;
    const FLIGHT_AFTER_MINUTES = 90;
    const RIDE_BEFORE_MINUTES = 60;
    const RIDE_AFTER_MINUTES = 30;
    const LATE_ARRIVAL_MINUTES = 18 * 60;
    const DINNER_CUTOFF_MINUTES = 19 * 60 + 30;
    const FAR_STAY_KM = 50;
    function bufferFor(mode) {
        if (mode === "flight")
            return { before: FLIGHT_BEFORE_MINUTES, after: FLIGHT_AFTER_MINUTES };
        return { before: RIDE_BEFORE_MINUTES, after: RIDE_AFTER_MINUTES };
    }
    function stayCovers(stay, isoDate) {
        return stay.checkIn <= isoDate && isoDate < stay.checkOut;
    }
    function hasStayNight(plan, isoDate) {
        const stays = plan.accommodations || [];
        for (let index = 0; index < stays.length; index += 1) {
            const stay = stays[index];
            if (stay && stayCovers(stay, isoDate))
                return true;
        }
        return false;
    }
    function emptyWindow() {
        return {
            startMinutes: DAY_START_MINUTES,
            endMinutes: null,
            blocks: [],
            note: "",
            late: "",
            departToward: "",
            deadlineLabel: "",
            deadlineKind: ""
        };
    }
    function jumpMinutes(cursor, blocks) {
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
    function dayWindow(plan, date) {
        const result = emptyWindow();
        const rides = plan.transports || [];
        const slept = hasStayNight(plan, addDays(date, -1));
        const staying = hasStayNight(plan, date);
        let start = DAY_START_MINUTES;
        let end = null;
        let departToward = "";
        let deadlineLabel = "";
        let deadlineKind = "";
        let openedAt = null;
        let openedPlace = "";
        const blocks = [];
        const blockNotes = [];
        function raiseOpen(arriveMin, after, place) {
            const open = arriveMin + after;
            if (open <= start)
                return;
            start = open;
            openedAt = arriveMin;
            openedPlace = place;
        }
        for (let index = 0; index < rides.length; index += 1) {
            const ride = rides[index];
            if (!ride)
                continue;
            const departsToday = datePart(ride.departAt) === date;
            const arrivesToday = !!ride.arriveAt && datePart(ride.arriveAt) === date;
            if (!departsToday && !arrivesToday)
                continue;
            const buffers = bufferFor(ride.mode);
            const departMin = departsToday ? minutesOfClock(ride.departAt) : null;
            const arriveMin = arrivesToday && ride.arriveAt ? minutesOfClock(ride.arriveAt) : null;
            const leaving = departsToday && (date === plan.endDate || (slept && !staying));
            if (leaving && departMin !== null) {
                const deadline = departMin - buffers.before;
                if (end === null || deadline < end) {
                    end = deadline;
                    departToward = ride.from.trim();
                    deadlineKind = ride.mode === "flight" ? "flight" : "other";
                    deadlineLabel = formatMinuteClock(departMin) + " " + ride.from + " → " + ride.to;
                }
                continue;
            }
            if (arrivesToday && arriveMin !== null && !departsToday) {
                raiseOpen(arriveMin, buffers.after, ride.to.trim());
                continue;
            }
            if (departsToday && arrivesToday && departMin !== null && arriveMin !== null) {
                if (!slept) {
                    raiseOpen(arriveMin, buffers.after, ride.to.trim());
                }
                else {
                    const blockStart = Math.max(0, departMin - buffers.before);
                    const blockEnd = arriveMin + buffers.after;
                    if (blockEnd > blockStart) {
                        blocks.push({ startMinutes: blockStart, endMinutes: blockEnd });
                        blockNotes.push(formatMinuteClock(departMin) + "–" + formatMinuteClock(arriveMin) + " " +
                            ride.from + " → " + ride.to + " 移動中不排景點。");
                    }
                }
                continue;
            }
            if (departsToday && departMin !== null && slept) {
                blocks.push({ startMinutes: Math.max(0, departMin - buffers.before), endMinutes: 24 * 60 });
                blockNotes.push(formatMinuteClock(departMin) + " 自" + ride.from + "出發後不排景點。");
            }
        }
        start = jumpMinutes(start, blocks);
        let late = "";
        if (openedAt !== null && openedAt >= LATE_ARRIVAL_MINUTES) {
            late = start <= DINNER_CUTOFF_MINUTES ? "dinner" : "stay";
        }
        const notes = [];
        if (openedAt !== null && start > DAY_START_MINUTES) {
            const arrived = formatMinuteClock(openedAt);
            const begin = formatMinuteClock(start);
            const where = openedPlace;
            if (late === "stay") {
                notes.push(arrived + " 抵達" + where + "，" + begin + " 後才開始。時間太晚，這天不排景點，直接入住。");
            }
            else if (late === "dinner") {
                notes.push(arrived + " 抵達" + where + "，" + begin + " 後才開始。時間較晚，這天只排晚餐，不排景點。");
            }
            else {
                notes.push("抵達後出發 · " + arrived + (where === "" ? "" : " " + where) + "抵達，第一站 " + begin + " 開始。");
            }
        }
        if (end !== null && deadlineLabel !== "") {
            const toward = departToward === "" ? "" : "，最後前往" + departToward;
            notes.push(deadlineLabel + "，行程請在 " + formatMinuteClock(Math.max(0, end)) + " 前結束" + toward + "。");
        }
        for (let index = 0; index < blockNotes.length; index += 1) {
            const line = blockNotes[index];
            if (line)
                notes.push(line);
        }
        result.startMinutes = start;
        result.endMinutes = end;
        result.blocks = blocks;
        result.note = notes.join("");
        result.late = late;
        result.departToward = departToward;
        result.deadlineLabel = deadlineLabel;
        result.deadlineKind = deadlineKind;
        return result;
    }
    function dayClosed(window) {
        if (window.late === "stay")
            return true;
        if (window.endMinutes !== null && window.endMinutes <= window.startMinutes)
            return true;
        return false;
    }
    function cityCenters() {
        return {
            "白川鄉": [36.2576, 136.906],
            "高山": [36.1408, 137.2519],
            "富山": [36.7013, 137.213],
            "金澤": [36.5781, 136.648],
            "名古屋": [35.1709, 136.8815],
            "中部機場": [34.8584, 136.8054],
            "大阪": [34.7024, 135.4959],
            "加賀": [36.3028, 136.3145],
            "東京": [35.6812, 139.7671],
            "京都": [35.0116, 135.7681],
            "奈良": [34.6851, 135.8048],
            "福井": [36.0652, 136.2216],
            "立山": [36.5796, 137.4454]
        };
    }
    function cityPoint(label) {
        const hit = cityCenters()[label];
        if (!hit)
            return null;
        return { lat: hit[0], lng: hit[1] };
    }
    function cityRules() {
        return [
            { label: "白川鄉", keys: ["白川鄉", "白川郷", "白川乡", "shirakawa"] },
            { label: "高山", keys: ["高山", "takayama", "hida"] },
            { label: "富山", keys: ["富山", "toyama"] },
            { label: "金澤", keys: ["金澤", "金沢", "kanazawa"] },
            { label: "中部機場", keys: ["中部國際機場", "中部国际机场", "中部國際空港", "中部空港", "centrair", "chubu"] },
            { label: "名古屋", keys: ["名古屋", "nagoya"] },
            { label: "大阪", keys: ["大阪", "osaka", "關西", "关西", "kansai"] },
            { label: "加賀", keys: ["加賀", "加贺", "kaga"] },
            { label: "東京", keys: ["東京", "东京", "tokyo"] },
            { label: "京都", keys: ["京都", "kyoto"] },
            { label: "奈良", keys: ["奈良", "nara"] },
            { label: "福井", keys: ["福井", "fukui"] },
            { label: "立山", keys: ["立山", "tateyama"] }
        ];
    }
    function citiesInText(text) {
        const rules = cityRules();
        const found = [];
        const haystack = text.toLowerCase();
        for (let index = 0; index < rules.length; index += 1) {
            const rule = rules[index];
            if (!rule)
                continue;
            let hit = false;
            for (let keyIndex = 0; keyIndex < rule.keys.length; keyIndex += 1) {
                const key = rule.keys[keyIndex];
                if (key && haystack.indexOf(key.toLowerCase()) >= 0) {
                    hit = true;
                    break;
                }
            }
            if (hit)
                found.push(rule.label);
        }
        return found;
    }
    function stayCityLabels(stay) {
        const parts = [stay.name];
        if (stay.location && stay.location.name)
            parts.push(stay.location.name);
        const named = citiesInText(parts.join(" "));
        if (named.length > 0)
            return named;
        if (stay.note)
            return citiesInText(stay.note);
        return [];
    }
    function stayCoordFar(stay) {
        if (!isMappableLocation(stay.location))
            return false;
        const labels = stayCityLabels(stay);
        const limit = PlannerSchedule.stayCityMismatchKm();
        let compared = 0;
        for (let index = 0; index < labels.length; index += 1) {
            const label = labels[index];
            if (!label)
                continue;
            const city = cityPoint(label);
            if (!city)
                continue;
            compared += 1;
            if (straightKm(stay.location, city) <= limit)
                return false;
        }
        return compared > 0;
    }
    function stayPoint(stay) {
        if (isMappableLocation(stay.location)) {
            return { lat: stay.location.lat, lng: stay.location.lng };
        }
        return stayAnchor(stay);
    }
    function placeNameKey(name) {
        return name.trim().toLowerCase().replace(/\s+/g, " ");
    }
    function samePlaceName(itemName, stayName) {
        const item = placeNameKey(itemName);
        const stay = placeNameKey(stayName);
        if (item === "" || stay === "")
            return false;
        if (item === stay)
            return true;
        return stay.length >= 8 && item.indexOf(stay) >= 0;
    }
    function dayLodging(plan, date) {
        const previous = addDays(date, -1);
        let start = null;
        let end = null;
        const stays = plan.accommodations || [];
        for (let index = 0; index < stays.length; index += 1) {
            const stay = stays[index];
            if (!stay)
                continue;
            if (!end && stayCovers(stay, date))
                end = stay;
            if (!start && stayCovers(stay, previous))
                start = stay;
        }
        return { start: start, end: end };
    }
    function lodgingRole(itemName, lodging) {
        if (lodging.end && samePlaceName(itemName, lodging.end.name))
            return "end";
        const leaves = lodging.start && (!lodging.end || lodging.start.id !== lodging.end.id);
        if (leaves && lodging.start && samePlaceName(itemName, lodging.start.name))
            return "start";
        return "";
    }
    function stayAnchor(stay) {
        const labels = stayCityLabels(stay);
        const mapped = isMappableLocation(stay.location)
            ? { lat: stay.location.lat, lng: stay.location.lng }
            : null;
        const limit = PlannerSchedule.stayCityMismatchKm();
        let named = null;
        let agreed = false;
        for (let index = 0; index < labels.length; index += 1) {
            const label = labels[index];
            if (!label)
                continue;
            const city = cityPoint(label);
            if (!city)
                continue;
            if (!named)
                named = city;
            if (mapped && straightKm(mapped, city) <= limit)
                agreed = true;
        }
        if (mapped && (agreed || !named))
            return mapped;
        if (named)
            return named;
        return mapped;
    }
    function stayPlaceOf(stay) {
        return {
            name: stay.name,
            checkIn: stay.checkIn,
            checkOut: stay.checkOut,
            cities: stayCityLabels(stay)
        };
    }
    function pushUnique(list, value) {
        if (list.indexOf(value) < 0)
            list.push(value);
    }
    function dayPlaces(plan, date) {
        const tonight = [];
        const leaving = [];
        const cities = [];
        const stays = plan.accommodations || [];
        for (let index = 0; index < stays.length; index += 1) {
            const stay = stays[index];
            if (!stay || stay.checkOut <= stay.checkIn)
                continue;
            const place = stayPlaceOf(stay);
            const covers = stay.checkIn <= date && date < stay.checkOut;
            if (covers)
                tonight.push(place);
            else if (stay.checkOut === date)
                leaving.push(place);
            else
                continue;
            for (let cityIndex = 0; cityIndex < place.cities.length; cityIndex += 1) {
                const city = place.cities[cityIndex];
                if (city)
                    pushUnique(cities, city);
            }
        }
        const later = [];
        for (let index = 0; index < stays.length; index += 1) {
            const stay = stays[index];
            if (!stay || stay.checkIn <= date)
                continue;
            const labels = stayCityLabels(stay);
            for (let cityIndex = 0; cityIndex < labels.length; cityIndex += 1) {
                const city = labels[cityIndex];
                if (!city || cities.indexOf(city) >= 0)
                    continue;
                let known = false;
                for (let laterIndex = 0; laterIndex < later.length; laterIndex += 1) {
                    const row = later[laterIndex];
                    if (!row || row.city !== city)
                        continue;
                    known = true;
                    if (stay.checkIn < row.checkIn)
                        row.checkIn = stay.checkIn;
                }
                if (!known)
                    later.push({ city: city, checkIn: stay.checkIn });
            }
        }
        return {
            closed: dayClosed(dayWindow(plan, date)),
            changeover: tonight.length > 0 && leaving.length > 0,
            cities: cities,
            tonight: tonight,
            leaving: leaving,
            later: later
        };
    }
    function describeStayPlace(place) {
        const cityText = place.cities.length > 0 ? "城市：" + place.cities.join("、") : "名稱和備註沒有對出城市";
        return place.name + "（" + cityText + "；" + place.checkIn + " 入住，" + place.checkOut + " 退房）";
    }
    function dayPlaceLine(plan, date) {
        const places = dayPlaces(plan, date);
        const parts = [];
        if (places.leaving.length > 0) {
            const names = places.leaving.map(describeStayPlace).join("、");
            parts.push("早上離開 " + names);
        }
        if (places.tonight.length > 0) {
            const names = places.tonight.map(describeStayPlace).join("、");
            parts.push((places.leaving.length > 0 ? "晚上住 " : "住 ") + names);
        }
        let rule = "";
        if (places.tonight.length === 0 && places.leaving.length === 0) {
            rule = "這天沒有已填的住宿。不要自行安排到其他已填住宿的城市。";
        }
        else if (places.closed) {
            rule = "這天沒有可排景點的時段，只放入住，不要排景點。";
        }
        else if (places.changeover) {
            const where = places.cities.length > 0 ? places.cities.join("、") : "這兩間住宿的城市";
            rule = "這天換飯店，只往一個方向：先排前一晚住宿的城市，長程移動一次，再排今晚住宿的城市，不要來回。城市可以是" + where + "。";
        }
        else if (places.cities.length > 0) {
            rule = "景點必須在" + places.cities.join("或") + "，或這間住宿附近。";
        }
        else {
            rule = "景點必須在這間住宿附近，不要排到別的城市。";
        }
        if (places.later.length > 0) {
            const blocked = places.later.map(function (row) {
                return row.city + "（" + row.checkIn + " 入住）";
            }).join("、");
            rule += "不可排這天還沒入住的城市：" + blocked + "。";
        }
        if (parts.length === 0)
            return date + "：" + rule;
        return date + "：" + parts.join("，") + "。" + rule;
    }
    function anchorPoints(plan, date) {
        const points = [];
        const previous = addDays(date, -1);
        const stays = plan.accommodations || [];
        for (let index = 0; index < stays.length; index += 1) {
            const stay = stays[index];
            if (!stay)
                continue;
            if (!stayCovers(stay, previous) && !stayCovers(stay, date))
                continue;
            if (!isMappableLocation(stay.location))
                continue;
            points.push({ lat: stay.location.lat, lng: stay.location.lng });
        }
        return points;
    }
    function stopsFarFromStay(plan, day) {
        const anchors = anchorPoints(plan, day.date);
        if (anchors.length === 0)
            return false;
        for (let index = 0; index < day.items.length; index += 1) {
            const item = day.items[index];
            if (!item || item.type === "hotel" || !isMappableLocation(item.location))
                continue;
            let nearest = Number.POSITIVE_INFINITY;
            for (let anchorIndex = 0; anchorIndex < anchors.length; anchorIndex += 1) {
                const anchor = anchors[anchorIndex];
                if (!anchor)
                    continue;
                const distance = straightKm(item.location, anchor);
                if (distance < nearest)
                    nearest = distance;
            }
            if (nearest > FAR_STAY_KM)
                return true;
        }
        return false;
    }
    function dayClock(items, startMinutes, blocks, leadMinutes) {
        const gaps = blocks || [];
        const arrivals = [];
        const arrivalMinutes = [];
        let cursor = jumpMinutes(typeof startMinutes === "number" && Number.isFinite(startMinutes)
            ? Math.max(0, Math.round(startMinutes))
            : DAY_START_MINUTES, gaps);
        let total = 0;
        const lead = typeof leadMinutes === "number" && Number.isFinite(leadMinutes) && leadMinutes > 0
            ? Math.round(leadMinutes)
            : 0;
        if (items.length > 0 && lead > 0) {
            total += lead;
            cursor += lead;
        }
        for (let index = 0; index < items.length; index += 1) {
            const item = items[index];
            cursor = jumpMinutes(cursor, gaps);
            arrivals.push(formatMinuteClock(cursor));
            arrivalMinutes.push(cursor);
            if (!item)
                continue;
            const stay = positiveMinutes(item.durationMinutes);
            total += stay;
            cursor += stay;
            const gap = positiveMinutes(item.breakMinutes || 0);
            total += gap;
            cursor += gap;
            const leg = index < items.length - 1 ? item.transportToNext : undefined;
            const ride = leg ? positiveMinutes(leg.minutes) : 0;
            total += ride;
            cursor += ride;
        }
        cursor = jumpMinutes(cursor, gaps);
        return {
            arrivals: arrivals,
            arrivalMinutes: arrivalMinutes,
            totalMinutes: total,
            endLabel: formatMinuteClock(cursor),
            endMinutes: cursor
        };
    }
    function clockMinutes(totalMinutes) {
        if (!Number.isFinite(totalMinutes))
            return 0;
        const rounded = Math.round(totalMinutes);
        const mod = rounded % 1440;
        if (mod < 0)
            return mod + 1440;
        return mod;
    }
    function mealWindows() {
        return PlannerSchedule.mealWindows();
    }
    function mealSlot(minutes) {
        const clock = clockMinutes(minutes);
        const windows = mealWindows();
        const early = PlannerSchedule.mealEarlySlackMinutes();
        for (let index = 0; index < windows.length; index += 1) {
            const window = windows[index];
            if (!window)
                continue;
            const start = window.slot === "lunch" ? window.start - early : window.start;
            if (clock >= start && clock <= window.end)
                return window.slot;
        }
        return "";
    }
    function currencyChoices() {
        return [
            { code: "TWD", label: "TWD 新台幣" },
            { code: "JPY", label: "JPY 日圓" },
            { code: "USD", label: "USD 美元" },
            { code: "KRW", label: "KRW 韓元" },
            { code: "EUR", label: "EUR 歐元" }
        ];
    }
    function isCurrencyCode(value) {
        const choices = currencyChoices();
        for (let index = 0; index < choices.length; index += 1) {
            const choice = choices[index];
            if (choice && choice.code === value)
                return true;
        }
        return false;
    }
    const api = {
        parseIsoDate: parseIsoDate,
        addDays: addDays,
        inclusiveDays: inclusiveDays,
        nightCount: nightCount,
        createId: createId,
        formatMoney: formatMoney,
        formatDuration: formatDuration,
        formatDateRange: formatDateRange,
        formatShortDate: formatShortDate,
        formatStayLength: formatStayLength,
        formatPace: formatPace,
        paceHint: paceHint,
        transportIcon: transportIcon,
        transportModeLabel: transportModeLabel,
        intercityIcon: intercityIcon,
        intercityModeLabel: intercityModeLabel,
        placeMeta: placeMeta,
        isMappableLocation: isMappableLocation,
        parsePastedCoords: parsePastedCoords,
        datePart: datePart,
        formatClock: formatClock,
        minutesOfClock: minutesOfClock,
        straightKm: straightKm,
        formatDistance: formatDistance,
        dayClock: dayClock,
        dayWindow: dayWindow,
        dayClosed: dayClosed,
        dayPlaces: dayPlaces,
        dayPlaceLine: dayPlaceLine,
        stopsFarFromStay: stopsFarFromStay,
        formatMinuteClock: formatMinuteClock,
        clockMinutes: clockMinutes,
        mealWindows: mealWindows,
        mealSlot: mealSlot,
        stayAnchor: stayAnchor,
        stayPoint: stayPoint,
        cityPoint: cityPoint,
        citiesInText: citiesInText,
        stayCoordFar: stayCoordFar,
        dayLodging: dayLodging,
        lodgingRole: lodgingRole,
        totalCost: totalCost,
        perPersonCost: perPersonCost,
        splitPerPerson: splitPerPerson,
        currencyChoices: currencyChoices,
        isCurrencyCode: isCurrencyCode
    };
    root.PlannerFormat = api;
})(globalThis);
