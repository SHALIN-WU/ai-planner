// 編譯後給瀏覽器載入的是 frontend/js/planner/*.js。這個檔只有型別。

type PlannerStep = 1 | 2 | 3 | 4;

type Pace = "relaxed" | "moderate" | "packed";

type PlaceType = "attraction" | "restaurant" | "hotel" | "shopping";

type TransportMode = "walk" | "train" | "bus" | "car" | "taxi";

type IntercityMode = "flight" | "train" | "hsr" | "bus" | "car" | "ferry" | "other";

type BudgetStatus = "ok" | "warn" | "over";

type PlanSource = "ai" | "mock";

interface Money {
  amount: number;
  currency: string;
}

interface PlaceLocation {
  name: string;
  lat: number;
  lng: number;
}

interface StayLocation {
  name: string;
  lat?: number;
  lng?: number;
}

interface TransportLeg {
  mode: TransportMode;
  minutes: number;
  /** 拖拉、新增或刪除後自動接上的交通，才會自動建議步行或電車。 */
  estimated?: boolean;
  /** 這次分鐘數來自直線距離，不是路上的實際路線。 */
  distanceEstimate?: boolean;
  /** 使用者按過儲存。自動計算不改分鐘數，除非改了交通方式。 */
  manual?: boolean;
  distanceMeters?: number;
  /** route 顯示「路線」；estimate 顯示「估算」。 */
  routeSource?: "route" | "estimate";
  cost?: Money;
}

interface ItineraryItem {
  id: string;
  type: PlaceType;
  name: string;
  description: string;
  durationMinutes: number;
  /** 還沒為了卡晚餐而拉長之前的停留。調整用餐時先回到這個長度。 */
  baseDurationMinutes?: number;
  /** 這一站停留之後、前往下一站之前的空檔。用來等晚餐，不計入景點停留。 */
  breakMinutes?: number;
  /** 最佳化後仍無法在已知收攤時間前抵達。 */
  hoursClosed?: boolean;
  cost: Money;
  location: PlaceLocation;
  transportToNext?: TransportLeg;
}

interface DayPlan {
  dayIndex: number;
  date: string;
  items: ItineraryItem[];
}

interface DayLodging {
  /** 前一晚那間。和今晚同一間時也放在這裡，表示早上從這裡出發。 */
  start: Accommodation | null;
  /** 今晚要住的那間。 */
  end: Accommodation | null;
}

interface Accommodation {
  id: string;
  name: string;
  location: StayLocation;
  checkIn: string;
  checkOut: string;
  pricePerNight: Money;
  rooms: number;
  bookingUrl?: string;
  note?: string;
}

interface IntercityTransport {
  id: string;
  mode: IntercityMode;
  from: string;
  to: string;
  departAt: string;
  arriveAt?: string;
  cost: Money;
  bookingRef?: string;
  note?: string;
}

interface TripPlan {
  id: string;
  destination: string;
  startDate: string;
  endDate: string;
  travelers: number;
  budget: Money;
  interests: string[];
  pace: Pace;
  note?: string;
  days: DayPlan[];
  accommodations: Accommodation[];
  transports: IntercityTransport[];
  /** 沒有可排時段而從當天移出的景點，可拖回其他天或刪除。 */
  unscheduled?: ItineraryItem[];
}

interface PlannerDraft {
  destination: string;
  startDate: string;
  endDate: string;
  travelers: string;
  budgetAmount: string;
  budgetCurrency: string;
  interests: string[];
  pace: Pace;
  note: string;
}

interface ReadyDraft {
  destination: string;
  startDate: string;
  endDate: string;
  travelers: number;
  budget: Money;
  interests: string[];
  pace: Pace;
  note: string;
}

interface PlanProgress {
  nextOffset: number;
  totalDays: number;
  useFallback: boolean;
  running: boolean;
  error: string;
  request: ReadyDraft;
  /** 重新產生前使用者已填的住宿，有資料時不用模型回傳的飯店蓋掉。 */
  stays: Accommodation[];
  rides: IntercityTransport[];
}

interface StayDraft {
  id: string;
  name: string;
  checkIn: string;
  checkOut: string;
  price: string;
  currency: string;
  rooms: string;
  bookingUrl: string;
  note: string;
  lat: string;
  lng: string;
}

