// 編譯後給瀏覽器載入的檔案是 frontend/js/model.js。
(function (root: typeof globalThis) {
  "use strict";

  const TRANSPORT_MODES = ["flight", "train", "bus", "car", "taxi", "walk", "ferry", "other"] as const;
  const BUDGET_CATEGORIES = ["transport", "accommodation", "food", "activity", "shopping", "other"] as const;
  const SAMPLE_START = "2026-11-02";

  type TransportMode = typeof TRANSPORT_MODES[number];
  type BudgetCategory = typeof BUDGET_CATEGORIES[number];

  interface Location {
    name: string;
    address?: string;
    lat: number;
    lng: number;
  }

  interface Money {
    amount: number;
    currency: string;
  }

  interface Day {
    id: string;
    date?: string;
    destination?: string;
  }

  interface Transport {
    id: string;
    dayId: string;
    mode: TransportMode;
    from: Location;
    to: Location;
    departAt: string;
    arriveAt?: string;
    cost: Money;
    bookingRef?: string;
    note?: string;
  }

  interface Accommodation {
    id: string;
    tripId: string;
    name: string;
    location: Location;
    checkIn: string;
    checkOut: string;
    pricePerNight: Money;
    rooms?: number;
    bookingUrl?: string;
    note?: string;
  }

  interface Activity {
    id: string;
    type: string;
    destination: string;
    name: string;
    whyFit: string;
    hours: string;
    reservation: string;
    sources: { title: string; url: string }[];
    retrievedAt: string;
    lat: number | null;
    lng: number | null;
    geocodeStatus: string;
    location?: Location;
    cost?: Money;
    category?: BudgetCategory;
  }

  interface Trip {
    id: string;
    tripName?: string;
    totalDays?: string;
    destinations?: { id: string; name: string; days: string }[];
    days: Day[];
    transports: Transport[];
    accommodations: Accommodation[];
    travelers: number;
    baseCurrency: string;
  }

  interface TransportInput {
    id?: string;
    dayId: string;
    mode: TransportMode;
    from: Location;
    to: Location;
    departAt: string;
    arriveAt?: string;
    cost: Money;
    bookingRef?: string;
    note?: string;
  }

  interface AccommodationInput {
    id?: string;
    tripId?: string;
    name: string;
    location: Location;
    checkIn: string;
    checkOut: string;
    pricePerNight: Money;
    rooms?: number;
    bookingUrl?: string;
    note?: string;
  }

  interface TripModelApi {
    getAccommodationNights(acc: { checkIn: string; checkOut: string }): number;
    ensureTrip<T extends object>(trip: T): T & Trip;
    applySample<T extends object>(trip: T, totalDays: number): T & Trip;
    enrichActivity<T extends Pick<Activity, "name" | "type"> & Partial<Activity>>(item: T): T;
    attach(trip: object, persist?: () => void): void;
    addTransport(input: TransportInput): Transport | null;
    updateTransport(id: string, patch: Partial<Omit<Transport, "id">>): Transport | null;
    deleteTransport(id: string): boolean;
    addAccommodation(input: AccommodationInput): Accommodation | null;
    updateAccommodation(id: string, patch: Partial<Omit<Accommodation, "id">>): Accommodation | null;
    deleteAccommodation(id: string): boolean;
  }

  let current: (object & Trip) | null = null;
  let persist: (() => void) | null = null;

  function createId(): string {
    return Math.random().toString(36).slice(2, 10);
  }

  function freshId(used: string[], preferred?: string): string {
    if (preferred && preferred.trim() !== "" && used.indexOf(preferred) === -1) return preferred;
    let id = createId();
    while (used.indexOf(id) !== -1) id = createId();
    return id;
  }

  function parseIsoDate(value: string): number | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
    const utc = Date.UTC(year, month - 1, day);
    const check = new Date(utc);
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
    return utc;
  }

  function addDays(isoDate: string, amount: number): string {
    const start = parseIsoDate(isoDate);
    if (start === null) return isoDate;
    const next = new Date(start + amount * 86400000);
    const month = String(next.getUTCMonth() + 1).padStart(2, "0");
    const day = String(next.getUTCDate()).padStart(2, "0");
    return next.getUTCFullYear() + "-" + month + "-" + day;
  }

  function isTransportMode(value: unknown): value is TransportMode {
    return typeof value === "string" && (TRANSPORT_MODES as readonly string[]).indexOf(value) !== -1;
  }

  function isBudgetCategory(value: unknown): value is BudgetCategory {
    return typeof value === "string" && (BUDGET_CATEGORIES as readonly string[]).indexOf(value) !== -1;
  }

  function isLocation(value: unknown): value is Location {
    if (!value || typeof value !== "object") return false;
    const loc = value as Location;
    if (typeof loc.name !== "string" || loc.name.trim() === "") return false;
    if (typeof loc.lat !== "number" || !Number.isFinite(loc.lat) || loc.lat < -90 || loc.lat > 90) return false;
    if (typeof loc.lng !== "number" || !Number.isFinite(loc.lng) || loc.lng < -180 || loc.lng > 180) return false;
    if (loc.address !== undefined && typeof loc.address !== "string") return false;
    return true;
  }

  function isMoney(value: unknown): value is Money {
    if (!value || typeof value !== "object") return false;
    const money = value as Money;
    return typeof money.amount === "number"
      && Number.isFinite(money.amount)
      && typeof money.currency === "string"
      && money.currency.trim() !== "";
  }

  function isDay(value: unknown): value is Day {
    if (!value || typeof value !== "object") return false;
    const day = value as Day;
    if (typeof day.id !== "string" || day.id.trim() === "") return false;
    if (day.date !== undefined && (typeof day.date !== "string" || parseIsoDate(day.date) === null)) return false;
    if (day.destination !== undefined && typeof day.destination !== "string") return false;
    return true;
  }

  function isTransport(value: unknown): value is Transport {
    if (!value || typeof value !== "object") return false;
    const item = value as Transport;
    if (typeof item.id !== "string" || item.id.trim() === "") return false;
    if (typeof item.dayId !== "string" || item.dayId.trim() === "") return false;
    if (!isTransportMode(item.mode)) return false;
    if (!isLocation(item.from) || !isLocation(item.to)) return false;
    if (typeof item.departAt !== "string" || item.departAt.trim() === "") return false;
    if (item.arriveAt !== undefined && typeof item.arriveAt !== "string") return false;
    if (!isMoney(item.cost)) return false;
    if (item.bookingRef !== undefined && typeof item.bookingRef !== "string") return false;
    if (item.note !== undefined && typeof item.note !== "string") return false;
    return true;
  }

  function isAccommodation(value: unknown): value is Accommodation {
    if (!value || typeof value !== "object") return false;
    const item = value as Accommodation;
    if (typeof item.id !== "string" || item.id.trim() === "") return false;
    if (typeof item.tripId !== "string" || item.tripId.trim() === "") return false;
    if (typeof item.name !== "string" || item.name.trim() === "") return false;
    if (!isLocation(item.location)) return false;
    if (typeof item.checkIn !== "string" || parseIsoDate(item.checkIn) === null) return false;
    if (typeof item.checkOut !== "string" || parseIsoDate(item.checkOut) === null) return false;
    if (!isMoney(item.pricePerNight)) return false;
    if (item.rooms !== undefined && (!Number.isInteger(item.rooms) || item.rooms < 1)) return false;
    if (item.bookingUrl !== undefined && typeof item.bookingUrl !== "string") return false;
    if (item.note !== undefined && typeof item.note !== "string") return false;
    return true;
  }

  function copyLocation(location: Location): Location {
    const copy: Location = { name: location.name, lat: location.lat, lng: location.lng };
    if (typeof location.address === "string") copy.address = location.address;
    return copy;
  }

  function copyMoney(money: Money): Money {
    return { amount: money.amount, currency: money.currency.trim() };
  }

  function pointOrUndefined(name: string, lat: unknown, lng: unknown): Location | undefined {
    if (typeof lat !== "number" || typeof lng !== "number") return undefined;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
    const place = { name: name, lat: lat, lng: lng };
    return isLocation(place) ? place : undefined;
  }

  function getAccommodationNights(acc: { checkIn: string; checkOut: string }): number {
    const start = parseIsoDate(acc.checkIn);
    const end = parseIsoDate(acc.checkOut);
    if (start === null || end === null) return 0;
    const nights = Math.round((end - start) / 86400000);
    return nights > 0 ? nights : 0;
  }

  function ensureTrip<T extends object>(trip: T): T & Trip {
    const record = trip as T & Trip & Record<string, unknown>;
    const id = record.id;
    record.id = typeof id === "string" && id.trim() !== "" ? id : createId();
    record.days = Array.isArray(record.days) ? record.days.filter(isDay) : [];
    record.transports = Array.isArray(record.transports) ? record.transports.filter(isTransport) : [];
    record.accommodations = Array.isArray(record.accommodations) ? record.accommodations.filter(isAccommodation) : [];
    const travelers = typeof record.travelers === "number" ? record.travelers : Number(record.travelers);
    record.travelers = Number.isInteger(travelers) && travelers >= 1 ? travelers : 1;
    const currency = typeof record.baseCurrency === "string" ? record.baseCurrency.trim() : "";
    record.baseCurrency = currency !== "" ? currency : "TWD";
    return record;
  }

  function enrichActivity<T extends Pick<Activity, "name" | "type"> & Partial<Activity>>(item: T): T {
    if (!isBudgetCategory(item.category)) {
      item.category = item.type === "美食" ? "food" : "activity";
    }
    if (!isLocation(item.location)) {
      const place = pointOrUndefined(item.name, item.lat, item.lng);
      if (place) item.location = place;
    }
    if (item.cost !== undefined && !isMoney(item.cost)) item.cost = undefined;
    return item;
  }

  function buildDays(tripId: string, totalDays: number): Day[] {
    const plan = [
      { name: "金澤", count: 2 },
      { name: "富山", count: 2 },
      { name: "高山", count: 2 },
      { name: "加賀", count: 1 }
    ];
    const days: Day[] = [];
    let index = 0;
    for (let placeIndex = 0; placeIndex < plan.length; placeIndex += 1) {
      const place = plan[placeIndex];
      if (!place) continue;
      for (let offset = 0; offset < place.count && index < totalDays; offset += 1) {
        days.push({
          id: tripId + "-day-" + String(index + 1),
          date: addDays(SAMPLE_START, index),
          destination: place.name
        });
        index += 1;
      }
    }
    return days;
  }

  function buildSampleTransports(tripId: string, days: Day[]): Transport[] {
    const list: Transport[] = [];
    const toToyama = days[2];
    if (toToyama && toToyama.date) {
      list.push({
        id: tripId + "-train-kanazawa-toyama",
        dayId: toToyama.id,
        mode: "train",
        from: { name: "金澤車站", address: "石川縣金澤市木之新保町", lat: 36.5781, lng: 136.6483 },
        to: { name: "富山車站", address: "富山縣富山市明輪町", lat: 36.7012, lng: 137.2131 },
        departAt: toToyama.date + "T09:30:00+09:00",
        arriveAt: toToyama.date + "T10:15:00+09:00",
        cost: { amount: 3500, currency: "JPY" },
        bookingRef: "SAMPLE-TR-01",
        note: "金澤轉往富山的示範車次"
      });
    }
    const toTakayama = days[4];
    if (toTakayama && toTakayama.date) {
      list.push({
        id: tripId + "-bus-toyama-takayama",
        dayId: toTakayama.id,
        mode: "bus",
        from: { name: "富山車站", address: "富山縣富山市明輪町", lat: 36.7012, lng: 137.2131 },
        to: { name: "高山濃飛巴士中心", address: "岐阜縣高山市昭和町", lat: 36.1415, lng: 137.2516 },
        departAt: toTakayama.date + "T08:20:00+09:00",
        arriveAt: toTakayama.date + "T10:50:00+09:00",
        cost: { amount: 3200, currency: "JPY" },
        bookingRef: "SAMPLE-TR-02",
        note: "富山轉往高山的示範巴士"
      });
    }
    return list;
  }

  function buildSampleAccommodations(tripId: string, days: Day[]): Accommodation[] {
    const list: Accommodation[] = [];
    const first = days[0];
    const leaveKanazawa = days[2];
    if (first && first.date && leaveKanazawa && leaveKanazawa.date) {
      list.push({
        id: tripId + "-stay-kanazawa",
        tripId: tripId,
        name: "金澤站前飯店",
        location: { name: "金澤站前飯店", address: "石川縣金澤市本町", lat: 36.5786, lng: 136.6495 },
        checkIn: first.date,
        checkOut: leaveKanazawa.date,
        pricePerNight: { amount: 12000, currency: "JPY" },
        rooms: 1,
        note: "金澤兩晚的示範住宿"
      });
    }
    const takayama = days[4];
    if (takayama && takayama.date) {
      list.push({
        id: tripId + "-stay-takayama",
        tripId: tripId,
        name: "高山老街旅館",
        location: { name: "高山老街旅館", address: "岐阜縣高山市上三之町", lat: 36.1428, lng: 137.2582 },
        checkIn: takayama.date,
        checkOut: addDays(takayama.date, 2),
        pricePerNight: { amount: 18000, currency: "JPY" },
        rooms: 1,
        note: "高山兩晚的示範住宿"
      });
    }
    return list;
  }

  function applySample<T extends object>(trip: T, totalDays: number): T & Trip {
    const ensured = ensureTrip(trip);
    const count = Number.isInteger(totalDays) && totalDays > 0 ? totalDays : 0;
    const days = buildDays(ensured.id, count);
    ensured.days = days;
    ensured.transports = buildSampleTransports(ensured.id, days).filter(isTransport);
    ensured.accommodations = buildSampleAccommodations(ensured.id, days).filter(isAccommodation);
    return ensured;
  }

  function materializeTransport(id: string, source: Partial<Transport>): Transport | null {
    if (!isTransportMode(source.mode)) return null;
    if (!isLocation(source.from) || !isLocation(source.to) || !isMoney(source.cost)) return null;
    if (typeof source.dayId !== "string" || source.dayId.trim() === "") return null;
    if (typeof source.departAt !== "string" || source.departAt.trim() === "") return null;
    const transport: Transport = {
      id: id,
      dayId: source.dayId,
      mode: source.mode,
      from: copyLocation(source.from),
      to: copyLocation(source.to),
      departAt: source.departAt,
      cost: copyMoney(source.cost)
    };
    if (typeof source.arriveAt === "string") transport.arriveAt = source.arriveAt;
    if (typeof source.bookingRef === "string") transport.bookingRef = source.bookingRef;
    if (typeof source.note === "string") transport.note = source.note;
    return isTransport(transport) ? transport : null;
  }

  function materializeAccommodation(id: string, tripId: string, source: Partial<Accommodation>): Accommodation | null {
    const resolvedTripId = typeof source.tripId === "string" && source.tripId.trim() !== "" ? source.tripId : tripId;
    if (typeof source.name !== "string" || source.name.trim() === "") return null;
    if (!isLocation(source.location) || !isMoney(source.pricePerNight)) return null;
    if (typeof source.checkIn !== "string" || parseIsoDate(source.checkIn) === null) return null;
    if (typeof source.checkOut !== "string" || parseIsoDate(source.checkOut) === null) return null;
    const stay: Accommodation = {
      id: id,
      tripId: resolvedTripId,
      name: source.name,
      location: copyLocation(source.location),
      checkIn: source.checkIn,
      checkOut: source.checkOut,
      pricePerNight: copyMoney(source.pricePerNight)
    };
    if (typeof source.rooms === "number") stay.rooms = source.rooms;
    if (typeof source.bookingUrl === "string") stay.bookingUrl = source.bookingUrl;
    if (typeof source.note === "string") stay.note = source.note;
    return isAccommodation(stay) ? stay : null;
  }

  function insertTransport(trip: Trip, input: TransportInput): Transport | null {
    const id = freshId(trip.transports.map(function (item) { return item.id; }), input.id);
    const created = materializeTransport(id, input);
    if (!created) return null;
    trip.transports.push(created);
    return created;
  }

  function patchTransport(trip: Trip, id: string, patch: Partial<Omit<Transport, "id">>): Transport | null {
    const index = trip.transports.findIndex(function (item) { return item.id === id; });
    const current = index < 0 ? undefined : trip.transports[index];
    if (!current) return null;
    const next = materializeTransport(current.id, Object.assign({}, current, patch, { id: current.id }));
    if (!next) return null;
    trip.transports[index] = next;
    return next;
  }

  function removeTransport(trip: Trip, id: string): boolean {
    const next = trip.transports.filter(function (item) { return item.id !== id; });
    if (next.length === trip.transports.length) return false;
    trip.transports = next;
    return true;
  }

  function insertAccommodation(trip: Trip, input: AccommodationInput): Accommodation | null {
    const id = freshId(trip.accommodations.map(function (item) { return item.id; }), input.id);
    const created = materializeAccommodation(id, trip.id, input);
    if (!created) return null;
    trip.accommodations.push(created);
    return created;
  }

  function patchAccommodation(trip: Trip, id: string, patch: Partial<Omit<Accommodation, "id">>): Accommodation | null {
    const index = trip.accommodations.findIndex(function (item) { return item.id === id; });
    const current = index < 0 ? undefined : trip.accommodations[index];
    if (!current) return null;
    const next = materializeAccommodation(current.id, trip.id, Object.assign({}, current, patch, { id: current.id }));
    if (!next) return null;
    trip.accommodations[index] = next;
    return next;
  }

  function removeAccommodation(trip: Trip, id: string): boolean {
    const next = trip.accommodations.filter(function (item) { return item.id !== id; });
    if (next.length === trip.accommodations.length) return false;
    trip.accommodations = next;
    return true;
  }

  function readyTrip(): (object & Trip) | null {
    if (!current) return null;
    current = ensureTrip(current);
    return current;
  }

  function saveTrip(): void {
    if (persist) persist();
  }

  function attach(trip: object, persistTrip?: () => void): void {
    current = ensureTrip(trip);
    persist = persistTrip || null;
  }

  function addTransport(input: TransportInput): Transport | null {
    const trip = readyTrip();
    if (!trip) return null;
    const created = insertTransport(trip, input);
    if (!created) return null;
    saveTrip();
    return created;
  }

  function updateTransport(id: string, patch: Partial<Omit<Transport, "id">>): Transport | null {
    const trip = readyTrip();
    if (!trip) return null;
    const updated = patchTransport(trip, id, patch);
    if (!updated) return null;
    saveTrip();
    return updated;
  }

  function deleteTransport(id: string): boolean {
    const trip = readyTrip();
    if (!trip) return false;
    const removed = removeTransport(trip, id);
    if (!removed) return false;
    saveTrip();
    return true;
  }

  function addAccommodation(input: AccommodationInput): Accommodation | null {
    const trip = readyTrip();
    if (!trip) return null;
    const created = insertAccommodation(trip, input);
    if (!created) return null;
    saveTrip();
    return created;
  }

  function updateAccommodation(id: string, patch: Partial<Omit<Accommodation, "id">>): Accommodation | null {
    const trip = readyTrip();
    if (!trip) return null;
    const updated = patchAccommodation(trip, id, patch);
    if (!updated) return null;
    saveTrip();
    return updated;
  }

  function deleteAccommodation(id: string): boolean {
    const trip = readyTrip();
    if (!trip) return false;
    const removed = removeAccommodation(trip, id);
    if (!removed) return false;
    saveTrip();
    return true;
  }

  const api: TripModelApi = {
    getAccommodationNights: getAccommodationNights,
    ensureTrip: ensureTrip,
    applySample: applySample,
    enrichActivity: enrichActivity,
    attach: attach,
    addTransport: addTransport,
    updateTransport: updateTransport,
    deleteTransport: deleteTransport,
    addAccommodation: addAccommodation,
    updateAccommodation: updateAccommodation,
    deleteAccommodation: deleteAccommodation
  };

  (root as typeof globalThis & { TripModel: TripModelApi }).TripModel = api;
})(globalThis);
