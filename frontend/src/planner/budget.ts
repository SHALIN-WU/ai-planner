(function (root: typeof globalThis) {
  "use strict";

  // 市內交通初估。票價是單程、每人，單位是該貨幣。
  // 實際距離 = 直線距離 × detourFactor。1 km 以內為步行。
  // 超過 walkMaxKm、不超過 localMaxKm 用 local；再遠用 longDistance。
  // 級距取第一個 maxKm 大於等於實際距離的票價。日本用 JPY，沒有對應貨幣時用 DEFAULT。
  interface FareBand {
    maxKm: number;
    fare: number;
  }

  interface TransportFareRule {
    walkMaxKm: number;
    localMaxKm: number;
    detourFactor: number;
    local: FareBand[];
    longDistance: FareBand[];
  }

  const TRANSPORT_FARE_RULES: { [code: string]: TransportFareRule } = {
    JPY: {
      walkMaxKm: 1,
      localMaxKm: 15,
      detourFactor: 1.3,
      local: [
        { maxKm: 3, fare: 180 },
        { maxKm: 6, fare: 220 },
        { maxKm: 10, fare: 280 },
        { maxKm: 15, fare: 340 }
      ],
      longDistance: [
        { maxKm: 30, fare: 800 },
        { maxKm: 60, fare: 1500 },
        { maxKm: 120, fare: 3000 },
        { maxKm: Infinity, fare: 5000 }
      ]
    },
    DEFAULT: {
      walkMaxKm: 1,
      localMaxKm: 15,
      detourFactor: 1.3,
      local: [
        { maxKm: 3, fare: 30 },
        { maxKm: 6, fare: 50 },
        { maxKm: 10, fare: 70 },
        { maxKm: 15, fare: 90 }
      ],
      longDistance: [
        { maxKm: 30, fare: 200 },
        { maxKm: 60, fare: 400 },
        { maxKm: 120, fare: 800 },
        { maxKm: Infinity, fare: 1200 }
      ]
    }
  };

  const JAPAN_MARKERS = ["東京", "大阪", "京都", "福岡", "日本"];

  interface ChainStop {
    point: { lat: number; lng: number } | null;
    itemIndex: number;
  }

  function fareRule(currency: string): TransportFareRule {
    const named = TRANSPORT_FARE_RULES[currency];
    if (named) return named;
    const fallback = TRANSPORT_FARE_RULES.DEFAULT;
    if (fallback) return fallback;
    return {
      walkMaxKm: 1,
      localMaxKm: 15,
      detourFactor: 1.3,
      local: [{ maxKm: 15, fare: 0 }],
      longDistance: [{ maxKm: Infinity, fare: 0 }]
    };
  }

  function bandFare(bands: FareBand[], distanceKm: number): number {
    for (let index = 0; index < bands.length; index += 1) {
      const band = bands[index];
      if (band && distanceKm <= band.maxKm) return band.fare;
    }
    const last = bands.length > 0 ? bands[bands.length - 1] : undefined;
    return last ? last.fare : 0;
  }

  function ruleFare(rule: TransportFareRule, straightKm: number): number {
    const distance = straightKm * rule.detourFactor;
    if (distance <= rule.walkMaxKm) return 0;
    const bands = distance <= rule.localMaxKm ? rule.local : rule.longDistance;
    return bandFare(bands, distance);
  }

  function travelerCount(plan: TripPlan): number {
    if (Number.isInteger(plan.travelers) && plan.travelers > 0) return plan.travelers;
    return 1;
  }

  function cityFareCurrency(plan: TripPlan): string {
    const destination = plan.destination || "";
    for (let index = 0; index < JAPAN_MARKERS.length; index += 1) {
      const marker = JAPAN_MARKERS[index];
      if (marker && destination.indexOf(marker) !== -1) return "JPY";
    }
    const stays = plan.accommodations || [];
    for (let index = 0; index < stays.length; index += 1) {
      const stay = stays[index];
      const currency = stay && stay.pricePerNight ? stay.pricePerNight.currency : "";
      if (currency !== "") return currency;
    }
    return plan.budget.currency || "TWD";
  }

  function stayCovering(plan: TripPlan, date: string): Accommodation | null {
    const stays = plan.accommodations || [];
    for (let index = 0; index < stays.length; index += 1) {
      const stay = stays[index];
      if (stay && coversNight(stay, date)) return stay;
    }
    return null;
  }

  function morningStay(plan: TripPlan, date: string): Accommodation | null {
    return stayCovering(plan, PlannerFormat.addDays(date, -1)) || stayCovering(plan, date);
  }

  function eveningStay(plan: TripPlan, date: string): Accommodation | null {
    return stayCovering(plan, date) || morningStay(plan, date);
  }

  function chainStopFromStay(stay: Accommodation | null): ChainStop | null {
    if (!stay) return null;
    if (!PlannerFormat.isMappableLocation(stay.location)) return { point: null, itemIndex: -1 };
    return { point: { lat: stay.location.lat, lng: stay.location.lng }, itemIndex: -1 };
  }

  function manualHop(day: DayPlan, from: ChainStop, to: ChainStop): Money | null {
    if (from.itemIndex < 0 || to.itemIndex !== from.itemIndex + 1) return null;
    const item = day.items[from.itemIndex];
    if (!item || !item.transportToNext || item.transportToNext.manual !== true) return null;
    const cost = item.transportToNext.cost;
    if (!cost || !Number.isFinite(cost.amount)) return null;
    return { amount: cost.amount, currency: cost.currency };
  }

  function addCityTransport(
    plan: TripPlan,
    day: DayPlan,
    row: DaySpend,
    transport: BudgetCategory,
    home: string,
    rates: ExchangeRates
  ): void {
    const city = transport.city;
    if (!city) return;
    const currency = cityFareCurrency(plan);
    const rule = fareRule(currency);
    const people = travelerCount(plan);
    const stops: ChainStop[] = [];
    const morning = chainStopFromStay(morningStay(plan, day.date));
    if (morning) stops.push(morning);
    for (let index = 0; index < day.items.length; index += 1) {
      const item = day.items[index];
      if (!item) continue;
      if (!PlannerFormat.isMappableLocation(item.location)) {
        stops.push({ point: null, itemIndex: index });
      } else {
        stops.push({
          point: { lat: item.location.lat, lng: item.location.lng },
          itemIndex: index
        });
      }
    }
    const evening = chainStopFromStay(eveningStay(plan, day.date));
    if (evening) stops.push(evening);

    let estimateAmount = 0;
    let dayEstimated = false;
    for (let index = 0; index < stops.length - 1; index += 1) {
      const from = stops[index];
      const to = stops[index + 1];
      if (!from || !to) continue;
      const manual = manualHop(day, from, to);
      if (manual) {
        const converted = convert(manual, home, rates);
        addAmount(row.transport, converted.amount);
        addAmount(transport.amount, converted.amount);
        addAmount(city, converted.amount);
        addOriginal(transport.originals, manual);
        continue;
      }
      if (!from.point || !to.point) {
        transport.missingSegments = (transport.missingSegments || 0) + 1;
        continue;
      }
      estimateAmount += ruleFare(rule, PlannerFormat.straightKm(from.point, to.point)) * people;
      dayEstimated = true;
    }
    if (!dayEstimated) return;
    const local = { amount: estimateAmount, currency: currency };
    row.transportEstimate = local;
    const converted = convert(local, home, rates);
    addAmount(row.transport, converted.amount);
    addAmount(transport.amount, converted.amount);
    addAmount(city, converted.amount);
    addOriginal(transport.originals, local);
    transport.estimated = true;
  }

  function convert(money: Money, home: string, rates: ExchangeRates): Money {
    const rate = money.currency === home ? 1 : rates[money.currency];
    const factor = typeof rate === "number" && Number.isFinite(rate) ? rate : 0;
    return { amount: Math.round(money.amount * factor), currency: home };
  }

  function coversNight(stay: Accommodation, isoDate: string): boolean {
    return stay.checkIn <= isoDate && isoDate < stay.checkOut;
  }

  function stayOriginal(stay: Accommodation): Money {
    const nights = PlannerFormat.nightCount(stay.checkIn, stay.checkOut);
    const rooms = stay.rooms > 0 ? stay.rooms : 1;
    return {
      amount: stay.pricePerNight.amount * nights * rooms,
      currency: stay.pricePerNight.currency
    };
  }

  function stayHome(stay: Accommodation, home: string, rates: ExchangeRates): Money {
    const nights = PlannerFormat.nightCount(stay.checkIn, stay.checkOut);
    const rooms = stay.rooms > 0 ? stay.rooms : 1;
    const perNight = convert(
      { amount: stay.pricePerNight.amount * rooms, currency: stay.pricePerNight.currency },
      home,
      rates
    );
    return { amount: perNight.amount * Math.max(nights, 0), currency: home };
  }

  function blank(home: string): Money {
    return { amount: 0, currency: home };
  }

  function addAmount(bucket: Money, amount: number): void {
    bucket.amount += amount;
  }

  function addOriginal(list: Money[], money: Money): void {
    if (money.amount === 0) return;
    for (let index = 0; index < list.length; index += 1) {
      const row = list[index];
      if (row && row.currency === money.currency) {
        row.amount += money.amount;
        return;
      }
    }
    list.push({ amount: money.amount, currency: money.currency });
  }

  function category(key: string, label: string, home: string): BudgetCategory {
    return { key: key, label: label, amount: blank(home), ratio: 0, originals: [] };
  }

  function dayRow(date: string, home: string): DaySpend {
    return {
      date: date,
      attraction: blank(home),
      food: blank(home),
      transport: blank(home),
      lodging: blank(home),
      shopping: blank(home),
      other: blank(home),
      total: blank(home)
    };
  }

  function placeBucket(type: PlaceType, row: DaySpend, groups: { [key: string]: BudgetCategory }): { day: Money; group: BudgetCategory } {
    if (type === "restaurant") return { day: row.food, group: groups.food };
    if (type === "attraction") return { day: row.attraction, group: groups.ticket };
    if (type === "shopping") return { day: row.shopping, group: groups.shopping };
    return { day: row.other, group: groups.other };
  }

  function refreshDayTotal(row: DaySpend): void {
    row.total.amount = row.attraction.amount + row.food.amount + row.transport.amount +
      row.lodging.amount + row.shopping.amount + row.other.amount;
  }

  function departDate(ride: IntercityTransport): string {
    return PlannerFormat.datePart(ride.departAt);
  }

  function report(plan: TripPlan, rates: ExchangeRates): BudgetReport {
    const home = plan.budget.currency || "TWD";
    const groups: { [key: string]: BudgetCategory } = {
      transport: category("transport", "交通", home),
      lodging: category("lodging", "住宿", home),
      food: category("food", "餐飲", home),
      ticket: category("ticket", "景點門票", home),
      shopping: category("shopping", "購物", home),
      other: category("other", "其他", home)
    };
    groups.transport.city = blank(home);
    groups.transport.intercity = blank(home);
    groups.transport.missingSegments = 0;
    groups.transport.estimated = false;
    const days: DaySpend[] = [];
    const byDate: { [date: string]: DaySpend } = {};
    for (let dayIndex = 0; dayIndex < plan.days.length; dayIndex += 1) {
      const day = plan.days[dayIndex];
      if (!day) continue;
      const row = dayRow(day.date, home);
      days.push(row);
      byDate[day.date] = row;
    }

    for (let dayIndex = 0; dayIndex < plan.days.length; dayIndex += 1) {
      const day = plan.days[dayIndex];
      if (!day) continue;
      const row = byDate[day.date];
      if (!row) continue;
      for (let itemIndex = 0; itemIndex < day.items.length; itemIndex += 1) {
        const item = day.items[itemIndex];
        if (!item) continue;
        const bucket = placeBucket(item.type, row, groups);
        const converted = convert(item.cost, home, rates);
        addAmount(bucket.day, converted.amount);
        addAmount(bucket.group.amount, converted.amount);
        addOriginal(bucket.group.originals, item.cost);
      }
      addCityTransport(plan, day, row, groups.transport, home, rates);
      refreshDayTotal(row);
    }

    const stays = plan.accommodations || [];
    for (let stayIndex = 0; stayIndex < stays.length; stayIndex += 1) {
      const stay = stays[stayIndex];
      if (!stay) continue;
      const nights = PlannerFormat.nightCount(stay.checkIn, stay.checkOut);
      const rooms = stay.rooms > 0 ? stay.rooms : 1;
      const perNight = convert(
        { amount: stay.pricePerNight.amount * rooms, currency: stay.pricePerNight.currency },
        home,
        rates
      );
      addAmount(groups.lodging.amount, perNight.amount * Math.max(nights, 0));
      addOriginal(groups.lodging.originals, stayOriginal(stay));
      for (let dayIndex = 0; dayIndex < days.length; dayIndex += 1) {
        const row = days[dayIndex];
        if (!row || !coversNight(stay, row.date)) continue;
        addAmount(row.lodging, perNight.amount);
        refreshDayTotal(row);
      }
    }

    const rides = plan.transports || [];
    for (let rideIndex = 0; rideIndex < rides.length; rideIndex += 1) {
      const ride = rides[rideIndex];
      if (!ride) continue;
      const converted = convert(ride.cost, home, rates);
      addAmount(groups.transport.amount, converted.amount);
      if (groups.transport.intercity) addAmount(groups.transport.intercity, converted.amount);
      addOriginal(groups.transport.originals, ride.cost);
      const row = byDate[departDate(ride)];
      if (!row) continue;
      addAmount(row.transport, converted.amount);
      refreshDayTotal(row);
    }

    const categories = [groups.transport, groups.lodging, groups.food, groups.ticket, groups.shopping, groups.other];
    let totalAmount = 0;
    for (let index = 0; index < categories.length; index += 1) {
      const item = categories[index];
      if (item) totalAmount += item.amount.amount;
    }
    for (let index = 0; index < categories.length; index += 1) {
      const item = categories[index];
      if (!item) continue;
      item.ratio = totalAmount === 0 ? 0 : item.amount.amount / totalAmount;
    }

    const total = { amount: totalAmount, currency: home };
    const budget = { amount: plan.budget.amount, currency: home };
    const remaining = { amount: budget.amount - total.amount, currency: home };
    let status: BudgetStatus = "ok";
    if (budget.amount > 0 && total.amount > budget.amount) status = "over";
    else if (budget.amount === 0 && total.amount > 0) status = "over";
    else if (budget.amount > 0 && total.amount * 10 >= budget.amount * 9) status = "warn";

    return {
      home: home,
      categories: categories,
      days: days,
      total: total,
      perPerson: PlannerFormat.splitPerPerson(total, plan.travelers),
      budget: budget,
      remaining: remaining,
      status: status
    };
  }

  function csvCell(value: string): string {
    if (/[",\n\r]/.test(value)) return '"' + value.replace(/"/g, '""') + '"';
    return value;
  }

  function csvLine(cells: string[]): string {
    return cells.map(csvCell).join(",");
  }

  function moneyText(money: Money): string {
    return PlannerFormat.formatMoney(money);
  }

  function toCsv(plan: TripPlan, rates: ExchangeRates): string {
    const home = plan.budget.currency || "TWD";
    const lines = [
      csvLine(["日期", "站序", "名稱", "類型", "停留時間", "交通方式", "交通時間", "費用（原幣）", "費用（" + home + "）", "說明"])
    ];
    for (let dayIndex = 0; dayIndex < plan.days.length; dayIndex += 1) {
      const day = plan.days[dayIndex];
      if (!day) continue;
      for (let itemIndex = 0; itemIndex < day.items.length; itemIndex += 1) {
        const item = day.items[itemIndex];
        if (!item) continue;
        const leg = item.transportToNext;
        const meta = PlannerFormat.placeMeta(item.type);
        lines.push(csvLine([
          day.date,
          String(itemIndex + 1),
          item.name,
          meta.label,
          PlannerFormat.formatDuration(item.durationMinutes),
          leg ? PlannerFormat.transportModeLabel(leg.mode) : "",
          leg ? String(leg.minutes) + " 分鐘" : "",
          moneyText(item.cost),
          moneyText(convert(item.cost, home, rates)),
          item.description || ""
        ]));
        if (leg && leg.cost) {
          lines.push(csvLine([
            day.date,
            "",
            "前往下一站",
            "小交通",
            "",
            PlannerFormat.transportModeLabel(leg.mode),
            String(leg.minutes) + " 分鐘",
            moneyText(leg.cost),
            moneyText(convert(leg.cost, home, rates)),
            ""
          ]));
        }
      }
    }
    const stays = plan.accommodations || [];
    for (let index = 0; index < stays.length; index += 1) {
      const stay = stays[index];
      if (!stay) continue;
      const nights = PlannerFormat.nightCount(stay.checkIn, stay.checkOut);
      lines.push(csvLine([
        stay.checkIn,
        "",
        stay.name,
        "住宿",
        String(nights) + " 晚",
        "",
        stay.checkIn + " 入住至 " + stay.checkOut + " 退房",
        moneyText(stayOriginal(stay)),
        moneyText(stayHome(stay, home, rates)),
        stay.note || ""
      ]));
    }
    const rides = (plan.transports || []).slice().sort(function (a, b) {
      if (a.departAt < b.departAt) return -1;
      if (a.departAt > b.departAt) return 1;
      return 0;
    });
    for (let index = 0; index < rides.length; index += 1) {
      const ride = rides[index];
      if (!ride) continue;
      const depart = PlannerFormat.formatClock(ride.departAt);
      const arrive = ride.arriveAt ? PlannerFormat.formatClock(ride.arriveAt) : "";
      const span = depart && arrive ? depart + "–" + arrive : depart;
      lines.push(csvLine([
        PlannerFormat.datePart(ride.departAt),
        "",
        ride.from + " → " + ride.to,
        PlannerFormat.intercityModeLabel(ride.mode),
        "",
        PlannerFormat.intercityModeLabel(ride.mode),
        span,
        moneyText(ride.cost),
        moneyText(convert(ride.cost, home, rates)),
        ride.note || ""
      ]));
    }
    return lines.join("\r\n");
  }

  const api: PlannerBudgetApi = {
    report: report,
    convert: convert,
    coversNight: coversNight,
    stayOriginal: stayOriginal,
    stayHome: stayHome,
    toCsv: toCsv
  };

  (root as typeof globalThis & { PlannerBudget: PlannerBudgetApi }).PlannerBudget = api;
})(globalThis);