interface RideDraft {
  id: string;
  mode: IntercityMode;
  from: string;
  to: string;
  departAt: string;
  arriveAt: string;
  price: string;
  currency: string;
  bookingRef: string;
  note: string;
}

interface LegDraft {
  itemId: string;
  mode: TransportMode;
  minutes: string;
  price: string;
  currency: string;
  originMode: TransportMode;
  distanceMeters?: number;
  routeSource?: "route" | "estimate";
  lookedUpMode?: TransportMode;
}

interface RouteProgress {
  done: number;
  total: number;
}

interface ExchangeRates {
  [code: string]: number;
}

type MapKind = "street" | "sketch";

type SketchScope =
  | { kind: "overview" }
  | { kind: "day"; index: number }
  | { kind: "city"; city: string };

interface SketchOptions {
  plan: TripPlan;
  scope: SketchScope;
  title: string;
}

interface SketchResult {
  svg: string;
  missing: number;
}

interface PlannerSketchApi {
  defaultTitle(plan: TripPlan): string;
  cities(plan: TripPlan): string[];
  render(options: SketchOptions): SketchResult;
}

interface StoredProgress {
  nextOffset: number;
  totalDays: number;
  useFallback: boolean;
  error: string;
  request: ReadyDraft;
  stays: Accommodation[];
  rides: IntercityTransport[];
}

/** 一筆行程的存檔。內容沿用原本 localStorage 那一包，不改行程欄位。 */
interface TripSnapshot {
  activeDay: number;
  rates: ExchangeRates;
  plan?: TripPlan;
  planSource?: PlanSource;
  progress?: StoredProgress;
}

interface SavedTrip {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  snapshot: TripSnapshot;
}

interface TripLibrary {
  version: 1;
  activeId: string;
  trips: SavedTrip[];
}

interface TripListItem {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  days: number;
  updatedAt: string;
}

interface PlannerState {
  step: PlannerStep;
  draft: PlannerDraft;
  error: string;
  plan: TripPlan | null;
  planSource: PlanSource | null;
  activeDay: number;
  mapKind: MapKind;
  sketchScope: SketchScope;
  sketchTitle: string;
  addOpen: boolean;
  addName: string;
  addType: PlaceType;
  addNote: string;
  /** 有值時，新增表單改為編輯這一站。空字串表示正在新增。 */
  editItemId: string;
  addAfter: number;
  stayOpen: boolean;
  stayDraft: StayDraft;
  stayError: string;
  rideOpen: boolean;
  rideDraft: RideDraft;
  rideError: string;
  legDraft: LegDraft | null;
  legError: string;
  routeProgress: RouteProgress | null;
  regen: { day: number; running: boolean; error: string } | null;
  rates: ExchangeRates;
  rateError: string;
  canUndoMove: boolean;
  progress: PlanProgress | null;
  /** 按過「最佳化路線」後，只在那一天顯示的直線距離結果。 */
  routeNote: { date: string; text: string } | null;
  libraryOpen: boolean;
  tripError: string;
  pendingDeleteId: string;
  renameId: string;
  renameDraft: string;
  tripList: TripListItem[];
  activeTripId: string;
}

interface PlaceMeta {
  icon: string;
  label: string;
}

interface CurrencyChoice {
  code: string;
  label: string;
}

interface BudgetCategory {
  key: string;
  label: string;
  amount: Money;
  ratio: number;
  originals: Money[];
  /** 跨城交通，已換成預算幣別。只有交通科目會有。 */
  intercity?: Money;
  /** 市內交通（手動站間費用與路線初估），已換成預算幣別。 */
  city?: Money;
  /** 這趟有幾段因缺座標沒有計入初估。 */
  missingSegments?: number;
  /** 交通金額裡有用到路線初估。 */
  estimated?: boolean;
}

interface DaySpend {
  date: string;
  attraction: Money;
  food: Money;
  transport: Money;
  lodging: Money;
  shopping: Money;
  other: Money;
  total: Money;
  /** 當天市內交通初估，當地貨幣、全團。不含手動費用與跨城交通。 */
  transportEstimate?: Money;
}

interface BudgetReport {
  home: string;
  categories: BudgetCategory[];
  days: DaySpend[];
  total: Money;
  perPerson: Money;
  budget: Money;
  remaining: Money;
  status: BudgetStatus;
}

interface DayClock {
  arrivals: string[];
  arrivalMinutes: number[];
  totalMinutes: number;
  endLabel: string;
  endMinutes: number;
}

