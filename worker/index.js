// 行程邏輯從 server/index.js 搬來，改由 Worker 呼叫 Gemini。本機 Express 與 .env 維持不變。

const CURRENCIES = new Set(["TWD", "JPY", "USD", "KRW", "EUR"]);
const PLACE_TYPES = new Set(["attraction", "restaurant", "hotel", "shopping"]);
const TRANSPORT_MODES = new Set(["walk", "train", "bus", "car", "taxi"]);

const SYSTEM_PROMPT = `你是旅遊行程規劃助手。請用繁體中文規劃，並只輸出符合指定 JSON schema 的結果。

規則：
1. days 的數量必須剛好等於使用者提供的天數，一天一筆，不可多也不可少。date 必須使用使用者列出的日期。
2. 依步調安排每天的站數，餐廳也算一站：悠閒 3 站、適中 4 到 5 站、緊湊 6 站。
3. 依興趣挑選景點。每天約 09:00 從住宿出發。每天正好安排午餐、晚餐各 1 間餐廳，type 為 restaurant。兩餐中間要有其他站，不要連續兩間餐廳。午餐必須在 11:30–13:30 抵達，晚餐必須在 17:30–19:30 抵達。長程移動（例如換城市、車程超過 40 分鐘）安排在早上出發之後或午餐結束之後，並寫出大約的交通分鐘數，不要讓長程移動跨過整個用餐時段。換飯店只往一個方向：先排前一晚住宿那座城市的景點和餐廳，長程移動一次，再排今晚住宿那座城市，同一天不要來回。若住宿備註或使用者補充寫了含早餐，不要在 09:00–11:00 安排正餐餐廳。
4. 把「想告訴 AI 的話」納入行程，例如飲食限制、同行成員、想去或不想去的地方。
5. 同一天的景點集中在相近區域，從住宿或抵達處沿單一方向排，不要先往南再往北又折返。
6. 每站提供真實存在的名稱、一句介紹、建議停留分鐘數、全團預估費用、大致經緯度。費用使用目的地的當地幣別，整趟行程只用同一種幣別。
7. 除了每天最後一站，都要提供前往下一站的交通方式與預估分鐘數。交通方式只能是 walk、train、bus、car、taxi。
8. 各站費用加總盡量不要超過預算。預算幣別若與當地幣別不同，先做概略換算再控制總額。費用是全團合計，不是每人。
9. 不要捏造明顯不存在的店名。不確定時改選該區眾所皆知的真實地點。
10. dayIndex 從 1 開始。若這次只要求完整行程中的一段，dayIndex 仍從 1 開始，表示這一段的第 1 天。
11. 若使用者只列出完整行程中的一段日期，days 只能包含那些日期，不可補上其他天，也不可重複已去過的景點、餐廳或商店。住宿可以沿用同一間。
12. accommodations 只列這一段有入住的飯店，每間一次，並附上大致經緯度。
13. 若使用者列出已訂住宿，每天從「前一晚那間」出發，結束在「當晚那間」。換飯店那天只往一個方向：先排前一晚住宿的城市，長程移動一次，再排今晚住宿的城市，同一天不要來回。景點不可排到入住日晚於這一天的城市。城市以飯店名稱與備註裡出現的地名為準，兩邊都算。若座標和寫出的城市不在同一帶，以城市為準。入住日與退房日沿用使用者填的日期，不可自行推算，也不可改成別間。
14. 若使用者列出大交通：飛機在起飛前 3 小時到抵達後 1.5 小時不排景點；新幹線、巴士、渡輪、汽車與其他在出發前 1 小時到抵達後 30 分鐘不排景點。出發日的最後一站要能前往該筆交通所填的出發地，不要改成別的城市。
15. 抵達時間在 18:00 以後不排景點。抵達加上緩衝若晚於 19:30，那天只放 1 個 type 為 hotel 的入住站；還趕得上晚餐就只放 1 間餐廳。沒有可排時段的出發日也只放 1 個 hotel 站。這些情況不受每天站數規則限制。`;

const moneySchema = {
  type: "OBJECT",
  properties: {
    amount: { type: "INTEGER", description: "全團預估費用，整數，不可為負" },
    currency: { type: "STRING", description: "當地幣別代碼，例如 JPY、KRW、TWD，整趟行程相同" }
  },
  required: ["amount", "currency"],
  propertyOrdering: ["amount", "currency"]
};

const locationSchema = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING", description: "地點名稱，通常與該站名稱相同" },
    lat: { type: "NUMBER", description: "緯度，十進位小數" },
    lng: { type: "NUMBER", description: "經度，十進位小數" }
  },
  required: ["name", "lat", "lng"],
  propertyOrdering: ["name", "lat", "lng"]
};

const transportSchema = {
  type: "OBJECT",
  properties: {
    mode: {
      type: "STRING",
      enum: ["walk", "train", "bus", "car", "taxi"],
      description: "前往下一站的交通方式"
    },
    minutes: { type: "INTEGER", description: "預估交通分鐘數" }
  },
  required: ["mode", "minutes"],
  propertyOrdering: ["mode", "minutes"]
};

const itemSchema = {
  type: "OBJECT",
  properties: {
    id: { type: "STRING", description: "此站的簡短識別碼" },
    type: {
      type: "STRING",
      enum: ["attraction", "restaurant", "hotel", "shopping"],
      description: "attraction 景點、restaurant 餐廳、hotel 住宿、shopping 購物"
    },
    name: { type: "STRING", description: "真實名稱" },
    description: { type: "STRING", description: "一句繁體中文介紹" },
    durationMinutes: { type: "INTEGER", description: "建議停留分鐘數" },
    cost: moneySchema,
    location: locationSchema,
    transportToNext: transportSchema
  },
  required: ["id", "type", "name", "description", "durationMinutes", "cost", "location", "transportToNext"],
  propertyOrdering: ["id", "type", "name", "description", "durationMinutes", "cost", "location", "transportToNext"]
};

const daySchema = {
  type: "OBJECT",
  properties: {
    dayIndex: { type: "INTEGER", description: "第幾天，從 1 開始" },
    date: { type: "STRING", description: "YYYY-MM-DD" },
    items: { type: "ARRAY", items: itemSchema, description: "當天由早到晚的站點" }
  },
  required: ["dayIndex", "date", "items"],
  propertyOrdering: ["dayIndex", "date", "items"]
};

const staySchema = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING", description: "真實飯店名稱" },
    checkIn: { type: "STRING", description: "入住日 YYYY-MM-DD" },
    checkOut: {
      type: "STRING",
      description: "退房日 YYYY-MM-DD。晚於入住日，且落在整趟開始日到結束日。續住到下一段時填下一段第一天"
    },
    nightly: { type: "INTEGER", description: "每晚全團整數價格，幣別與各站相同" },
    lat: { type: "NUMBER", description: "緯度" },
    lng: { type: "NUMBER", description: "經度" }
  },
  required: ["name", "checkIn", "checkOut", "nightly", "lat", "lng"],
  propertyOrdering: ["name", "checkIn", "checkOut", "nightly", "lat", "lng"]
};

