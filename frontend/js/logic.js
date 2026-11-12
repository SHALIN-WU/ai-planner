(function (root) {
  "use strict";

  function todayString(date) {
    const value = date instanceof Date ? date : new Date();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return value.getFullYear() + "-" + month + "-" + day;
  }

  function allocateDays(total, count) {
    const base = Math.floor(total / count);
    const remainder = total % count;
    const days = [];
    for (let index = 0; index < count; index += 1) {
      days.push(base + (index < remainder ? 1 : 0));
    }
    return days;
  }

  function targetCounts(days) {
    if (days < 1) return { attractions: 0, food: 0 };
    return {
      attractions: Math.min(3 * days, 8),
      food: Math.min(2 * days, 6)
    };
  }

  function parseTotal(value) {
    const text = String(value ?? "").trim();
    if (text === "") return { empty: true };
    if (!/^\d+$/.test(text)) return { invalid: true };
    const number = Number(text);
    if (number < 1) return { invalid: true };
    return { value: number };
  }

  function parseDay(value) {
    const text = String(value ?? "").trim();
    if (text === "") return { empty: true };
    if (!/^\d+$/.test(text)) return { invalid: true };
    return { value: Number(text) };
  }

  function validateTrip(input) {
    const destinations = Array.isArray(input.destinations) ? input.destinations : [];
    const errors = {
      totalDays: "",
      form: "",
      formCode: "",
      rows: destinations.map(function () {
        return { name: "", days: "" };
      })
    };
    const total = parseTotal(input.totalDays);
    if (total.empty) errors.totalDays = "請輸入總天數";
    else if (total.invalid) errors.totalDays = "總天數須為正整數";

    const parsed = destinations.map(function (destination) {
      return {
        name: String(destination.name ?? "").trim(),
        day: parseDay(destination.days)
      };
    });

    const namedCount = parsed.filter(function (row) { return row.name !== ""; }).length;
    if (destinations.length === 0 || namedCount === 0) {
      errors.form = "請至少輸入一個目的地";
      errors.formCode = "destinations";
    } else {
      parsed.forEach(function (row, index) {
        if (!row.name) errors.rows[index].name = "請填寫目的地名稱";
      });
    }

    parsed.forEach(function (row, index) {
      if (row.day.invalid) errors.rows[index].days = "天數須為非負整數";
    });

    const blocked = Boolean(errors.totalDays || errors.form || errors.rows.some(function (row) {
      return row.name || row.days;
    }));
    if (blocked) {
      return {
        ok: false,
        needsAllocationConfirm: false,
        proposedDays: null,
        normalized: null,
        errors: errors
      };
    }

    const allEmpty = parsed.every(function (row) { return row.day.empty; });
    const anyEmpty = parsed.some(function (row) { return row.day.empty; });
    if (allEmpty) {
      return {
        ok: false,
        needsAllocationConfirm: true,
        proposedDays: allocateDays(total.value, parsed.length),
        normalized: null,
        errors: errors
      };
    }
    if (anyEmpty) {
      errors.form = "請為每個目的地填寫天數，或全部清空改由系統分配";
      errors.formCode = "partial";
      return {
        ok: false,
        needsAllocationConfirm: false,
        proposedDays: null,
        normalized: null,
        errors: errors
      };
    }

    const sum = parsed.reduce(function (totalDays, row) { return totalDays + row.day.value; }, 0);
    if (sum !== total.value) {
      errors.form = "各目的地天數加總必須等於總天數（目前加總 " + sum + "，總天數 " + total.value + "）";
      errors.formCode = "sum";
      return {
        ok: false,
        needsAllocationConfirm: false,
        proposedDays: null,
        normalized: null,
        errors: errors
      };
    }

    return {
      ok: true,
      needsAllocationConfirm: false,
      proposedDays: null,
      normalized: {
        tripName: String(input.tripName ?? "").trim(),
        totalDays: total.value,
        destinations: parsed.map(function (row) {
          return { name: row.name, days: row.day.value };
        })
      },
      errors: errors
    };
  }

  root.TripLogic = {
    todayString: todayString,
    allocateDays: allocateDays,
    targetCounts: targetCounts,
    validateTrip: validateTrip
  };
})(globalThis);
