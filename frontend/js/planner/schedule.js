"use strict";
(function (root) {
    "use strict";
    /**
     * 行程時間與交通估算。日後要調用餐時段、城際速度或候車，改這個物件即可。
     * 伺服器產生行程的提示詞裡寫了同一組時刻，調整時請一併更新 server/index.js。
     */
    const SCHEDULE = {
        dayStartMinutes: 9 * 60,
        lunchStart: 11 * 60 + 30,
        lunchEnd: 13 * 60 + 30,
        dinnerStart: 17 * 60 + 30,
        dinnerEnd: 19 * 60 + 30,
        /** 超過這個距離，巴士與電車改用城際速度，不再用市內公車速度。 */
        intercityMinKm: 15,
        /** 城際巴士／電車時速（公里）。 */
        intercityKmh: 70,
        /** 城際候車分鐘。 */
        intercityWaitMinutes: 12,
        /** 超過這個分鐘數視為長程移動，用餐要排在移動前或移動後。 */
        longLegMinutes: 40,
        /** 為了卡進用餐時段，前一站最多可以延長的分鐘。 */
        maxExtendMinutes: 90,
        /** 為了等晚餐而拉長時，單一站最多比原停留多的分鐘。 */
        dinnerExtendMinutes: 60,
        /** 午餐比時段早這幾分鐘以內，視為準時，不顯示警示。 */
        mealEarlySlackMinutes: 15,
        /** 住宿座標離名稱或備註裡的城市超過這個公里數，視為座標可能有誤。 */
        stayCityMismatchKm: 20,
        walkMinPerKm: 12,
        cityCarMinPerKm: 2,
        cityTrainMinPerKm: 2,
        cityTrainWaitMinutes: 8,
        cityBusMinPerKm: 3,
        cityBusWaitMinutes: 5
    };
    function clampMinutes(value) {
        if (!Number.isFinite(value))
            return 1;
        return Math.max(1, Math.min(1440, Math.round(value)));
    }
    function dayStartMinutes() {
        return SCHEDULE.dayStartMinutes;
    }
    function longLegMinutes() {
        return SCHEDULE.longLegMinutes;
    }
    function maxExtendMinutes() {
        return SCHEDULE.maxExtendMinutes;
    }
    function dinnerExtendMinutes() {
        return SCHEDULE.dinnerExtendMinutes;
    }
    function clockOf(totalMinutes) {
        if (!Number.isFinite(totalMinutes))
            return 0;
        const mod = Math.round(totalMinutes) % 1440;
        return mod < 0 ? mod + 1440 : mod;
    }
    /** 行程裡寫明的營業結束時刻。朝市、晨間市集只開到中午。 */
    function closingMinute(item) {
        if (item.type === "restaurant")
            return null;
        const text = item.name + "\n" + item.description;
        if (text.indexOf("朝市") !== -1 || text.indexOf("晨間市集") !== -1 || text.indexOf("晨市") !== -1) {
            return 12 * 60;
        }
        return null;
    }
    /** 為了等晚餐，這一站最多可以停到這裡。不會短於原停留，也不會超過已知收攤時間。 */
    function dinnerStayCap(item, arrivalMinutes) {
        const current = Number.isFinite(item.durationMinutes) && item.durationMinutes > 0 ? item.durationMinutes : 0;
        const base = typeof item.baseDurationMinutes === "number" && item.baseDurationMinutes > 0
            ? item.baseDurationMinutes
            : current;
        let cap = base + SCHEDULE.dinnerExtendMinutes;
        const close = closingMinute(item);
        if (close !== null) {
            const arrival = clockOf(arrivalMinutes);
            if (arrival >= close)
                cap = base;
            else
                cap = Math.min(cap, Math.max(base, close - arrival));
        }
        return cap;
    }
    function mealEarlySlackMinutes() {
        return SCHEDULE.mealEarlySlackMinutes;
    }
    function stayCityMismatchKm() {
        return SCHEDULE.stayCityMismatchKm;
    }
    /** 兩間住宿直線距離超過城際門檻，這天就是換飯店、只能單向移動。 */
    function separateStay(meters) {
        if (!Number.isFinite(meters))
            return false;
        return meters / 1000 > SCHEDULE.intercityMinKm;
    }
    function mealWindows() {
        return [
            {
                slot: "lunch",
                start: SCHEDULE.lunchStart,
                end: SCHEDULE.lunchEnd,
                midpoint: Math.round((SCHEDULE.lunchStart + SCHEDULE.lunchEnd) / 2)
            },
            {
                slot: "dinner",
                start: SCHEDULE.dinnerStart,
                end: SCHEDULE.dinnerEnd,
                midpoint: Math.round((SCHEDULE.dinnerStart + SCHEDULE.dinnerEnd) / 2)
            }
        ];
    }
    function travelMinutes(mode, meters, networkDurationSeconds) {
        const km = meters / 1000;
        if (mode === "walk")
            return clampMinutes(km * SCHEDULE.walkMinPerKm);
        if (typeof networkDurationSeconds === "number" && Number.isFinite(networkDurationSeconds) && networkDurationSeconds > 0) {
            return clampMinutes(networkDurationSeconds / 60);
        }
        if ((mode === "bus" || mode === "train") && km > SCHEDULE.intercityMinKm) {
            const speed = SCHEDULE.intercityKmh > 0 ? SCHEDULE.intercityKmh : 1;
            return clampMinutes((km / speed) * 60 + SCHEDULE.intercityWaitMinutes);
        }
        if (mode === "car" || mode === "taxi")
            return clampMinutes(km * SCHEDULE.cityCarMinPerKm);
        if (mode === "train")
            return clampMinutes(km * SCHEDULE.cityTrainMinPerKm + SCHEDULE.cityTrainWaitMinutes);
        return clampMinutes(km * SCHEDULE.cityBusMinPerKm + SCHEDULE.cityBusWaitMinutes);
    }
    /** 舊的市內速度公式。用來把已存的長距離估算換成城際速度。 */
    function isLegacyIntercityEstimate(mode, meters, minutes) {
        const km = meters / 1000;
        if (!Number.isFinite(minutes) || km <= SCHEDULE.intercityMinKm)
            return false;
        if (mode !== "bus" && mode !== "train")
            return false;
        const legacy = mode === "train"
            ? clampMinutes(km * SCHEDULE.cityTrainMinPerKm + SCHEDULE.cityTrainWaitMinutes)
            : clampMinutes(km * SCHEDULE.cityBusMinPerKm + SCHEDULE.cityBusWaitMinutes);
        return minutes === legacy;
    }
    const api = {
        dayStartMinutes: dayStartMinutes,
        longLegMinutes: longLegMinutes,
        maxExtendMinutes: maxExtendMinutes,
        dinnerExtendMinutes: dinnerExtendMinutes,
        closingMinute: closingMinute,
        dinnerStayCap: dinnerStayCap,
        mealEarlySlackMinutes: mealEarlySlackMinutes,
        stayCityMismatchKm: stayCityMismatchKm,
        separateStay: separateStay,
        mealWindows: mealWindows,
        travelMinutes: travelMinutes,
        isLegacyIntercityEstimate: isLegacyIntercityEstimate
    };
    root.PlannerSchedule = api;
})(globalThis);