interface DayBlock {
  startMinutes: number;
  endMinutes: number;
}

interface DayWindow {
  startMinutes: number;
  /** 景點最晚必須結束的分鐘。null 表示這天沒有趕車或趕機的截止。 */
  endMinutes: number | null;
  blocks: DayBlock[];
  note: string;
  /** 抵達太晚：dinner 只排晚餐，stay 直接入住。 */
  late: "" | "dinner" | "stay";
  /** 出發日要前往的出發地，用使用者填的名稱，例如「大阪」。 */
  departToward: string;
  deadlineLabel: string;
  deadlineKind: "" | "flight" | "other";
}

interface StayPlace {
  name: string;
  checkIn: string;
  checkOut: string;
  cities: string[];
}

interface DayPlaces {
  closed: boolean;
  changeover: boolean;
  cities: string[];
  tonight: StayPlace[];
  leaving: StayPlace[];
  later: { city: string; checkIn: string }[];
}

type MealSlot = "lunch" | "dinner" | "";

interface MealWindow {
  slot: "lunch" | "dinner";
  start: number;
  end: number;
  midpoint: number;
}

interface SortableDragEvent {
  oldIndex?: number;
  newIndex?: number;
  oldDraggableIndex?: number;
  newDraggableIndex?: number;
  originalEvent?: Event;
}

interface SortableInstance {
  destroy(): void;
}

interface SortableOptions {
  handle?: string;
  animation?: number;
  delay?: number;
  delayOnTouchOnly?: boolean;
  touchStartThreshold?: number;
  forceFallback?: boolean;
  fallbackOnBody?: boolean;
  fallbackTolerance?: number;
  scroll?: boolean;
  bubbleScroll?: boolean;
  ghostClass?: string;
  dragClass?: string;
  draggable?: string;
  filter?: string;
  preventOnFilter?: boolean;
  onStart?: (event: SortableDragEvent) => void;
  onEnd?: (event: SortableDragEvent) => void;
}

interface SortableStatic {
  create(element: HTMLElement, options: SortableOptions): SortableInstance;
}