const tripSchema = {
  type: "OBJECT",
  properties: {
    id: { type: "STRING" },
    destination: { type: "STRING" },
    startDate: { type: "STRING" },
    endDate: { type: "STRING" },
    travelers: { type: "INTEGER" },
    budget: moneySchema,
    interests: { type: "ARRAY", items: { type: "STRING" } },
    pace: { type: "STRING", enum: ["relaxed", "moderate", "packed"] },
    note: { type: "STRING" },
    days: { type: "ARRAY", items: daySchema },
    accommodations: { type: "ARRAY", items: staySchema, description: "這一段的住宿" }
  },
  required: ["id", "destination", "startDate", "endDate", "travelers", "budget", "interests", "pace", "days", "accommodations"],
  propertyOrdering: ["id", "destination", "startDate", "endDate", "travelers", "budget", "interests", "pace", "note", "days", "accommodations"]
};

const REQUEST_TIMEOUT_MS = 480000;
const CHUNK_DAYS = 2;
const KNOWN_CODES = new Set(["timeout", "network", "quota", "invalid", "config", "unavailable"]);

function fail(code, message, status) {
  const error = new Error(message);
  error.name = "PlanError";
  error.code = code;
  if (typeof status === "number" && status > 0) error.status = status;
  return error;
}

function modelName(env) {
  const name = env.GEMINI_MODEL;
  if (typeof name === "string" && name.trim() !== "") return name.trim();
  return "gemini-3.8-flash";
}

function fallbackModelName(env) {
  const name = env.GEMINI_FALLBACK_MODEL;
  if (typeof name === "string" && name.trim() !== "") return name.trim();
  return "";
}

function nextFallbackModel(env, activeModel, usedFallback, classified) {
  if (!classified || classified.status !== 503 || usedFallback) return "";
  const fallback = fallbackModelName(env);
  const primary = modelName(env);
  if (!fallback || fallback === primary) return "";
  if (activeModel !== primary) return "";
  return fallback;
}

function parseIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return utc;
}

function datePart(value) {
  if (typeof value !== "string") return "";
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match ? match[1] : "";
}

function addDays(isoDate, amount) {
  const start = parseIsoDate(isoDate);
  if (start === null) return isoDate;
  const next = new Date(start + amount * 86400000);
  const month = String(next.getUTCMonth() + 1).padStart(2, "0");
  const day = String(next.getUTCDate()).padStart(2, "0");
  return String(next.getUTCFullYear()) + "-" + month + "-" + day;
}

function inclusiveDays(start, end) {
  const from = parseIsoDate(start);
  const to = parseIsoDate(end);
  if (from === null || to === null || to < from) return 0;
  return Math.round((to - from) / 86400000) + 1;
}

function asInteger(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function clip(value, max) {
  const text = value.trim();
  if (text.length <= max) return text;
  return text.slice(0, max);
}

function createId() {
  return "p" + Math.random().toString(36).slice(2, 10);
}

function readBudget(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "請填寫預算金額與幣別。" };
  }
  const amount = asInteger(value.amount);
  if (amount === null || amount < 0 || amount > 100000000) {
    return { error: "預算請填 0 到 1 億的整數。" };
  }
  if (typeof value.currency !== "string" || !CURRENCIES.has(value.currency)) {
    return { error: "預算幣別請用 TWD、JPY、USD、KRW 或 EUR。" };
  }
  return { budget: { amount: amount, currency: value.currency } };
}

function readInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "請用 JSON 送出行程條件。" };
  }
  const destination = typeof body.destination === "string" ? body.destination.trim() : "";
  if (destination === "" || destination.length > 40) {
    return { error: "請填寫 40 字以內的目的地。" };
  }
  const startDate = typeof body.startDate === "string" ? body.startDate : "";
  const endDate = typeof body.endDate === "string" ? body.endDate : "";
  const dayCount = inclusiveDays(startDate, endDate);
  if (dayCount <= 0) return { error: "請填寫有效的出發日期與結束日期。" };
  if (dayCount > 30) return { error: "這一步最多先排 30 天。" };
  const travelers = asInteger(body.travelers);
  if (travelers === null || travelers < 1 || travelers > 20) {
    return { error: "人數請填 1 到 20 的整數。" };
  }
  const budget = readBudget(body.budget);
  if (budget.error) return { error: budget.error };
  if (!Array.isArray(body.interests)) return { error: "興趣請用陣列送出。" };
  if (body.interests.length > 7) return { error: "興趣最多選 7 項。" };
  const interests = [];
  for (let index = 0; index < body.interests.length; index += 1) {
    const item = body.interests[index];
    if (typeof item !== "string") return { error: "興趣請用文字送出。" };
    const name = item.trim();
    if (name === "" || name.length > 20) return { error: "每一項興趣請留在 20 字以內。" };
    interests.push(name);
  }
  if (body.pace !== "relaxed" && body.pace !== "moderate" && body.pace !== "packed") {
    return { error: "步調請選悠閒、適中或緊湊。" };
  }
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (note.length > 300) return { error: "補充說明請留在 300 字以內。" };
  const stays = readProvidedStays(body.stays);
  if (stays.error) return { error: stays.error };
  const rides = readProvidedRides(body.rides);
  if (rides.error) return { error: rides.error };
  const dates = [];
  for (let index = 0; index < dayCount; index += 1) dates.push(addDays(startDate, index));
  return {
    input: {
      destination: destination,
      startDate: startDate,
      endDate: endDate,
      dayCount: dayCount,
      dates: dates,
      travelers: travelers,
      budget: budget.budget,
      interests: interests,
      pace: body.pace,
      note: note,
      stays: stays.stays,
      rides: rides.rides
    }
  };
}

const INTERCITY_MODES = new Set(["flight", "train", "bus", "car", "ferry", "other"]);

function readProvidedStays(value) {
  if (value === undefined) return { stays: [] };
  if (!Array.isArray(value)) return { error: "住宿請用陣列送出。" };
  if (value.length > 20) return { error: "住宿請留在 20 筆以內。" };
  const stays = [];
  for (let index = 0; index < value.length; index += 1) {
    const row = value[index];
    if (!row || typeof row !== "object" || Array.isArray(row)) return { error: "住宿資料不正確。" };
    if (typeof row.name !== "string" || row.name.trim() === "") return { error: "住宿缺少名稱。" };
    const checkIn = typeof row.checkIn === "string" ? row.checkIn : "";
    const checkOut = typeof row.checkOut === "string" ? row.checkOut : "";
    if (parseIsoDate(checkIn) === null || parseIsoDate(checkOut) === null) return { error: "住宿日期不正確。" };
    const place = typeof row.location === "string" && row.location.trim() !== "" ? row.location.trim() : row.name.trim();
    let lat = null;
    let lng = null;
    const hasLat = row.lat !== undefined && row.lat !== null && row.lat !== "";
    const hasLng = row.lng !== undefined && row.lng !== null && row.lng !== "";
    if (hasLat || hasLng) {
      lat = asNumber(row.lat);
      lng = asNumber(row.lng);
      if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return { error: "住宿座標不正確。" };
      }
    }
    const note = typeof row.note === "string" ? clip(row.note.trim(), 300) : "";
    stays.push({
      name: clip(row.name, 80),
      place: clip(place, 80),
      checkIn: checkIn,
      checkOut: checkOut,
      note: note,
      lat: lat,
      lng: lng
    });
  }
  return { stays: stays };
}

