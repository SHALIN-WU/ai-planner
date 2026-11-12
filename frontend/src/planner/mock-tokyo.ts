(function (root: typeof globalThis) {
  "use strict";

  function sampleLeg(mode: TransportMode, minutes: number, cost?: number): TransportLeg {
    const leg: TransportLeg = { mode: mode, minutes: minutes };
    if (typeof cost === "number") leg.cost = { amount: cost, currency: "JPY" };
    return leg;
  }

  function stop(
    type: PlaceType,
    name: string,
    description: string,
    durationMinutes: number,
    cost: number,
    lat: number,
    lng: number,
    transport?: TransportLeg
  ): ItineraryItem {
    const item: ItineraryItem = {
      id: name,
      type: type,
      name: name,
      description: description,
      durationMinutes: durationMinutes,
      cost: { amount: cost, currency: "JPY" },
      location: { name: name, lat: lat, lng: lng }
    };
    if (transport) item.transportToNext = transport;
    return item;
  }

  const TOKYO_DAYS: ItineraryItem[][] = [
    [
      stop("attraction", "淺草寺", "東京最老的寺廟之一，從雷門走進去就能看見五重塔。", 90, 0, 35.7148, 139.7967, sampleLeg("walk", 5)),
      stop("shopping", "仲見世商店街", "寺前這條商店街專賣人形燒、仙貝和伴手禮。", 45, 1200, 35.7117, 139.7966, sampleLeg("walk", 6)),
      stop("restaurant", "大黑家天婦羅", "淺草老店，現炸的海鮮天婦羅是這區最穩的一餐。", 70, 2800, 35.7117, 139.7948, sampleLeg("train", 18, 400)),
      stop("attraction", "東京晴空塔", "登上天望甲板，天氣好時看得到東京灣。", 90, 2200, 35.7101, 139.8107, sampleLeg("walk", 12)),
      stop("attraction", "隅田公園", "沿著隅田川散步，可以把晴空塔收進同一個畫面。", 40, 0, 35.7122, 139.8036)
    ],
    [
      stop("restaurant", "築地場外市場", "外圍店家適合吃海鮮丼、玉子燒和現切生魚片。", 80, 1800, 35.6654, 139.7707, sampleLeg("walk", 15)),
      stop("attraction", "濱離宮恩賜庭園", "江戶時代的海邊庭園，潮入之池會跟著潮汐改變。", 60, 300, 35.6597, 139.7634, sampleLeg("walk", 18)),
      stop("shopping", "銀座中央通", "從四丁目走到百貨公司，逛街與看櫥窗都方便。", 70, 0, 35.6717, 139.7649, sampleLeg("train", 22, 480)),
      stop("attraction", "東京鐵塔", "橘紅色鐵塔，展望台對準港區和彩虹橋方向。", 80, 1500, 35.6586, 139.7454, sampleLeg("walk", 8)),
      stop("attraction", "增上寺", "就在鐵塔旁邊，主殿與庭園比旁邊的觀光景點安靜。", 40, 0, 35.6574, 139.7481)
    ],
    [
      stop("attraction", "明治神宮", "原宿旁的森林神社，參道很長，適合把步調放出來。", 70, 0, 35.6764, 139.6993, sampleLeg("walk", 12)),
      stop("shopping", "竹下通", "短短一條年輕人的街，可麗餅和潮店擠在一起。", 50, 1000, 35.6706, 139.7048, sampleLeg("walk", 8)),
      stop("restaurant", "一蘭拉麵原宿店", "一個人一個座位的豚骨拉麵，原宿逛完剛好補一餐。", 50, 1500, 35.6697, 139.7063, sampleLeg("train", 12, 320)),
      stop("attraction", "澀谷 Sky", "在十字路口正上方看澀谷的人潮，傍晚最清楚。", 60, 2200, 35.6581, 139.7022, sampleLeg("train", 18, 360)),
      stop("attraction", "東京都廳展望台", "新宿的免費展望台，天氣好可以遠眺富士山。", 40, 0, 35.6896, 139.692)
    ]
  ];

  function cloneItems(items: ItineraryItem[]): ItineraryItem[] {
    return items.map(function (item) {
      const copy: ItineraryItem = {
        id: PlannerFormat.createId(),
        type: item.type,
        name: item.name,
        description: item.description,
        durationMinutes: item.durationMinutes,
        cost: { amount: item.cost.amount, currency: item.cost.currency },
        location: { name: item.location.name, lat: item.location.lat, lng: item.location.lng }
      };
      if (item.transportToNext) {
        copy.transportToNext = {
          mode: item.transportToNext.mode,
          minutes: item.transportToNext.minutes
        };
        if (item.transportToNext.cost) {
          copy.transportToNext.cost = {
            amount: item.transportToNext.cost.amount,
            currency: item.transportToNext.cost.currency
          };
        }
      }
      return copy;
    });
  }

  function templateFor(index: number): ItineraryItem[] {
    if (index < 0 || index >= TOKYO_DAYS.length) return [];
    const source = TOKYO_DAYS[index];
    if (!source) return [];
    return cloneItems(source);
  }

  function stay(
    name: string,
    checkIn: string,
    checkOut: string,
    price: number,
    lat: number,
    lng: number,
    note: string
  ): Accommodation {
    return {
      id: PlannerFormat.createId(),
      name: name,
      location: { name: name, lat: lat, lng: lng },
      checkIn: checkIn,
      checkOut: checkOut,
      pricePerNight: { amount: price, currency: "JPY" },
      rooms: 1,
      note: note
    };
  }

  function buildStays(ready: ReadyDraft): Accommodation[] {
    const days = PlannerFormat.inclusiveDays(ready.startDate, ready.endDate);
    if (days < 2) return [];
    if (days === 2) {
      return [stay("淺草豪景飯店", ready.startDate, ready.endDate, 20000, 35.7125, 139.7945, "雷門步行約 3 分鐘，含早餐。")];
    }
    const second = PlannerFormat.addDays(ready.startDate, 1);
    return [
      stay("淺草豪景飯店", ready.startDate, second, 20000, 35.7125, 139.7945, "雷門步行約 3 分鐘。"),
      stay("新宿華盛頓飯店", second, ready.endDate, 22000, 35.6892, 139.6945, "新宿站步行約 5 分鐘。")
    ];
  }

  function flight(
    from: string,
    to: string,
    departAt: string,
    arriveAt: string,
    amount: number,
    bookingRef: string,
    note: string
  ): IntercityTransport {
    return {
      id: PlannerFormat.createId(),
      mode: "flight",
      from: from,
      to: to,
      departAt: departAt,
      arriveAt: arriveAt,
      cost: { amount: amount, currency: "TWD" },
      bookingRef: bookingRef,
      note: note
    };
  }

  function buildFlights(ready: ReadyDraft): IntercityTransport[] {
    return [
      flight("桃園", "羽田", ready.startDate + "T08:30", ready.startDate + "T12:30", 7800, "CI100", "去程"),
      flight("羽田", "桃園", ready.endDate + "T18:40", ready.endDate + "T21:30", 8200, "CI101", "回程")
    ];
  }

  function createPlan(ready: ReadyDraft): TripPlan {
    const dayCount = PlannerFormat.inclusiveDays(ready.startDate, ready.endDate);
    const days: DayPlan[] = [];
    for (let index = 0; index < dayCount; index += 1) {
      days.push({
        dayIndex: index + 1,
        date: PlannerFormat.addDays(ready.startDate, index),
        items: templateFor(index)
      });
    }
    const plan: TripPlan = {
      id: PlannerFormat.createId(),
      destination: ready.destination,
      startDate: ready.startDate,
      endDate: ready.endDate,
      travelers: ready.travelers,
      budget: { amount: ready.budget.amount, currency: ready.budget.currency },
      interests: ready.interests.slice(),
      pace: ready.pace,
      days: days,
      accommodations: buildStays(ready),
      transports: buildFlights(ready)
    };
    const note = ready.note.trim();
    if (note !== "") plan.note = note;
    return plan;
  }

  function shiftNear(lat: number, lng: number): { lat: number; lng: number } {
    const angle = Math.random() * Math.PI * 2;
    const meters = 150 + Math.random() * 350;
    const dLat = (meters * Math.cos(angle)) / 111320;
    const cos = Math.cos((lat * Math.PI) / 180);
    const safeCos = Math.abs(cos) < 0.01 ? 0.01 : cos;
    const dLng = (meters * Math.sin(angle)) / (111320 * safeCos);
    return {
      lat: Math.round((lat + dLat) * 1e6) / 1e6,
      lng: Math.round((lng + dLng) * 1e6) / 1e6
    };
  }

  function makeCustomItem(name: string, type: PlaceType, anchor?: PlaceLocation): ItineraryItem {
    const base = anchor && PlannerFormat.isMappableLocation(anchor)
      ? anchor
      : { lat: 35.6812, lng: 139.7671 };
    const shifted = shiftNear(base.lat, base.lng);
    return {
      id: PlannerFormat.createId(),
      type: type,
      name: name,
      description: "這是你加上的地點。",
      durationMinutes: 60,
      cost: { amount: 0, currency: "JPY" },
      location: { name: name, lat: shifted.lat, lng: shifted.lng }
    };
  }

  const api: PlannerMockApi = {
    createPlan: createPlan,
    makeCustomItem: makeCustomItem
  };

  (root as typeof globalThis & { PlannerMock: PlannerMockApi }).PlannerMock = api;
})(globalThis);