interface PlannerFormatApi {
  parseIsoDate(value: string): number | null;
  addDays(isoDate: string, amount: number): string;
  inclusiveDays(start: string, end: string): number;
  nightCount(checkIn: string, checkOut: string): number;
  createId(): string;
  formatMoney(money: Money): string;
  formatDuration(minutes: number): string;
  formatDateRange(start: string, end: string): string;
  formatShortDate(iso: string): string;
  formatStayLength(start: string, end: string): string;
  formatPace(pace: Pace): string;
  paceHint(pace: Pace): string;
  transportIcon(mode: TransportMode): string;
  transportModeLabel(mode: TransportMode): string;
  intercityIcon(mode: IntercityMode): string;
  intercityModeLabel(mode: IntercityMode): string;
  placeMeta(type: PlaceType): PlaceMeta;
  isMappableLocation(location: { lat?: number; lng?: number } | null | undefined): location is { lat: number; lng: number };
  parsePastedCoords(text: string): { lat: number; lng: number } | null;
  datePart(isoDateTime: string): string;
  formatClock(isoDateTime: string): string;
  minutesOfClock(isoDateTime: string): number | null;
  straightKm(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number;
  formatDistance(meters: number): string;
  dayClock(items: ItineraryItem[], startMinutes?: number, blocks?: DayBlock[], leadMinutes?: number): DayClock;
  dayWindow(plan: TripPlan, date: string): DayWindow;
  dayClosed(window: DayWindow): boolean;
  dayPlaces(plan: TripPlan, date: string): DayPlaces;
  dayPlaceLine(plan: TripPlan, date: string): string;
  stopsFarFromStay(plan: TripPlan, day: DayPlan): boolean;
  formatMinuteClock(totalMinutes: number): string;
  clockMinutes(minutes: number): number;
  mealWindows(): MealWindow[];
  mealSlot(minutes: number): MealSlot;
  stayAnchor(stay: Accommodation): { lat: number; lng: number } | null;
  stayPoint(stay: Accommodation): { lat: number; lng: number } | null;
  cityPoint(label: string): { lat: number; lng: number } | null;
  citiesInText(text: string): string[];
  stayCoordFar(stay: Accommodation): boolean;
  dayLodging(plan: TripPlan, date: string): DayLodging;
  lodgingRole(itemName: string, lodging: DayLodging): "start" | "end" | "";
  totalCost(plan: TripPlan): Money;
  perPersonCost(plan: TripPlan): Money;
  splitPerPerson(money: Money, travelers: number): Money;
  currencyChoices(): CurrencyChoice[];
  isCurrencyCode(value: string): boolean;
}

interface PlannerRatesApi {
  homeRates(home: string): ExchangeRates;
}

interface PlannerBudgetApi {
  report(plan: TripPlan, rates: ExchangeRates): BudgetReport;
  convert(money: Money, home: string, rates: ExchangeRates): Money;
  coversNight(stay: Accommodation, isoDate: string): boolean;
  stayOriginal(stay: Accommodation): Money;
  stayHome(stay: Accommodation, home: string, rates: ExchangeRates): Money;
  toCsv(plan: TripPlan, rates: ExchangeRates): string;
}

interface PlannerMockApi {
  createPlan(ready: ReadyDraft): TripPlan;
  makeCustomItem(name: string, type: PlaceType, anchor?: PlaceLocation): ItineraryItem;
}

interface PlannerMapOptions {
  container: HTMLElement;
  items: ItineraryItem[];
  lodging: Accommodation[];
  destination: string;
  fallbackPoints: PlaceLocation[];
  onSelect: (id: string) => void;
}

type MapLineKind = "loading" | "walk" | "drive" | "transit";

interface MapSegment {
  coordinates: [number, number][];
  kind: MapLineKind;
}

interface PlannerMapApi {
  mount(options: PlannerMapOptions): void;
  unmount(): void;
  focus(id: string): void;
  cityCenter(destination: string): PlaceLocation | null;
  setRoutes(segments: MapSegment[]): void;
}

interface RouteShape {
  distanceMeters: number;
  durationMinutes: number;
  coordinates: [number, number][];
  network: boolean;
  cancelled: boolean;
}

interface PlannerGeocodeApi {
  lookup(name: string, city: string): Promise<{ lat: number; lng: number } | null>;
}

interface PlannerRemoteApi {
  onLocalHost(): boolean;
  planUrl(): string;
  geocodeUrl(name: string, city: string): string;
  passcode(): string;
  savePasscode(value: string): void;
  clearPasscode(): void;
}

interface PlannerScheduleApi {
  dayStartMinutes(): number;
  longLegMinutes(): number;
  maxExtendMinutes(): number;
  dinnerExtendMinutes(): number;
  closingMinute(item: ItineraryItem): number | null;
  dinnerStayCap(item: ItineraryItem, arrivalMinutes: number): number;
  mealEarlySlackMinutes(): number;
  stayCityMismatchKm(): number;
  separateStay(meters: number): boolean;
  mealWindows(): MealWindow[];
  travelMinutes(mode: TransportMode, meters: number, networkDurationSeconds?: number): number;
  isLegacyIntercityEstimate(mode: TransportMode, meters: number, minutes: number): boolean;
}

interface PlannerRoutesApi {
  cached(from: { lat: number; lng: number }, to: { lat: number; lng: number }, mode: TransportMode): RouteShape | null;
  preview(from: { lat: number; lng: number }, to: { lat: number; lng: number }, mode: TransportMode): RouteShape;
  lookup(from: { lat: number; lng: number }, to: { lat: number; lng: number }, mode: TransportMode, bypass: boolean): Promise<RouteShape>;
  cancelPending(): void;
  requestCount(): number;
  resetRequestCount(): void;
}

interface PlannerViewApi {
  renderApp(state: PlannerState): string;
  renderDayPanel(state: PlannerState): string;
  interestOptions(): string[];
  nextInterests(current: string[], interest: string): string[];
  quotaSentence(days: number): string;
}

declare const PlannerSchedule: PlannerScheduleApi;
declare const PlannerFormat: PlannerFormatApi;
declare const PlannerRates: PlannerRatesApi;
declare const PlannerBudget: PlannerBudgetApi;
declare const PlannerMock: PlannerMockApi;
declare const PlannerView: PlannerViewApi;
declare const PlannerMap: PlannerMapApi;
declare const PlannerSketch: PlannerSketchApi;
declare const PlannerGeocode: PlannerGeocodeApi;
declare const PlannerRoutes: PlannerRoutesApi;
declare const PlannerRemote: PlannerRemoteApi;