function readProvidedRides(value) {
  if (value === undefined) return { rides: [] };
  if (!Array.isArray(value)) return { error: "大交通請用陣列送出。" };
  if (value.length > 40) return { error: "大交通請留在 40 筆以內。" };
  const rides = [];
  for (let index = 0; index < value.length; index += 1) {
    const row = value[index];
    if (!row || typeof row !== "object" || Array.isArray(row)) return { error: "大交通資料不正確。" };
    if (!INTERCITY_MODES.has(row.mode)) return { error: "大交通方式不正確。" };
    if (typeof row.from !== "string" || row.from.trim() === "" || typeof row.to !== "string" || row.to.trim() === "") {
      return { error: "大交通缺少出發地或目的地。" };
    }
    const departAt = typeof row.departAt === "string" ? row.departAt.trim() : "";
    if (datePart(departAt) === "") return { error: "大交通缺少出發時間。" };
    const arriveAt = typeof row.arriveAt === "string" ? row.arriveAt.trim() : "";
    rides.push({
      mode: row.mode,
      from: clip(row.from, 80),
      to: clip(row.to, 80),
      departAt: departAt.slice(0, 40),
      arriveAt: arriveAt.slice(0, 40)
    });
  }
  return { rides: rides };
}

function readWhole(value) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function readAvoidNames(value) {
  if (value === undefined) return { names: [] };
  if (!Array.isArray(value)) return { error: "已去過的地點請用陣列送出。" };
  if (value.length > 80) return { error: "已去過的地點太多，請留在 80 個以內。" };
  const names = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (typeof item !== "string") return { error: "已去過的地點請用文字送出。" };
    const name = clip(item, 80);
    if (name !== "") names.push(name);
  }
  return { names: names };
}

function readSegment(body, dayCount) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "請用 JSON 送出行程條件。" };
  }
  const hasStart = Object.prototype.hasOwnProperty.call(body, "chunkStart");
  const hasCount = Object.prototype.hasOwnProperty.call(body, "chunkDays");
  if (!hasStart && !hasCount) return { chunk: null };
  if (!hasStart) return { error: "請一併提供這一段從第幾天開始。" };
  const start = readWhole(body.chunkStart);
  if (start === null || start < 0 || start >= dayCount) {
    return { error: "這一段的起點不在行程裡。" };
  }
  let count = Math.min(CHUNK_DAYS, dayCount - start);
  if (hasCount) {
    const requested = readWhole(body.chunkDays);
    if (requested === null || requested < 1 || requested > CHUNK_DAYS) {
      return { error: "每一段請指定 1 到 2 天。" };
    }
    if (start + requested > dayCount) return { error: "這一段超出行程結束日。" };
    count = requested;
  }
  const avoid = readAvoidNames(body.avoidNames);
  if (avoid.error) return { error: avoid.error };
  if (Object.prototype.hasOwnProperty.call(body, "useFallback") && typeof body.useFallback !== "boolean") {
    return { error: "是否改用備用模型請用布林值送出。" };
  }
  return {
    chunk: {
      start: start,
      count: count,
      avoidNames: avoid.names,
      useFallback: body.useFallback === true
    }
  };
}

function paceLine(pace) {
  if (pace === "relaxed") return "悠閒，每天 3 站（含餐廳）";
  if (pace === "packed") return "緊湊，每天 6 站（含餐廳）";
  return "適中，每天 4 到 5 站（含餐廳）";
}

function sliceInput(input, start, count) {
  const dates = input.dates.slice(start, start + count);
  return {
    destination: input.destination,
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    dayCount: dates.length,
    dates: dates,
    travelers: input.travelers,
    budget: input.budget,
    interests: input.interests.slice(),
    pace: input.pace,
    note: input.note,
    dayOffset: start,
    totalDays: input.dayCount,
    tripStart: input.startDate,
    tripEnd: input.endDate,
    stays: input.stays || [],
    rides: input.rides || []
  };
}

function staysForDates(stays, dates) {
  if (!dates.length) return [];
  const previous = addDays(dates[0], -1);
  const last = dates[dates.length - 1];
  const picked = [];
  for (let index = 0; index < stays.length; index += 1) {
    const stay = stays[index];
    if (stay && stay.checkIn <= last && stay.checkOut > previous) picked.push(stay);
  }
  return picked;
}

function ridesForDates(rides, dates) {
  const wanted = {};
  for (let index = 0; index < dates.length; index += 1) wanted[dates[index]] = true;
  const picked = [];
  for (let index = 0; index < rides.length; index += 1) {
    const ride = rides[index];
    if (!ride) continue;
    if (wanted[datePart(ride.departAt)] === true || wanted[datePart(ride.arriveAt)] === true) picked.push(ride);
  }
  return picked;
}

function rideModeLabel(mode) {
  if (mode === "flight") return "飛機";
  if (mode === "train") return "新幹線或火車";
  if (mode === "bus") return "巴士";
  if (mode === "car") return "汽車";
  if (mode === "ferry") return "渡輪";
  return "其他交通";
}

const CITY_RULES = [
  { label: "白川鄉", keys: ["白川鄉", "白川郷", "白川乡", "shirakawa"] },
  { label: "高山", keys: ["高山", "takayama", "hida"] },
  { label: "富山", keys: ["富山", "toyama"] },
  { label: "金澤", keys: ["金澤", "金沢", "kanazawa"] },
  { label: "名古屋", keys: ["名古屋", "nagoya", "中部國際機場", "中部国际机场", "中部國際空港", "中部空港", "centrair", "chubu"] },
  { label: "大阪", keys: ["大阪", "osaka", "關西", "关西", "kansai"] },
  { label: "加賀", keys: ["加賀", "加贺", "kaga"] },
  { label: "東京", keys: ["東京", "东京", "tokyo"] },
  { label: "京都", keys: ["京都", "kyoto"] },
  { label: "奈良", keys: ["奈良", "nara"] },
  { label: "福井", keys: ["福井", "fukui"] },
  { label: "立山", keys: ["立山", "tateyama"] }
];

function stayCities(stay) {
  const text = [stay.name || "", stay.place || "", stay.note || ""].join(" ").toLowerCase();
  const found = [];
  for (let index = 0; index < CITY_RULES.length; index += 1) {
    const rule = CITY_RULES[index];
    let hit = false;
    for (let keyIndex = 0; keyIndex < rule.keys.length; keyIndex += 1) {
      if (text.indexOf(rule.keys[keyIndex].toLowerCase()) >= 0) {
        hit = true;
        break;
      }
    }
    if (hit) found.push(rule.label);
  }
  return found;
}

function describeProvidedStay(stay) {
  const cities = stayCities(stay);
  const cityText = cities.length > 0 ? "城市：" + cities.join("、") : "名稱和備註沒有對出城市";
  return stay.name + "（" + cityText + "；" + stay.checkIn + " 入住，" + stay.checkOut + " 退房）";
}

