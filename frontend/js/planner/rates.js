"use strict";
// 預設匯率：1 單位外幣可換多少新台幣。畫面上的數字是換成行程預算幣別之後的值，不連線查詢。
(function (root) {
    "use strict";
    const TWD_PER_UNIT = {
        TWD: 1,
        JPY: 0.21,
        USD: 32,
        KRW: 0.023,
        EUR: 35
    };
    const CODES = ["TWD", "JPY", "USD", "KRW", "EUR"];
    function homeRates(home) {
        const homeTwd = TWD_PER_UNIT[home];
        const base = typeof homeTwd === "number" && homeTwd > 0 ? homeTwd : 1;
        const rates = {};
        for (let index = 0; index < CODES.length; index += 1) {
            const code = CODES[index];
            if (!code)
                continue;
            const twd = TWD_PER_UNIT[code];
            const perUnit = typeof twd === "number" ? twd : 0;
            rates[code] = code === home ? 1 : perUnit / base;
        }
        return rates;
    }
    const api = {
        homeRates: homeRates
    };
    root.PlannerRates = api;
})(globalThis);