function dayPlaceLine(date, stays) {
  const tonight = [];
  const leaving = [];
  const cities = [];
  for (let index = 0; index < stays.length; index += 1) {
    const stay = stays[index];
    if (!stay || !(stay.checkOut > stay.checkIn)) continue;
    const labels = stayCities(stay);
    const covers = stay.checkIn <= date && date < stay.checkOut;
    if (covers) tonight.push(stay);
    else if (stay.checkOut === date) leaving.push(stay);
    else continue;
    for (let cityIndex = 0; cityIndex < labels.length; cityIndex += 1) {
      if (cities.indexOf(labels[cityIndex]) < 0) cities.push(labels[cityIndex]);
    }
  }
  const later = [];
  for (let index = 0; index < stays.length; index += 1) {
    const stay = stays[index];
    if (!stay || stay.checkIn <= date) continue;
    const labels = stayCities(stay);
    for (let cityIndex = 0; cityIndex < labels.length; cityIndex += 1) {
      const city = labels[cityIndex];
      if (cities.indexOf(city) >= 0) continue;
      let known = null;
      for (let laterIndex = 0; laterIndex < later.length; laterIndex += 1) {
        if (later[laterIndex].city === city) known = later[laterIndex];
      }
      if (!known) later.push({ city: city, checkIn: stay.checkIn });
      else if (stay.checkIn < known.checkIn) known.checkIn = stay.checkIn;
    }
  }
  const parts = [];
  if (leaving.length > 0) parts.push("早上離開 " + leaving.map(describeProvidedStay).join("、"));
  if (tonight.length > 0) parts.push((leaving.length > 0 ? "晚上住 " : "住 ") + tonight.map(describeProvidedStay).join("、"));
  let rule = "";
  if (tonight.length === 0 && leaving.length === 0) {
    rule = "這天沒有已填的住宿。不要自行安排到其他已填住宿的城市。";
  } else if (leaving.length > 0 && tonight.length > 0) {
    const where = cities.length > 0 ? cities.join("、") : "這兩間住宿的城市";
    rule = "這天換飯店，只往一個方向：先排前一晚住宿的城市，長程移動一次，再排今晚住宿的城市，不要來回。城市可以是" + where + "。";
  } else if (cities.length > 0) {
    rule = "景點必須在" + cities.join("或") + "，或這間住宿附近。";
  } else {
    rule = "景點必須在這間住宿附近，不要排到別的城市。";
  }
  if (later.length > 0) {
    rule += "不可排這天還沒入住的城市：" + later.map(function (row) {
      return row.city + "（" + row.checkIn + " 入住）";
    }).join("、") + "。";
  }
  if (parts.length === 0) return date + "：" + rule;
  return date + "：" + parts.join("，") + "。" + rule;
}

function scheduleLines(slice) {
  const stays = staysForDates(slice.stays || [], slice.dates);
  const rides = ridesForDates(slice.rides || [], slice.dates);
  const lines = [
    "排程規則（優先於每天站數）：",
    "每天約 09:00 從前一晚的住宿出發，最後回到當晚住宿。午餐必須在 11:30–13:30 抵達，晚餐必須在 17:30–19:30 抵達。長程移動（例如換城市、車程超過 40 分鐘）安排在早上出發之後或午餐結束之後，並寫出大約的交通分鐘數，不要讓長程移動跨過整個用餐時段。若住宿備註或使用者補充寫了含早餐，不要在 09:00–11:00 安排正餐餐廳。",
    "換飯店那天只往一個方向：先排前一晚住宿的城市，長程移動一次，再排今晚住宿的城市，同一天不要來回。景點不可排到入住日晚於這一天的城市。城市以飯店名稱與備註裡的地名為準，兩邊都算。若座標和寫出的城市不在同一帶，以城市為準，不要跟著座標排到別的城市。入住日與退房日沿用使用者填的日期，不可自行推算。",
    "飛機：起飛前 3 小時到抵達後 1.5 小時不排景點。抵達時間在 18:00 以後不排景點；加上 1.5 小時後若晚於 19:30，那天只放 1 個 type 為 hotel 的入住站，否則只放 1 間晚餐餐廳。",
    "新幹線、巴士、渡輪、汽車與其他大交通：出發前 1 小時到抵達後 30 分鐘不排景點，移動時間算進當天。",
    "出發日要在上面的緩衝時間之前結束。最後一站前往該筆交通所填的出發地，不要改成別的城市。"
  ];
  if (stays.length === 0) {
    lines.push("這一段沒有使用者已訂的住宿，請自行安排並寫進 accommodations。");
  } else {
    lines.push("使用者已訂住宿，請沿用名稱與入住退房日，不要改成別間：");
    for (let index = 0; index < stays.length; index += 1) {
      const stay = stays[index];
      const where = stay.place ? "，地點：" + stay.place : "";
      const memo = stay.note ? "，備註：" + stay.note : "";
      const point = stay.lat !== null && stay.lng !== null ? "，座標 " + String(stay.lat) + "," + String(stay.lng) : "";
      lines.push("- " + stay.name + where + memo + "，入住 " + stay.checkIn + "，退房 " + stay.checkOut + point);
    }
  }
  if (rides.length === 0) {
    lines.push("這一段沒有使用者已填的大交通。");
  } else {
    lines.push("使用者已填的大交通，必須遵守時間，不可把景點排進車程：");
    for (let index = 0; index < rides.length; index += 1) {
      const ride = rides[index];
      const arrive = ride.arriveAt ? "，" + ride.arriveAt + " 抵達" : "";
      lines.push("- " + rideModeLabel(ride.mode) + " " + ride.from + " → " + ride.to + "，" + ride.departAt + " 出發" + arrive);
    }
  }
  const allStays = slice.stays || [];
  lines.push("下面每一天的住宿與城市優先於每天站數。入住日、退房日以使用者填的為準，不可改、不可自行推算。若大交通規則判定這天沒有可排時段，只放入住，不要排景點；城市只說明人在哪裡：");
  for (let index = 0; index < slice.dates.length; index += 1) {
    lines.push("- " + dayPlaceLine(slice.dates[index], allStays));
  }
  return lines;
}

function shareAmount(slice) {
  if (slice.budget.amount === 0 || slice.totalDays <= 0) return 0;
  return Math.max(1, Math.round(slice.budget.amount * slice.dayCount / slice.totalDays));
}

function userPrompt(slice, retryNote, avoidNames) {
  const dates = slice.dates.map(function (date, index) {
    return "第 " + String(slice.dayOffset + index + 1) + " 天：" + date;
  }).join("\n");
  const interests = slice.interests.length > 0 ? slice.interests.join("、") : "沒有特別指定";
  const note = slice.note !== "" ? slice.note : "（沒有補充）";
  const fromDay = slice.dayOffset + 1;
  const toDay = slice.dayOffset + slice.dayCount;
  const lines = [
    "請只產生下面列出的這一段，days 長度必須正好是 " + String(slice.dayCount) + "。",
    "這一段是整趟第 " + String(fromDay) + " 天到第 " + String(toDay) + " 天。",
    "整趟行程：" + slice.destination + "，" + slice.tripStart + " 到 " + slice.tripEnd + "，共 " + String(slice.totalDays) + " 天。",
    "這一段的日期：",
    dates,
    "人數：" + String(slice.travelers),
    "整趟預算：" + String(slice.budget.amount) + " " + slice.budget.currency + "（全團）。這一段請控制在大約 " +
      String(shareAmount(slice)) + " " + slice.budget.currency + " 以內。",
    "興趣：" + interests,
    "步調：" + paceLine(slice.pace),
    "想告訴 AI 的話：" + note,
    "同一天請從住宿或抵達處沿單一方向排，不要折返。換飯店只往一個方向：先排前一晚的城市，長程移動一次，再排今晚的城市。每天約 09:00 出發。午餐必須在 11:30–13:30 抵達，晚餐必須在 17:30–19:30 抵達，兩餐中間要有其他站。長程移動安排在早上或午餐後，並寫出大約的交通分鐘數。含早餐時不要在 09:00–11:00 安排正餐餐廳。"
  ];
  const schedule = scheduleLines(slice);
  for (let index = 0; index < schedule.length; index += 1) lines.push(schedule[index]);
  if (avoidNames.length > 0) {
    lines.push("下列景點、餐廳、商店已經排過，這一段不可再用同一個名稱。住宿可以相同：" + avoidNames.join("、"));
  }
  if (retryNote) lines.push(retryNote);
  return lines.join("\n");
}

function readTransport(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (!TRANSPORT_MODES.has(value.mode)) return null;
  const minutes = asInteger(value.minutes);
  if (minutes === null || minutes < 1 || minutes > 240) return null;
  return { mode: value.mode, minutes: minutes };
}

function readItem(value, isLast) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "站點不是物件" };
  if (!PLACE_TYPES.has(value.type)) return { error: "站點類型不正確" };
  if (typeof value.name !== "string" || value.name.trim() === "") return { error: "站點缺少名稱" };
  if (typeof value.description !== "string" || value.description.trim() === "") return { error: "站點缺少介紹" };
  const durationMinutes = asInteger(value.durationMinutes);
  if (durationMinutes === null || durationMinutes < 1 || durationMinutes > 720) return { error: "停留時間不正確" };
  if (!value.cost || typeof value.cost !== "object" || Array.isArray(value.cost)) return { error: "站點缺少費用" };
  const amount = asInteger(value.cost.amount);
  if (amount === null || amount < 0 || amount > 100000000) return { error: "費用金額不正確" };
  if (typeof value.cost.currency !== "string" || !/^[A-Za-z]{3}$/.test(value.cost.currency)) {
    return { error: "費用幣別不正確" };
  }
  if (!value.location || typeof value.location !== "object" || Array.isArray(value.location)) {
    return { error: "站點缺少座標" };
  }
  const lat = asNumber(value.location.lat);
  const lng = asNumber(value.location.lng);
  if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { error: "座標超出範圍" };
  }
  const locationName = typeof value.location.name === "string" && value.location.name.trim() !== ""
    ? value.location.name
    : value.name;
  const transport = readTransport(value.transportToNext);
  if (!isLast && !transport) return { error: "缺少前往下一站的交通" };
  const item = {
    id: createId(),
    type: value.type,
    name: clip(value.name, 80),
    description: clip(value.description, 180),
    durationMinutes: durationMinutes,
    cost: { amount: amount, currency: value.cost.currency.toUpperCase() },
    location: { name: clip(locationName, 80), lat: lat, lng: lng }
  };
  if (!isLast && transport) item.transportToNext = transport;
  return { item: item };
}

function stayCurrency(days, fallback) {
  for (let dayIndex = 0; dayIndex < days.length; dayIndex += 1) {
    const items = days[dayIndex].items;
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const currency = items[itemIndex].cost.currency;
      if (typeof currency === "string" && /^[A-Z]{3}$/.test(currency)) return currency;
    }
  }
  return fallback;
}

function roomCount(travelers) {
  const count = Math.ceil(Number(travelers) / 2);
  if (!Number.isFinite(count) || count < 1) return 1;
  if (count > 20) return 20;
  return count;
}

function coordinateOrNull(lat, lng) {
  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat: lat, lng: lng };
}

function readStay(value, bounds, currency, rooms) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (typeof value.name !== "string" || value.name.trim() === "") return null;
  const checkIn = typeof value.checkIn === "string" ? value.checkIn.trim() : "";
  const checkOut = typeof value.checkOut === "string" ? value.checkOut.trim() : "";
  if (parseIsoDate(checkIn) === null || parseIsoDate(checkOut) === null) return null;
  if (!(checkOut > checkIn)) return null;
  if (checkIn < bounds.start || checkOut > bounds.end) return null;
  const amount = asInteger(value.nightly);
  const price = amount === null || amount < 0 ? 0 : Math.min(amount, 100000000);
  const name = clip(value.name, 40);
  const point = coordinateOrNull(asNumber(value.lat), asNumber(value.lng));
  const location = { name: name };
  if (point) {
    location.lat = point.lat;
    location.lng = point.lng;
  }
  return {
    id: createId(),
    name: name,
    location: location,
    checkIn: checkIn,
    checkOut: checkOut,
    pricePerNight: { amount: price, currency: currency },
    rooms: rooms
  };
}

function readStays(raw, bounds, currency, rooms) {
  if (!Array.isArray(raw)) return [];
  const stays = [];
  for (let index = 0; index < raw.length; index += 1) {
    const stay = readStay(raw[index], bounds, currency, rooms);
    if (stay) stays.push(stay);
  }
  return stays;
}

function stayMapped(stay) {
  return coordinateOrNull(
    typeof stay.location.lat === "number" ? stay.location.lat : null,
    typeof stay.location.lng === "number" ? stay.location.lng : null
  ) !== null;
}

function mergeStays(list) {
  const merged = [];
  for (let index = 0; index < list.length; index += 1) {
    const stay = list[index];
    const key = placeKey(stay.name);
    let target = null;
    for (let inner = 0; inner < merged.length; inner += 1) {
      const existing = merged[inner];
      if (placeKey(existing.name) !== key) continue;
      if (existing.checkIn <= stay.checkOut && stay.checkIn <= existing.checkOut) {
        target = existing;
        break;
      }
    }
    if (!target) {
      merged.push(stay);
      continue;
    }
    if (stay.checkIn < target.checkIn) target.checkIn = stay.checkIn;
    if (stay.checkOut > target.checkOut) target.checkOut = stay.checkOut;
    if (!stayMapped(target) && stayMapped(stay)) {
      target.location.lat = stay.location.lat;
      target.location.lng = stay.location.lng;
    }
  }
  return merged;
}

function normalizePlan(raw, input) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "回傳不是物件" };
  if (!Array.isArray(raw.days)) return { error: "缺少 days" };
  if (raw.days.length !== input.dayCount) {
    return { error: "天數是 " + String(raw.days.length) + "，應為 " + String(input.dayCount) };
  }
  const days = [];
  for (let index = 0; index < raw.days.length; index += 1) {
    const day = raw.days[index];
    if (!day || typeof day !== "object" || Array.isArray(day) || !Array.isArray(day.items)) {
      return { error: "第 " + String(index + 1) + " 天缺少 items" };
    }
    if (day.items.length < 1 || day.items.length > 12) {
      return { error: "第 " + String(index + 1) + " 天的站數無法使用" };
    }
    const items = [];
    for (let itemIndex = 0; itemIndex < day.items.length; itemIndex += 1) {
      const read = readItem(day.items[itemIndex], itemIndex === day.items.length - 1);
      if (!read.item) return { error: "第 " + String(index + 1) + " 天：" + read.error };
      items.push(read.item);
    }
    days.push({
      dayIndex: index + 1,
      date: input.dates[index],
      items: items
    });
  }
  const plan = {
    id: createId(),
    destination: input.destination,
    startDate: input.startDate,
    endDate: input.endDate,
    travelers: input.travelers,
    budget: { amount: input.budget.amount, currency: input.budget.currency },
    interests: input.interests.slice(),
    pace: input.pace,
    days: days,
    accommodations: readStays(raw.accommodations, {
      start: input.tripStart || input.startDate,
      end: input.tripEnd || input.endDate
    }, stayCurrency(days, input.budget.currency), roomCount(input.travelers))
  };
  if (input.note !== "") plan.note = input.note;
  return { plan: plan };
}

function statusOf(error) {
  if (!error || typeof error !== "object") return 0;
  if (typeof error.status === "number") return error.status;
  if (typeof error.code === "number") return error.code;
  return 0;
}

function describeError(error, depth) {
  const level = depth || 0;
  if (error === null || error === undefined) {
    return { type: String(error), status: 0, message: String(error) };
  }
  const typeName = error.constructor && typeof error.constructor.name === "string"
    ? error.constructor.name
    : typeof error;
  const message = error instanceof Error ? error.message : String(error);
  const detail = {
    type: typeName,
    name: typeof error.name === "string" ? error.name : "",
    status: statusOf(error),
    code: error.code !== undefined ? error.code : "",
    message: message
  };
  if (typeof error.statusText === "string" && error.statusText !== "") detail.statusText = error.statusText;
  if (typeof error.timeoutMs === "number") detail.timeoutMs = error.timeoutMs;
  if (error.cause && level < 3) detail.cause = describeError(error.cause, level + 1);
  return detail;
}

function logPlanError(label, error) {
  console.error(label, JSON.stringify(describeError(error)));
}

function errorText(error) {
  const parts = [];
  let current = error;
  let depth = 0;
  while (current && depth < 4) {
    parts.push(current instanceof Error ? current.message : String(current));
    if (typeof current.name === "string") parts.push(current.name);
    if (typeof current.code === "string") parts.push(current.code);
    current = current.cause;
    depth += 1;
  }
  return parts.join("\n");
}

function classifyGeminiError(error) {
  const status = statusOf(error);
  const text = errorText(error);
  if (error && typeof error.timeoutMs === "number") {
    return fail("timeout", "等待 AI 回覆超過 " + String(Math.round(error.timeoutMs / 1000)) + " 秒，請再試一次。", status);
  }
  if (status === 408 || status === 504 || /AbortError|TimeoutError|DEADLINE_EXCEEDED|ETIMEDOUT|timed out|operation was aborted/i.test(text)) {
    return fail("timeout", "等待 AI 回覆逾時，請再試一次。", status);
  }
  if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(text)) {
    return fail("quota", "免費額度目前用完了，或短時間內請求太多次。可以先改用示範資料。", status);
  }
  if ((status === 400 && /API key not valid|API_KEY_INVALID/i.test(text)) || status === 401 || status === 403) {
    return fail("config", "API 金鑰無法使用。請檢查 Cloudflare Secret 的設定。", status);
  }
  if (status === 404 || /unknown model|is not supported|model .* not found/i.test(text)) {
    return fail("config", "找不到 GEMINI_MODEL 指定的模型。請打開 README，改成 AI Studio 裡看得到的 Flash 模型名稱。", status);
  }
  if (status >= 400 && status < 500) {
    return fail("invalid", "AI 服務沒有接受這次請求。可以再試一次，或先改用示範資料。", status);
  }
  if (status >= 500) {
    return fail("unavailable", "AI 服務暫時無法回應，請稍後再試。", status);
  }
  if (/ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|EPIPE|UND_ERR_|fetch failed|socket hang up/i.test(text)) {
    return fail("network", "連不到 AI 服務，請檢查網路後再試。", status);
  }
  return null;
}

function withTimeout(promise, ms, controller) {
  return new Promise(function (resolve, reject) {
    const timer = setTimeout(function () {
      const error = fail("timeout", "等待 AI 回覆超過 " + String(Math.round(ms / 1000)) + " 秒，請再試一次。");
      error.timeoutMs = ms;
      if (controller) controller.abort();
      logPlanError("plan timeout object:", error);
      reject(error);
    }, ms);
    promise.then(function (value) {
      clearTimeout(timer);
      resolve(value);
    }, function (error) {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function responseMeta(response) {
  const candidate = response && Array.isArray(response.candidates) ? response.candidates[0] : null;
  const finishReason = candidate && typeof candidate.finishReason === "string" ? candidate.finishReason : "";
  const text = response && typeof response.text === "string" ? response.text : "";
  return { finishReason: finishReason, text: text };
}

function placeKey(name) {
  return name.trim().toLowerCase().replace(/\s+/g, "");
}

function duplicatePlace(days, avoidNames) {
  const seen = new Set();
  for (let index = 0; index < avoidNames.length; index += 1) seen.add(placeKey(avoidNames[index]));
  for (let dayIndex = 0; dayIndex < days.length; dayIndex += 1) {
    const items = days[dayIndex].items;
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const item = items[itemIndex];
      if (item.type === "hotel") continue;
      const key = placeKey(item.name);
      if (key === "") continue;
      if (seen.has(key)) return item.name;
      seen.add(key);
    }
  }
  return "";
}

function takeDays(plan, offset, dates) {
  const days = [];
  for (let index = 0; index < plan.days.length; index += 1) {
    days.push({
      dayIndex: offset + index + 1,
      date: dates[offset + index],
      items: plan.days[index].items
    });
  }
  return days;
}

function rememberPlaces(days, avoidNames) {
  for (let dayIndex = 0; dayIndex < days.length; dayIndex += 1) {
    const items = days[dayIndex].items;
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const item = items[itemIndex];
      if (item.type === "hotel") continue;
      avoidNames.push(item.name);
    }
  }
}

function assemblePlan(input, days) {
  const plan = {
    id: createId(),
    destination: input.destination,
    startDate: input.startDate,
    endDate: input.endDate,
    travelers: input.travelers,
    budget: { amount: input.budget.amount, currency: input.budget.currency },
    interests: input.interests.slice(),
    pace: input.pace,
    days: days
  };
  if (input.note !== "") plan.note = input.note;
  return plan;
}

function responseText(body) {
  const candidates = body && Array.isArray(body.candidates) ? body.candidates : null;
  const first = candidates && candidates[0] ? candidates[0] : null;
  const parts = first && first.content && Array.isArray(first.content.parts) ? first.content.parts : [];
  let text = "";
  let any = false;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (!part || typeof part.text !== "string") continue;
    if (part.thought === true) continue;
    any = true;
    text += part.text;
  }
  return any ? text : "";
}

async function requestModel(apiKey, contents, model) {
  const controller = new AbortController();
  const promise = fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      redirect: "manual",
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: contents }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 32768,
          responseMimeType: "application/json",
          responseSchema: tripSchema,
          thinkingConfig: { thinkingLevel: "LOW" }
        }
      }),
      signal: controller.signal
    }
  ).then(async function (response) {
    if (response.status >= 300 && response.status < 400) {
      const error = new Error("上游要求重新導向（HTTP " + String(response.status) + "），已停止跟隨。");
      error.status = response.status;
      throw error;
    }
    const raw = await response.text();
    let parsed = null;
    if (raw !== "") {
      try {
        parsed = JSON.parse(raw);
      } catch (parseError) {
        parsed = null;
      }
    }
    if (!response.ok) {
      const apiMessage = parsed && parsed.error && typeof parsed.error.message === "string" ? parsed.error.message : "";
      const apiStatus = parsed && parsed.error && typeof parsed.error.status === "string" ? parsed.error.status : "";
      const error = new Error(apiMessage !== "" ? apiMessage + "\n" + apiStatus : "HTTP " + String(response.status));
      error.status = response.status;
      throw error;
    }
    return {
      candidates: parsed && parsed.candidates,
      text: responseText(parsed)
    };
  });
  return withTimeout(promise, REQUEST_TIMEOUT_MS, controller);
}

function publicErrorDetail(error) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const cleaned = message
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned === "") return "";
  return cleaned.length > 240 ? cleaned.slice(0, 240) + "…" : cleaned;
}

function asPlanError(error) {
  logPlanError("plan error object:", error);
  if (error && KNOWN_CODES.has(error.code)) return error;
  const classified = classifyGeminiError(error);
  const detail = publicErrorDetail(error);
  if (classified) {
    if (detail !== "" && classified.message.indexOf(detail) === -1) {
      return fail(classified.code, classified.message + " " + detail, statusOf(classified) || statusOf(error));
    }
    return classified;
  }
  const message = detail !== ""
    ? "AI 服務沒有完成這次行程：" + detail
    : "AI 服務沒有完成這次行程。可以再試一次，或先改用示範資料。";
  return fail("unavailable", message, statusOf(error));
}

function wait(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

async function generateChunk(env, apiKey, input, start, count, avoidNames, preferFallback) {
  const slice = sliceInput(input, start, count);
  let retryNote = "";
  let formatAttempts = 0;
  let demandAttempts = 0;
  let timeoutAttempts = 0;
  let round = 0;
  const primary = modelName(env);
  const fallback = fallbackModelName(env);
  let activeModel = primary;
  let usedFallback = false;
  if (preferFallback && fallback && fallback !== primary) {
    activeModel = fallback;
    usedFallback = true;
  }
  while (formatAttempts < 2) {
    round += 1;
    const started = Date.now();
    console.log("plan chunk", String(start + 1) + "-" + String(start + count), "attempt", String(round), activeModel);
    let response = null;
    try {
      response = await requestModel(apiKey, userPrompt(slice, retryNote, avoidNames), activeModel);
    } catch (error) {
      const classified = asPlanError(error);
      const nextModel = nextFallbackModel(env, activeModel, usedFallback, classified);
      if (nextModel) {
        usedFallback = true;
        activeModel = nextModel;
        console.error("plan chunk fallback", nextModel);
        continue;
      }
      if (classified.status === 503 && usedFallback) throw classified;
      if ((classified.code === "unavailable" || classified.code === "network") && demandAttempts < 3) {
        demandAttempts += 1;
        console.error("plan chunk retry", classified.code);
        await wait(5000 * demandAttempts);
        continue;
      }
      if (classified.code === "timeout" && timeoutAttempts < 1) {
        timeoutAttempts += 1;
        console.error("plan chunk retry", classified.code);
        continue;
      }
      throw classified;
    }
    formatAttempts += 1;
    const meta = responseMeta(response);
    console.log(
      "plan chunk response",
      meta.finishReason || "none",
      String(meta.text.length) + " chars",
      String(Date.now() - started) + "ms"
    );
    if (meta.finishReason === "MAX_TOKENS") {
      retryNote = "上次輸出因長度被截斷。請縮短每站介紹，並且正好輸出 " + String(slice.dayCount) + " 天。";
      console.error("plan rejected: 輸出被截斷", meta.text.length);
      continue;
    }
    let parsed = null;
    try {
      parsed = JSON.parse(meta.text);
    } catch (parseError) {
      retryNote = "上次不是合法 JSON。請正好輸出 " + String(slice.dayCount) + " 天，且每一天都要有地點。";
      console.error("plan rejected: JSON 無法解析", "length", meta.text.length, "finish", meta.finishReason || "none");
      continue;
    }
    const normalized = normalizePlan(parsed, slice);
    if (!normalized.plan) {
      retryNote = "上次輸出沒有通過檢查：" + normalized.error +
        "。這次請正好輸出 " + String(slice.dayCount) +
        " 天，每一天都要有地點，而且除了每天最後一站以外，每一站都要有合法的 transportToNext。";
      console.error("plan rejected:", normalized.error);
      continue;
    }
    const clash = duplicatePlace(normalized.plan.days, avoidNames);
    if (clash) {
      retryNote = "地點「" + clash + "」和別天重複。請改成這一段還沒去過的景點、餐廳或商店，住宿可以相同。";
      console.error("plan rejected: 景點重複", clash);
      continue;
    }
    return {
      days: takeDays(normalized.plan, start, input.dates),
      stays: normalized.plan.accommodations || [],
      usedFallback: usedFallback
    };
  }
  throw fail("invalid", "AI 回傳的行程格式不正確。可以再試一次，或先改用示範資料。");
}

async function generatePlan(env, apiKey, input) {
  
  const days = [];
  const stays = [];
  const avoidNames = [];
  let start = 0;
  while (start < input.dayCount) {
    const count = Math.min(CHUNK_DAYS, input.dayCount - start);
    const chunk = await generateChunk(env, apiKey, input, start, count, avoidNames);
    for (let index = 0; index < chunk.days.length; index += 1) days.push(chunk.days[index]);
    for (let index = 0; index < chunk.stays.length; index += 1) stays.push(chunk.stays[index]);
    rememberPlaces(chunk.days, avoidNames);
    start += count;
  }
  const plan = assemblePlan(input, days);
  plan.accommodations = mergeStays(stays);
  return plan;
}


const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const GEO_UA = "NGO-W2-AI-Planner/1.0 (student course project)";
const GEO_GAP_MS = 1000;
const GEO_TIMEOUT_MS = 8000;
let geoLast = 0;

async function lookupNominatim(name, city) {
  const pause = GEO_GAP_MS - (Date.now() - geoLast);
  if (pause > 0) await wait(pause);
  geoLast = Date.now();
  const params = new URLSearchParams({
    q: name + ", " + city,
    format: "jsonv2",
    limit: "1",
    addressdetails: "0"
  });
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, GEO_TIMEOUT_MS);
  try {
    const response = await fetch(NOMINATIM + "?" + params.toString(), {
      headers: {
        "User-Agent": GEO_UA,
        Accept: "application/json"
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error("nominatim " + String(response.status));
    const payload = await response.json();
    if (!Array.isArray(payload) || !payload[0]) return null;
    const lat = Number(payload[0].lat);
    const lng = Number(payload[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    if (lat === 0 && lng === 0) return null;
    return { lat: lat, lng: lng };
  } finally {
    clearTimeout(timer);
  }
}

function originList(env) {
  const raw = typeof env.ALLOWED_ORIGINS === "string" ? env.ALLOWED_ORIGINS : "";
  const list = [];
  const parts = raw.split(",");
  for (let index = 0; index < parts.length; index += 1) {
    const item = parts[index].trim();
    if (item !== "") list.push(item);
  }
  return list;
}

function originAllowed(env, origin) {
  if (origin === "") return false;
  return originList(env).indexOf(origin) !== -1;
}

function json(origin, status, payload) {
  return new Response(JSON.stringify(payload), {
    status: status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Planner-Pass",
      Vary: "Origin"
    }
  });
}

function tokensEqual(left, right) {
  const a = String(left);
  const b = String(right);
  const length = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let index = 0; index < length; index += 1) {
    const ac = index < a.length ? a.charCodeAt(index) : 0;
    const bc = index < b.length ? b.charCodeAt(index) : 0;
    diff |= ac ^ bc;
  }
  return diff === 0;
}

function checkPasscode(origin, request, env) {
  const expected = typeof env.PLAN_PASS === "string" ? env.PLAN_PASS : "";
  if (expected === "") {
    return json(origin, 500, { error: "伺服器還沒有設定通行碼。", code: "config" });
  }
  const given = request.headers.get("X-Planner-Pass") || "";
  if (!tokensEqual(given, expected)) {
    return json(origin, 401, { error: "通行碼不正確。", code: "unauthorized" });
  }
  return null;
}

function taipeiDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

async function reserveCall(env) {
  const parsedLimit = Number(env.DAILY_LIMIT);
  const cap = Number.isFinite(parsedLimit) && parsedLimit >= 1 ? Math.floor(parsedLimit) : 30;
  if (!env.PLAN_USAGE || typeof env.PLAN_USAGE.get !== "function") {
    return { ok: false, status: 500, error: "還沒設定每日次數的儲存空間。", code: "config" };
  }
  const key = "plan:" + taipeiDate();
  try {
    const raw = await env.PLAN_USAGE.get(key);
    const value = raw === null ? 0 : Number(raw);
    const current = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    if (current >= cap) {
      return { ok: false, status: 429, error: "今天的產生次數已用完。", code: "quota" };
    }
    await env.PLAN_USAGE.put(key, String(current + 1), { expirationTtl: 172800 });
  } catch (error) {
    console.error("plan quota storage failed");
    return { ok: false, status: 500, error: "今天的次數暫時查不到，請稍後再試。", code: "unavailable" };
  }
  return { ok: true };
}

async function handleGeocode(origin, url) {
  const name = (url.searchParams.get("name") || "").trim();
  const city = (url.searchParams.get("city") || "").trim();
  if (name === "" || name.length > 80 || city === "" || city.length > 40) {
    return json(origin, 400, { error: "請提供飯店名稱與城市。", code: "bad_request" });
  }
  try {
    const hit = await lookupNominatim(name, city);
    if (!hit) return json(origin, 200, { found: false });
    return json(origin, 200, { found: true, lat: hit.lat, lng: hit.lng });
  } catch (error) {
    console.error("geocode failed");
    return json(origin, 502, { error: "暫時查不到座標。", code: "unavailable" });
  }
}

async function handlePlan(origin, request, env, raw) {
  const denied = checkPasscode(origin, request, env);
  if (denied) return denied;
  let payload = null;
  try {
    payload = raw === "" ? null : JSON.parse(raw);
  } catch (error) {
    return json(origin, 400, { error: "請用 JSON 送出行程條件。", code: "bad_request" });
  }
  const parsed = readInput(payload);
  if (parsed.error) return json(origin, 400, { error: parsed.error, code: "bad_request" });
  const segment = readSegment(payload, parsed.input.dayCount);
  if (segment.error) return json(origin, 400, { error: segment.error, code: "bad_request" });
  const apiKey = typeof env.GEMINI_API_KEY === "string" ? env.GEMINI_API_KEY.trim() : "";
  if (apiKey === "") {
    return json(origin, 500, { error: "伺服器還沒有設定 GEMINI_API_KEY。", code: "config" });
  }
  const slot = await reserveCall(env);
  if (!slot.ok) return json(origin, slot.status, { error: slot.error, code: slot.code });
  if (segment.chunk) {
    console.log(
      "plan request",
      parsed.input.destination,
      parsed.input.dayCount + " days",
      parsed.input.pace,
      "chunk",
      String(segment.chunk.start + 1) + "-" + String(segment.chunk.start + segment.chunk.count)
    );
  } else {
    console.log("plan request", parsed.input.destination, parsed.input.dayCount + " days", parsed.input.pace);
  }
  try {
    let plan = null;
    let usedFallback = false;
    if (!segment.chunk) {
      plan = await generatePlan(env, apiKey, parsed.input);
    } else {
      const chunk = await generateChunk(
        env,
        apiKey,
        parsed.input,
        segment.chunk.start,
        segment.chunk.count,
        segment.chunk.avoidNames,
        segment.chunk.useFallback
      );
      plan = assemblePlan(parsed.input, chunk.days);
      plan.accommodations = mergeStays(chunk.stays);
      usedFallback = chunk.usedFallback === true;
    }
    console.log("plan ready", plan.days.length + " days");
    if (segment.chunk) return json(origin, 200, { plan: plan, usedFallback: usedFallback });
    return json(origin, 200, { plan: plan });
  } catch (error) {
    const code = error && error.code ? error.code : "unavailable";
    const message = error instanceof Error ? error.message : "AI 服務沒有完成這次行程。可以再試一次，或先改用示範資料。";
    const status = code === "quota" ? 429 : code === "invalid" ? 422 : code === "timeout" ? 504 : code === "config" ? 500 : 502;
    console.error("plan failed:", code);
    return json(origin, status, { error: message, code: code });
  }
}

function routePath(url) {
  const pathName = url.pathname.replace(/\/+$/, "");
  return pathName === "" ? "/" : pathName;
}

async function handle(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = originAllowed(env, origin);
  if (request.method === "OPTIONS") {
    if (!allowed) return new Response(null, { status: 403 });
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Planner-Pass",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin"
      }
    });
  }
  if (!allowed) {
    return new Response(JSON.stringify({ error: "這個網域不能呼叫。", code: "forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
    });
  }
  const url = new URL(request.url);
  const pathName = routePath(url);
  if (pathName === "/api/geocode" && request.method === "GET") return handleGeocode(origin, url);
  if (pathName === "/api/plan" && request.method === "POST") {
    const raw = await request.text();
    if (raw.length > 32 * 1024) {
      return json(origin, 400, { error: "請用 JSON 送出行程條件。", code: "bad_request" });
    }
    return handlePlan(origin, request, env, raw);
  }
  return json(origin, 404, { error: "找不到這個 API。", code: "not_found" });
}

export default {
  fetch: handle
};
