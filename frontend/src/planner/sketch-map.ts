// 手繪旅遊地圖。只讀行程資料，在瀏覽器裡畫 SVG。
(function (root: typeof globalThis) {
  "use strict";

  const VIEW_W = 1200;
  const VIEW_H = 820;
  const CONTENT = { x: 32, y: 108, w: 1136, h: 684 };
  const LEGEND = { x: 930, y: 548, w: 242, h: 244 };
  const CLUSTER_KM = 40;

  const DAY_COLORS: { fill: string; stroke: string; ink: string }[] = [
    { fill: "#f8c9d4", stroke: "#e58aa0", ink: "#8f3d55" },
    { fill: "#d5ebc8", stroke: "#8fb57a", ink: "#3f6b38" },
    { fill: "#cfe6f6", stroke: "#7eb6d6", ink: "#2d6c90" },
    { fill: "#f8e0bf", stroke: "#e2b072", ink: "#8a5a24" },
    { fill: "#e6d6f6", stroke: "#b89ad8", ink: "#68448c" },
    { fill: "#f7e7a3", stroke: "#d4b84a", ink: "#7a6420" },
    { fill: "#c9efe6", stroke: "#7ec4b4", ink: "#2f6f64" },
    { fill: "#f6d5c4", stroke: "#e09a7a", ink: "#8a4e38" }
  ];
  const LABEL_SIZE = 13;
  const LABEL_MAX_W = 124;
  const OVERVIEW_R = 52;
  const MARKER_R = 46;

  const CITY_LABELS = ["白川鄉", "中部機場", "名古屋", "高山", "富山", "金澤", "大阪", "京都", "奈良", "福井", "立山", "加賀", "東京"];

  interface Anchor {
    key: string;
    lat: number;
    lng: number;
  }

  const ANCHORS: Anchor[] = [
    { key: "桃園國際機場", lat: 25.0797, lng: 121.2342 },
    { key: "台灣桃園", lat: 25.0797, lng: 121.2342 },
    { key: "桃園機場", lat: 25.0797, lng: 121.2342 },
    { key: "桃園", lat: 25.0797, lng: 121.2342 },
    { key: "羽田機場", lat: 35.5494, lng: 139.7798 },
    { key: "羽田", lat: 35.5494, lng: 139.7798 },
    { key: "成田機場", lat: 35.772, lng: 140.3929 },
    { key: "成田", lat: 35.772, lng: 140.3929 },
    { key: "關西國際機場", lat: 34.4342, lng: 135.2441 },
    { key: "關西機場", lat: 34.4342, lng: 135.2441 },
    { key: "關西", lat: 34.4342, lng: 135.2441 },
    { key: "松山機場", lat: 25.0694, lng: 121.5515 },
    { key: "台北松山", lat: 25.0694, lng: 121.5515 },
    { key: "松山", lat: 25.0694, lng: 121.5515 },
    { key: "首爾", lat: 37.5665, lng: 126.978 },
    { key: "台北", lat: 25.033, lng: 121.5654 },
    { key: "福岡", lat: 33.5904, lng: 130.4017 }
  ];

  type SketchIcon =
    | "spot"
    | "shrine"
    | "night"
    | "spring"
    | "museum"
    | "park"
    | "station"
    | "food"
    | "shop"
    | "stay"
    | "ride";

  interface SketchNode {
    id: string;
    name: string;
    subtitle: string;
    icon: SketchIcon;
    lat: number;
    lng: number;
    x: number;
    y: number;
    labelCx: number;
    labelCy: number;
    leader: boolean;
  }

  interface CitySegment {
    city: string;
    startDate: string;
    endDate: string;
    dayIndexes: number[];
  }

  interface CityStop {
    city: string;
    startDate: string;
    endDate: string;
    lat: number;
    lng: number;
    icon: SketchIcon;
    x: number;
    y: number;
  }

  interface OverviewMarker {
    city: string;
    lat: number;
    lng: number;
    x: number;
    y: number;
    r: number;
    remote: boolean;
    subtitle: string;
  }

  interface OverviewLink {
    fromKind: "stop" | "marker";
    fromIndex: number;
    toKind: "stop" | "marker";
    toIndex: number;
    label: string;
    flight: boolean;
  }

  interface OverviewModel {
    stops: CityStop[];
    markers: OverviewMarker[];
    links: OverviewLink[];
    missing: number;
  }

  interface LabelBox {
    x: number;
    y: number;
    w: number;
    h: number;
  }

  interface LabelMeasure {
    lines: string[];
    w: number;
    h: number;
  }

  interface SketchDayPath {
    dayIndex: number;
    date: string;
    city: string;
    ids: string[];
    changeLeg: number;
    /** 這一站後面是「自由時間／回飯店休息」，不是再走一趟住宿。 */
    freeAfter: { [id: string]: boolean };
    /** 單日圖才補上同間住宿的出發箭頭，並略過自由時間的來回。 */
    daySketch: boolean;
  }

  interface SketchRideArrow {
    fromId: string;
    toId: string;
    label: string;
    seed: string;
  }

  interface SketchModel {
    nodes: SketchNode[];
    days: SketchDayPath[];
    rides: SketchRideArrow[];
    missing: number;
    overview?: boolean;
  }

  interface KmPoint {
    x: number;
    y: number;
  }

  interface ClusterBox {
    x: number;
    y: number;
    w: number;
    h: number;
  }

  interface SketchCluster {
    nodes: SketchNode[];
    localX: number[];
    localY: number[];
    width: number;
    height: number;
    meanLat: number;
    meanLng: number;
  }

  ANCHORS.sort(function (left, right) {
    return right.key.length - left.key.length;
  });
  CITY_LABELS.sort(function (left, right) {
    return right.length - left.length;
  });

  function num(value: number): string {
    return String(Math.round(value * 10) / 10);
  }

  function esc(value: string): string {
    return value.replace(/[&<>"']/g, function (char) {
      if (char === "&") return "&amp;";
      if (char === "<") return "&lt;";
      if (char === ">") return "&gt;";
      if (char === '"') return "&quot;";
      return "&#39;";
    });
  }

  function hashText(text: string): number {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function unit(seed: number): number {
    const value = Math.sin(seed) * 10000;
    return value - Math.floor(value);
  }

  function clamp(value: number, min: number, max: number): number {
    if (value < min) return min;
    if (value > max) return max;
    return value;
  }

  function textWidth(text: string, size: number): number {
    let width = 0;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      width += code > 255 ? size : size * 0.56;
    }
    return width;
  }

  function defaultTitle(plan: TripPlan): string {
    const city = plan.destination.trim() !== "" ? plan.destination.trim() : "城市";
    return city + (/(?:之旅|旅遊)$/.test(city) ? "地圖" : "旅遊地圖");
  }

  function dayColor(dayIndex: number): { fill: string; stroke: string; ink: string } {
    const index = (dayIndex - 1) % DAY_COLORS.length;
    const color = DAY_COLORS[index >= 0 ? index : 0];
    return color || DAY_COLORS[0] || { fill: "#f8c9d4", stroke: "#e58aa0", ink: "#8f3d55" };
  }

  function isShrine(name: string): boolean {
    return /神社|神宮|大社|寺廟|佛閣|廟|寺/.test(name);
  }

  function iconFor(item: ItineraryItem): SketchIcon {
    if (item.type === "restaurant") return "food";
    if (item.type === "hotel") return "stay";
    if (/美食|餐廳|餐館|餐食|小吃|麵|飯|咖啡|茶館|甜點|冰品|料理|食堂|拉麵|燒肉|food|restaurant|cafe|coffee/i.test(item.name)) {
      return "food";
    }
    if (/夜市|市集|市場|night\s*market/i.test(item.name)) return "night";
    if (/溫泉|湯屋|湯泉|onsen|hot\s*spring/i.test(item.name)) return "spring";
    if (/博物館|美術館|紀念館|展覽館|museum|gallery/i.test(item.name)) return "museum";
    if (/車站|駅|機場|碼頭|轉運站|station|airport|terminal/i.test(item.name)) return "station";
    if (isShrine(item.name)) return "shrine";
    if (/公園|森林|花園|濕地|步道|湖|山|park|garden|forest/i.test(item.name)) return "park";
    if (item.type === "shopping") return "shop";
    return "spot";
  }

  function iconEnglish(icon: SketchIcon): string {
    if (icon === "shrine") return "Temple";
    if (icon === "night") return "Night Market";
    if (icon === "spring") return "Hot Springs";
    if (icon === "museum") return "Museum";
    if (icon === "park") return "Park";
    if (icon === "station") return "Station";
    if (icon === "food") return "Food";
    if (icon === "shop") return "Shopping";
    if (icon === "stay") return "Accommodation";
    if (icon === "ride") return "Transport";
    return "Attraction";
  }

  function englishSubtitle(name: string, icon: SketchIcon): string {
    const matches = name.match(/[A-Za-z][A-Za-z0-9'&., -]*/g);
    if (matches) {
      const text = matches.join(" ").replace(/\s+/g, " ").trim();
      if (text.length >= 2) return text;
    }
    return iconEnglish(icon);
  }

  function rideLabel(ride: IntercityTransport): string {
    if (ride.mode === "flight") return "飛機";
    if (ride.mode === "bus") return "巴士";
    if (ride.mode === "ferry") return "渡輪";
    if (ride.mode === "car") return "開車";
    if (ride.mode === "hsr") return "高鐵";
    if (ride.mode === "train") {
      const note = ride.note || "";
      const text = (ride.from + " " + ride.to + " " + note).toLowerCase();
      if (text.indexOf("新幹線") >= 0 || text.indexOf("shinkansen") >= 0) return "新幹線";
      return "JR";
    }
    return "其他";
  }

  function resolveName(name: string): { lat: number; lng: number } | null {
    const text = name.trim();
    if (text === "") return null;
    const lower = text.toLowerCase();
    for (let index = 0; index < ANCHORS.length; index += 1) {
      const anchor = ANCHORS[index];
      if (!anchor) continue;
      if (lower.indexOf(anchor.key.toLowerCase()) >= 0) {
        return { lat: anchor.lat, lng: anchor.lng };
      }
    }
    const exact = PlannerFormat.cityPoint(text);
    if (exact) return exact;
    for (let index = 0; index < CITY_LABELS.length; index += 1) {
      const label = CITY_LABELS[index];
      if (!label || text.indexOf(label) < 0) continue;
      const hit = PlannerFormat.cityPoint(label);
      if (hit) return hit;
    }
    return null;
  }

  function dayCity(plan: TripPlan, date: string): string {
    const places = PlannerFormat.dayPlaces(plan, date);
    if (places.cities.length > 0) return places.cities.join("、");
    const destination = plan.destination.trim();
    return destination !== "" ? destination : "旅途";
  }

  function collectCities(places: StayPlace[]): string[] {
    const found: string[] = [];
    for (let index = 0; index < places.length; index += 1) {
      const place = places[index];
      if (!place) continue;
      for (let cityIndex = 0; cityIndex < place.cities.length; cityIndex += 1) {
        const city = place.cities[cityIndex];
        if (city && found.indexOf(city) < 0) found.push(city);
      }
    }
    return found;
  }

  function cityChanged(plan: TripPlan, date: string): boolean {
    const places = PlannerFormat.dayPlaces(plan, date);
    if (!places.changeover) return false;
    const from = collectCities(places.leaving);
    const to = collectCities(places.tonight);
    if (from.length === 0 || to.length === 0) return false;
    for (let index = 0; index < from.length; index += 1) {
      const city = from[index];
      if (city && to.indexOf(city) >= 0) return false;
    }
    return true;
  }

  function project(lat: number, lng: number, lat0: number, lng0: number): KmPoint {
    const cos = Math.cos((lat0 * Math.PI) / 180);
    const safe = Math.abs(cos) < 0.2 ? (cos < 0 ? -0.2 : 0.2) : cos;
    return {
      x: (lng - lng0) * 111.32 * safe,
      y: (lat - lat0) * 110.57
    };
  }

  function compressKm(km: number): number {
    const cap = 40;
    const distance = Math.abs(km);
    if (distance <= cap) return km;
    const sign = km < 0 ? -1 : 1;
    return sign * (cap + 22 * Math.log(1 + (distance - cap) / 40));
  }

  function buildModel(plan: TripPlan, days: DayPlan[], cityFilter: string, daySketch: boolean): SketchModel {
    const nodes: SketchNode[] = [];
    const byId: { [id: string]: SketchNode } = {};
    const missing: { [key: string]: boolean } = {};
    const paths: SketchDayPath[] = [];
    const rides: SketchRideArrow[] = [];

    function miss(key: string): void {
      missing[key] = true;
    }

    function addNode(node: SketchNode): SketchNode {
      const existing = byId[node.id];
      if (existing) return existing;
      byId[node.id] = node;
      nodes.push(node);
      return node;
    }

    function ensureStay(stay: Accommodation): SketchNode | null {
      if (!PlannerFormat.isMappableLocation(stay.location)) {
        miss("stay:" + stay.id);
        return null;
      }
      return addNode({
        id: stay.id,
        name: stay.name,
        subtitle: englishSubtitle(stay.name, "stay"),
        icon: "stay",
        lat: stay.location.lat,
        lng: stay.location.lng,
        x: 0,
        y: 0,
        labelCx: 0,
        labelCy: 0,
        leader: false
      });
    }

    for (let index = 0; index < days.length; index += 1) {
      const day = days[index];
      if (!day) continue;
      const stay = dayStayCity(plan, day.date);
      if (cityFilter !== "" && stay.tonight !== cityFilter && stay.leaving !== cityFilter) continue;
      const lodging = PlannerFormat.dayLodging(plan, day.date);
      const ids: string[] = [];
      const freeAfter: { [id: string]: boolean } = {};
      const start = lodging.start;
      const end = lodging.end;
      const sameStay = start !== null && end !== null && start.id === end.id;
      const leavesStay = start !== null && (end === null || start.id !== end.id);
      if ((leavesStay || (daySketch && sameStay)) && start) {
        const node = ensureStay(start);
        if (node) ids.push(node.id);
      }
      for (let itemIndex = 0; itemIndex < day.items.length; itemIndex += 1) {
        const item = day.items[itemIndex];
        if (!item) continue;
        if (!PlannerFormat.isMappableLocation(item.location)) {
          miss("item:" + item.id);
          continue;
        }
        const icon = iconFor(item);
        const node = addNode({
          id: item.id,
          name: item.name,
          subtitle: englishSubtitle(item.name, icon),
          icon: icon,
          lat: item.location.lat,
          lng: item.location.lng,
          x: 0,
          y: 0,
          labelCx: 0,
          labelCy: 0,
          leader: false
        });
        ids.push(node.id);
        if (typeof item.breakMinutes === "number" && item.breakMinutes > 0) freeAfter[node.id] = true;
      }
      if (end) {
        let already = false;
        for (let itemIndex = 0; itemIndex < day.items.length; itemIndex += 1) {
          const item = day.items[itemIndex];
          if (item && PlannerFormat.lodgingRole(item.name, lodging) === "end") already = true;
        }
        if (!already) {
          const node = ensureStay(end);
          const last = ids.length > 0 ? ids[ids.length - 1] : "";
          if (node && node.id !== last) ids.push(node.id);
        }
      }
      let changeLeg = -1;
      if (cityChanged(plan, day.date)) changeLeg = farthestLeg(ids, byId);
      let kept = ids;
      if (cityFilter !== "") {
        const next = keepIds(ids, changeLeg, stay.leaving, stay.tonight, cityFilter);
        if (next.length !== ids.length) changeLeg = -1;
        kept = next;
      }
      if (kept.length === 0) continue;
      paths.push({
        dayIndex: day.dayIndex,
        date: day.date,
        city: cityFilter !== "" ? cityFilter : dayCity(plan, day.date),
        ids: kept,
        changeLeg: changeLeg,
        freeAfter: freeAfter,
        daySketch: daySketch
      });
    }

    const used: { [id: string]: boolean } = {};
    for (let index = 0; index < paths.length; index += 1) {
      const path = paths[index];
      if (!path) continue;
      for (let idIndex = 0; idIndex < path.ids.length; idIndex += 1) {
        const id = path.ids[idIndex];
        if (id) used[id] = true;
      }
    }
    const visibleNodes: SketchNode[] = [];
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (node && used[node.id]) visibleNodes.push(node);
    }

    let missingCount = 0;
    for (const key in missing) {
      if (missing[key]) missingCount += 1;
    }
    return { nodes: visibleNodes, days: paths, rides: rides, missing: missingCount };
  }

  function ensureHub(
    name: string,
    pos: { lat: number; lng: number },
    byId: { [id: string]: SketchNode },
    nodes: SketchNode[]
  ): SketchNode {
    const id = "hub-" + pos.lat.toFixed(2) + "-" + pos.lng.toFixed(2);
    const existing = byId[id];
    if (existing) return existing;
    const node: SketchNode = {
      id: id,
      name: name.trim(),
      subtitle: englishSubtitle(name, "ride"),
      icon: "ride",
      lat: pos.lat,
      lng: pos.lng,
      x: 0,
      y: 0,
      labelCx: 0,
      labelCy: 0,
      leader: false
    };
    byId[id] = node;
    nodes.push(node);
    return node;
  }

  function ridesOn(plan: TripPlan, date: string): IntercityTransport[] {
    const found: IntercityTransport[] = [];
    const transports = plan.transports || [];
    for (let index = 0; index < transports.length; index += 1) {
      const ride = transports[index];
      if (ride && PlannerFormat.datePart(ride.departAt) === date) found.push(ride);
    }
    return found;
  }

  function farthestLeg(ids: string[], byId: { [id: string]: SketchNode }): number {
    let best = -1;
    let bestKm = -1;
    for (let index = 0; index < ids.length - 1; index += 1) {
      const fromId = ids[index];
      const toId = ids[index + 1];
      if (!fromId || !toId) continue;
      const from = byId[fromId];
      const to = byId[toId];
      if (!from || !to) continue;
      const km = PlannerFormat.straightKm(from, to);
      if (km > bestKm) {
        bestKm = km;
        best = index;
      }
    }
    return best;
  }

  function clusterNodes(nodes: SketchNode[]): SketchNode[][] {
    if (nodes.length === 0) return [];
    let lat0 = 0;
    let lng0 = 0;
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (!node) continue;
      lat0 += node.lat;
      lng0 += node.lng;
    }
    lat0 /= nodes.length;
    lng0 /= nodes.length;
    const km: KmPoint[] = [];
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      km.push(node ? project(node.lat, node.lng, lat0, lng0) : { x: 0, y: 0 });
    }
    const used: boolean[] = [];
    for (let index = 0; index < nodes.length; index += 1) used.push(false);
    const groups: SketchNode[][] = [];
    for (let index = 0; index < nodes.length; index += 1) {
      if (used[index]) continue;
      const group: SketchNode[] = [];
      const queue: number[] = [index];
      used[index] = true;
      while (queue.length > 0) {
        const current = queue.shift();
        if (current === undefined) break;
        const node = nodes[current];
        const origin = km[current];
        if (!node || !origin) continue;
        group.push(node);
        for (let other = 0; other < nodes.length; other += 1) {
          if (used[other]) continue;
          const point = km[other];
          if (!point) continue;
          const dx = origin.x - point.x;
          const dy = origin.y - point.y;
          if (dx * dx + dy * dy <= CLUSTER_KM * CLUSTER_KM) {
            used[other] = true;
            queue.push(other);
          }
        }
      }
      if (group.length > 0) groups.push(group);
    }
    return groups;
  }

  function layoutCluster(group: SketchNode[], clusterCount: number): SketchCluster {
    let lat0 = 0;
    let lng0 = 0;
    for (let index = 0; index < group.length; index += 1) {
      const node = group[index];
      if (!node) continue;
      lat0 += node.lat;
      lng0 += node.lng;
    }
    lat0 /= group.length;
    lng0 /= group.length;
    const km: KmPoint[] = [];
    for (let index = 0; index < group.length; index += 1) {
      const node = group[index];
      km.push(node ? project(node.lat, node.lng, lat0, lng0) : { x: 0, y: 0 });
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let index = 0; index < km.length; index += 1) {
      const point = km[index];
      if (!point) continue;
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
    }
    const spanX = Math.max(0.35, maxX - minX);
    const spanY = Math.max(0.35, maxY - minY);
    const box = clusterBox(group.length, spanX, spanY, clusterCount);
    const localX: number[] = [];
    const localY: number[] = [];
    const originX: number[] = [];
    const originY: number[] = [];
    const pad = 52;
    const tiny = spanX < 0.8 && spanY < 0.8;
    for (let index = 0; index < group.length; index += 1) {
      let x = box.w / 2;
      let y = box.h / 2;
      if (group.length > 1 && tiny) {
        const angle = (index / group.length) * Math.PI * 2;
        x = box.w / 2 + Math.cos(angle) * 10;
        y = box.h / 2 + Math.sin(angle) * 10;
      } else if (group.length > 1 && !tiny) {
        const point = km[index];
        if (point) {
          x = pad + ((point.x - minX) / spanX) * (box.w - pad * 2);
          y = pad + ((maxY - point.y) / spanY) * (box.h - pad * 2);
        }
      }
      localX.push(x);
      localY.push(y);
      originX.push(x);
      originY.push(y);
    }
    const minDist = group.length > 12 ? 78 : 86;
    for (let iter = 0; iter < 70; iter += 1) {
      for (let left = 0; left < group.length; left += 1) {
        for (let right = left + 1; right < group.length; right += 1) {
          const ax = localX[left] || 0;
          const ay = localY[left] || 0;
          const bx = localX[right] || 0;
          const by = localY[right] || 0;
          let dx = bx - ax;
          let dy = by - ay;
          let dist = Math.hypot(dx, dy);
          if (dist < 0.01) {
            const angle = unit(hashText(String(left) + ":" + String(right))) * Math.PI * 2;
            dx = Math.cos(angle);
            dy = Math.sin(angle);
            dist = 1;
          }
          if (dist >= minDist) continue;
          const push = (minDist - dist) / 2;
          const ux = dx / dist;
          const uy = dy / dist;
          localX[left] = ax - ux * push;
          localY[left] = ay - uy * push;
          localX[right] = bx + ux * push;
          localY[right] = by + uy * push;
        }
      }
      for (let index = 0; index < group.length; index += 1) {
        const ox = originX[index] || 0;
        const oy = originY[index] || 0;
        const x = localX[index] || 0;
        const y = localY[index] || 0;
        localX[index] = clamp(x + (ox - x) * 0.035, 30, box.w - 30);
        localY[index] = clamp(y + (oy - y) * 0.035, 30, box.h - 30);
      }
    }
    return {
      nodes: group,
      localX: localX,
      localY: localY,
      width: box.w,
      height: box.h,
      meanLat: lat0,
      meanLng: lng0
    };
  }

  function clusterBox(count: number, spanX: number, spanY: number, clusterCount: number): { w: number; h: number } {
    const maxW = clusterCount > 1 ? 760 : 1040;
    const maxH = clusterCount > 1 ? 520 : 640;
    if (spanX < 1 && spanY < 1) {
      const side = Math.min(240, 156 + Math.max(0, count - 1) * 28);
      return { w: side, h: Math.max(128, Math.round(side * 0.78)) };
    }
    let width = Math.min(maxW, Math.max(300, 180 + count * 36));
    let height = Math.min(maxH, Math.max(220, 150 + count * 22));
    const aspect = spanX / Math.max(spanY, 0.25);
    if (aspect > 1.35) width = Math.min(maxW, Math.max(width, height * Math.min(aspect, 2)));
    if (aspect < 0.75) height = Math.min(maxH, Math.max(height, width / Math.max(aspect, 0.48)));
    return { w: Math.round(width), h: Math.round(height) };
  }

  function boxBounds(boxes: ClusterBox[]): ClusterBox {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let index = 0; index < boxes.length; index += 1) {
      const box = boxes[index];
      if (!box) continue;
      if (box.x < minX) minX = box.x;
      if (box.y < minY) minY = box.y;
      if (box.x + box.w > maxX) maxX = box.x + box.w;
      if (box.y + box.h > maxY) maxY = box.y + box.h;
    }
    if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 1, h: 1 };
    return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
  }

  function separateBoxes(boxes: ClusterBox[], gap: number): void {
    for (let iter = 0; iter < 50; iter += 1) {
      let moved = false;
      for (let left = 0; left < boxes.length; left += 1) {
        for (let right = left + 1; right < boxes.length; right += 1) {
          const a = boxes[left];
          const b = boxes[right];
          if (!a || !b) continue;
          const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          const penX = overlapX + gap;
          const penY = overlapY + gap;
          if (penX <= 0 || penY <= 0) continue;
          if (penX < penY) {
            const dir = a.x + a.w / 2 <= b.x + b.w / 2 ? -1 : 1;
            a.x += dir * penX / 2;
            b.x -= dir * penX / 2;
          } else {
            const dir = a.y + a.h / 2 <= b.y + b.h / 2 ? -1 : 1;
            a.y += dir * penY / 2;
            b.y -= dir * penY / 2;
          }
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  function fitBoxes(boxes: ClusterBox[], allowGrow: boolean, maxScale: number): void {
    let bound = boxBounds(boxes);
    let scale = Math.min(CONTENT.w / bound.w, CONTENT.h / bound.h);
    if (!allowGrow) scale = Math.min(scale, 1);
    if (scale > maxScale) scale = maxScale;
    const centerX = bound.x + bound.w / 2;
    const centerY = bound.y + bound.h / 2;
    for (let index = 0; index < boxes.length; index += 1) {
      const box = boxes[index];
      if (!box) continue;
      box.x = centerX + (box.x - centerX) * scale;
      box.y = centerY + (box.y - centerY) * scale;
      box.w *= scale;
      box.h *= scale;
    }
    bound = boxBounds(boxes);
    const shiftX = CONTENT.x + (CONTENT.w - bound.w) / 2 - bound.x;
    const shiftY = CONTENT.y + (CONTENT.h - bound.h) / 2 - bound.y;
    for (let index = 0; index < boxes.length; index += 1) {
      const box = boxes[index];
      if (!box) continue;
      box.x += shiftX;
      box.y += shiftY;
    }
  }

  function hitsLegend(x: number, y: number): boolean {
    return x > LEGEND.x - 30 && x < LEGEND.x + LEGEND.w + 6 && y > LEGEND.y - 26 && y < LEGEND.y + LEGEND.h + 6;
  }

  function placeNodes(nodes: SketchNode[], tight: boolean, minDistance?: number): void {
    const groups = clusterNodes(nodes);
    const clusters: SketchCluster[] = [];
    for (let index = 0; index < groups.length; index += 1) {
      const group = groups[index];
      if (group) clusters.push(layoutCluster(group, groups.length));
    }
    if (clusters.length === 0) return;
    let lat0 = 0;
    let lng0 = 0;
    for (let index = 0; index < clusters.length; index += 1) {
      const cluster = clusters[index];
      if (!cluster) continue;
      lat0 += cluster.meanLat;
      lng0 += cluster.meanLng;
    }
    lat0 /= clusters.length;
    lng0 /= clusters.length;
    const boxes: ClusterBox[] = [];
    for (let index = 0; index < clusters.length; index += 1) {
      const cluster = clusters[index];
      if (!cluster) continue;
      const point = project(cluster.meanLat, cluster.meanLng, lat0, lng0);
      const cx = compressKm(point.x) * 3.4;
      const cy = -compressKm(point.y) * 3.4;
      boxes.push({
        x: cx - cluster.width / 2,
        y: cy - cluster.height / 2,
        w: cluster.width,
        h: cluster.height
      });
    }
    separateBoxes(boxes, 64);
    fitBoxes(boxes, tight || clusters.length === 1, tight ? 8 : 1.4);
    for (let index = 0; index < clusters.length; index += 1) {
      const cluster = clusters[index];
      const box = boxes[index];
      if (!cluster || !box) continue;
      for (let nodeIndex = 0; nodeIndex < cluster.nodes.length; nodeIndex += 1) {
        const node = cluster.nodes[nodeIndex];
        if (!node) continue;
        const lx = cluster.localX[nodeIndex] || 0;
        const ly = cluster.localY[nodeIndex] || 0;
        node.x = box.x + (lx / cluster.width) * box.w;
        node.y = box.y + (ly / cluster.height) * box.h;
      }
    }
    nudgePage(nodes, minDistance === undefined ? 84 : minDistance);
  }

  function nudgePage(nodes: SketchNode[], minDistance: number): void {
    const homes: KmPoint[] = [];
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      homes.push(node ? { x: node.x, y: node.y } : { x: 0, y: 0 });
    }
    for (let iter = 0; iter < 80; iter += 1) {
      for (let left = 0; left < nodes.length; left += 1) {
        for (let right = left + 1; right < nodes.length; right += 1) {
          const a = nodes[left];
          const b = nodes[right];
          if (!a || !b) continue;
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let dist = Math.hypot(dx, dy);
          if (dist < 0.01) {
            dx = 1;
            dy = 0;
            dist = 1;
          }
          if (dist >= minDistance) continue;
          const push = (minDistance - dist) / 2;
          a.x -= (dx / dist) * push;
          a.y -= (dy / dist) * push;
          b.x += (dx / dist) * push;
          b.y += (dy / dist) * push;
        }
      }
      for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index];
        const home = homes[index];
        if (!node || !home) continue;
        node.x += (home.x - node.x) * 0.018;
        node.y += (home.y - node.y) * 0.018;
        node.x = clamp(node.x, 48, VIEW_W - 48);
        node.y = clamp(node.y, 150, VIEW_H - 48);
        if (hitsLegend(node.x, node.y)) node.x = LEGEND.x - 44;
      }
    }
  }

  function iconDefs(): string {
    return [
      '<symbol id="sk-spot" viewBox="0 0 32 32">',
      '<path d="M4 24 L12 12 L16 18 L21 9 L28 24 Z" fill="#b7d7a8" stroke="#6a4a42" stroke-width="1.6" stroke-linejoin="round"/>',
      '<circle cx="23" cy="8" r="2.3" fill="#f6d56a" stroke="#6a4a42" stroke-width="1.2"/>',
      "</symbol>",
      '<symbol id="sk-shrine" viewBox="0 0 32 32">',
      '<path d="M5 8c5-3.2 17-3.2 22 0" fill="none" stroke="#d4536e" stroke-width="2.2" stroke-linecap="round"/>',
      '<path d="M6 11h20" stroke="#d4536e" stroke-width="3" stroke-linecap="round"/>',
      '<path d="M9 15h14" stroke="#d4536e" stroke-width="2" stroke-linecap="round"/>',
      '<path d="M11 15v11M21 15v11" stroke="#6a4a42" stroke-width="2.1" stroke-linecap="round"/>',
      "</symbol>",
      '<symbol id="sk-night" viewBox="0 0 32 32">',
      '<path d="M5 11h22l-2-5H7z" fill="#f5a8b8" stroke="#6a4a42" stroke-width="1.5"/>',
      '<path d="M7 11v15h18V11M11 11v4M16 11v4M21 11v4" fill="#fff3d6" stroke="#6a4a42" stroke-width="1.5"/>',
      '<circle cx="12" cy="21" r="2" fill="#e9b85e"/><circle cx="20" cy="21" r="2" fill="#de796f"/>',
      "</symbol>",
      '<symbol id="sk-spring" viewBox="0 0 32 32">',
      '<path d="M5 18c3 9 19 9 22 0z" fill="#a9dbea" stroke="#6a4a42" stroke-width="1.5"/>',
      '<path d="M9 16c2-3-2-4 0-8M16 16c2-3-2-4 0-9M23 16c2-3-2-4 0-8" fill="none" stroke="#72aec2" stroke-width="1.8" stroke-linecap="round"/>',
      "</symbol>",
      '<symbol id="sk-museum" viewBox="0 0 32 32">',
      '<path d="M4 11l12-6 12 6zM6 13h20M8 13v11M13 13v11M19 13v11M24 13v11M5 26h22" fill="#f6dfad" stroke="#6a4a42" stroke-width="1.5" stroke-linejoin="round"/>',
      "</symbol>",
      '<symbol id="sk-park" viewBox="0 0 32 32">',
      '<path d="M7 24l6-10h-3l6-9 6 9h-3l6 10z" fill="#8fc584" stroke="#55734d" stroke-width="1.4" stroke-linejoin="round"/>',
      '<path d="M16 20v7" stroke="#795548" stroke-width="2"/>',
      "</symbol>",
      '<symbol id="sk-station" viewBox="0 0 32 32">',
      '<rect x="6" y="5" width="20" height="20" rx="5" fill="#b9d9e8" stroke="#6a4a42" stroke-width="1.6"/>',
      '<path d="M10 10h12v7H10zM9 27l3-4M23 27l-3-4" fill="#fffaf0" stroke="#6a4a42" stroke-width="1.4"/>',
      '<circle cx="11" cy="21" r="1.7" fill="#6a4a42"/><circle cx="21" cy="21" r="1.7" fill="#6a4a42"/>',
      "</symbol>",
      '<symbol id="sk-food" viewBox="0 0 32 32">',
      '<path d="M7 15h18c0 6.2-4 10-9 10s-9-3.8-9-10z" fill="#fff6ea" stroke="#6a4a42" stroke-width="1.6" stroke-linejoin="round"/>',
      '<path d="M10 15c1.2 3 10.6 3 12 0" fill="none" stroke="#e2b072" stroke-width="1.5" stroke-linecap="round"/>',
      '<path d="M20 6l6 5M23 5l6 5" fill="none" stroke="#6a4a42" stroke-width="1.5" stroke-linecap="round"/>',
      "</symbol>",
      '<symbol id="sk-shop" viewBox="0 0 32 32">',
      '<path d="M9 13h14v13H9z" fill="#f8c9d4" stroke="#6a4a42" stroke-width="1.6" stroke-linejoin="round"/>',
      '<path d="M12 13v-2.2a4 4 0 0 1 8 0V13" fill="none" stroke="#6a4a42" stroke-width="1.6" stroke-linecap="round"/>',
      "</symbol>",
      '<symbol id="sk-stay" viewBox="0 0 32 32">',
      '<path d="M5 16 L16 7 L27 16" fill="#f4a8b8" stroke="#6a4a42" stroke-width="1.6" stroke-linejoin="round"/>',
      '<path d="M9 16h14v10H9z" fill="#fff8f3" stroke="#6a4a42" stroke-width="1.6" stroke-linejoin="round"/>',
      '<path d="M14 20h4v6h-4z" fill="#e2b08a"/>',
      "</symbol>",
      '<symbol id="sk-ride" viewBox="0 0 32 32">',
      '<rect x="6" y="8" width="20" height="13" rx="4" fill="#cfe6c4" stroke="#6a4a42" stroke-width="1.6"/>',
      '<rect x="9" y="11" width="5" height="4" rx="1" fill="#fffaf6"/>',
      '<rect x="18" y="11" width="5" height="4" rx="1" fill="#fffaf6"/>',
      '<circle cx="11" cy="24" r="2" fill="#6a4a42"/>',
      '<circle cx="21" cy="24" r="2" fill="#6a4a42"/>',
      "</symbol>",
      '<symbol id="sk-plane" viewBox="0 0 32 32">',
      '<path d="M3 17h9l3.2-8h2.6L16 17h9.2l2.4-3.2H30v4.4h-2.4L25.2 15H16l1.8 8h-2.6L12 15H3z" fill="#d7ebf8" stroke="#6a4a42" stroke-width="1.4" stroke-linejoin="round"/>',
      "</symbol>",
      '<symbol id="sk-sakura" viewBox="0 0 64 64">',
      '<g fill="#f3a8ba">',
      '<ellipse cx="32" cy="14" rx="7" ry="12"/>',
      '<ellipse cx="32" cy="14" rx="7" ry="12" transform="rotate(72 32 32)"/>',
      '<ellipse cx="32" cy="14" rx="7" ry="12" transform="rotate(144 32 32)"/>',
      '<ellipse cx="32" cy="14" rx="7" ry="12" transform="rotate(216 32 32)"/>',
      '<ellipse cx="32" cy="14" rx="7" ry="12" transform="rotate(288 32 32)"/>',
      "</g>",
      '<circle cx="32" cy="32" r="4.5" fill="#f6e39a"/>',
      "</symbol>",
      '<symbol id="sk-mountain" viewBox="0 0 64 44">',
      '<path d="M2 41L22 10l9 13L43 5l19 36z" fill="#91c486" stroke="#527252" stroke-width="2" stroke-linejoin="round"/>',
      '<path d="M16 19l6-9 6 9-5-2zM36 15l7-10 8 14-8-4z" fill="#fff8ed" opacity=".9"/>',
      "</symbol>",
      '<symbol id="sk-tree" viewBox="0 0 28 42">',
      '<path d="M14 7L4 24h7L6 33h16l-5-9h7z" fill="#6fa66b" stroke="#4f704e" stroke-width="1.5" stroke-linejoin="round"/>',
      '<path d="M14 31v9" stroke="#805d45" stroke-width="2.5"/>',
      "</symbol>"
    ].join("");
  }

  function sakura(x: number, y: number, scale: number, rotate: number, opacity: number): string {
    return '<g transform="translate(' + num(x) + " " + num(y) + ") rotate(" + num(rotate) + ') scale(' + num(scale) +
      ')" opacity="' + num(opacity) + '" pointer-events="none">' +
      '<use href="#sk-sakura" xlink:href="#sk-sakura" x="-32" y="-32" width="64" height="64"/>' +
      "</g>";
  }

  function blobPath(x: number, y: number, w: number, h: number, seed: number): string {
    const radius = Math.min(28, w / 5, h / 5);
    function j(step: number): number {
      return (unit(seed + step * 19) - 0.5) * 10;
    }
    const x0 = x + j(1);
    const y0 = y + j(2);
    const x1 = x + w + j(3);
    const y1 = y + h + j(4);
    return [
      "M", num(x0 + radius), num(y0),
      "L", num(x1 - radius), num(y0),
      "Q", num(x1), num(y0), num(x1), num(y0 + radius),
      "L", num(x1), num(y1 - radius),
      "Q", num(x1), num(y1), num(x1 - radius), num(y1),
      "L", num(x0 + radius), num(y1),
      "Q", num(x0), num(y1), num(x0), num(y1 - radius),
      "L", num(x0), num(y0 + radius),
      "Q", num(x0), num(y0), num(x0 + radius), num(y0),
      "Z"
    ].join(" ");
  }

  function nodeById(nodes: SketchNode[]): { [id: string]: SketchNode } {
    const map: { [id: string]: SketchNode } = {};
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (node) map[node.id] = node;
    }
    return map;
  }

  function shorten(x1: number, y1: number, x2: number, y2: number, gap: number): KmPoint {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const cut = Math.min(gap, len * 0.42);
    return { x: x2 - (dx / len) * cut, y: y2 - (dy / len) * cut };
  }

  function curveParts(x1: number, y1: number, x2: number, y2: number, bend: number): { d: string; lx: number; ly: number; tx: number; ty: number; ex: number; ey: number } {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const cx = (x1 + x2) / 2 + (-dy / len) * bend;
    const cy = (y1 + y2) / 2 + (dx / len) * bend;
    return {
      d: "M" + num(x1) + " " + num(y1) + " Q" + num(cx) + " " + num(cy) + " " + num(x2) + " " + num(y2),
      lx: 0.25 * x1 + 0.5 * cx + 0.25 * x2,
      ly: 0.25 * y1 + 0.5 * cy + 0.25 * y2,
      tx: x2 - cx,
      ty: y2 - cy,
      ex: x2,
      ey: y2
    };
  }

  function arrowHead(x: number, y: number, tx: number, ty: number, color: string, size: number): string {
    const len = Math.hypot(tx, ty) || 1;
    const ux = tx / len;
    const uy = ty / len;
    const bx = x - ux * size;
    const by = y - uy * size;
    const wing = size * 0.55;
    const px = -uy * wing;
    const py = ux * wing;
    return '<polygon points="' + num(x) + "," + num(y) + " " + num(bx + px) + "," + num(by + py) + " " +
      num(bx - px) + "," + num(by - py) + '" fill="' + color + '"/>';
  }

  function drawArrow(
    from: { x: number; y: number },
    to: { x: number; y: number },
    bend: number,
    color: string,
    width: number,
    dashed: boolean,
    label: string,
    gap?: number,
    endGap?: number,
    minSpan?: number,
    labelAt?: { x: number; y: number }
  ): string {
    const inset = gap === undefined ? 26 : gap;
    const outInset = endGap === undefined ? inset : endGap;
    const start = shorten(to.x, to.y, from.x, from.y, inset);
    const end = shorten(from.x, from.y, to.x, to.y, outInset + 2);
    if (Math.hypot(end.x - start.x, end.y - start.y) < (minSpan === undefined ? 18 : minSpan)) return "";
    const curve = curveParts(start.x, start.y, end.x, end.y, bend);
    const dash = dashed ? ' stroke-dasharray="7 6"' : "";
    const head = width >= 11 ? 22 : width >= 7 ? 16 : 11;
    let body = '<path d="' + curve.d + '" fill="none" stroke="#fffaf6" stroke-width="' + num(width + 3.4) +
      '" stroke-linecap="round"' + dash + '/>' +
      '<path d="' + curve.d + '" fill="none" stroke="' + color + '" stroke-width="' + num(width) +
      '" stroke-linecap="round"' + dash + '/>' +
      arrowHead(curve.ex, curve.ey, curve.tx, curve.ty, color, head);
    if (label !== "") {
      const pill = textWidth(label, 13) + 18;
      const labelX = labelAt ? labelAt.x : curve.lx;
      const labelY = labelAt ? labelAt.y : curve.ly;
      body += '<rect x="' + num(labelX - pill / 2) + '" y="' + num(labelY - 12) + '" width="' + num(pill) +
        '" height="22" rx="11" fill="#fffaf6" stroke="#e7b7a8" stroke-width="1.4"/>' +
        '<text x="' + num(labelX) + '" y="' + num(labelY + 4) +
        '" text-anchor="middle" font-family="jf open huninn, sans-serif" font-size="13" fill="#7a4450">' +
        esc(label) + "</text>";
    }
    return body;
  }

  interface DayPlate {
    d: string;
    fill: string;
    stroke: string;
    heading: string;
    ink: string;
    titleX: number;
    titleY: number;
    pill: number;
  }

  function dayPlates(model: SketchModel, byId: { [id: string]: SketchNode }): DayPlate[] {
    const plates: DayPlate[] = [];
    for (let index = 0; index < model.days.length; index += 1) {
      const day = model.days[index];
      if (!day || day.ids.length === 0) continue;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let idIndex = 0; idIndex < day.ids.length; idIndex += 1) {
        const id = day.ids[idIndex];
        if (!id) continue;
        const node = byId[id];
        if (!node) continue;
        if (node.x < minX) minX = node.x;
        if (node.y < minY) minY = node.y;
        if (node.x > maxX) maxX = node.x;
        if (node.y > maxY) maxY = node.y;
      }
      if (!Number.isFinite(minX)) continue;
      const color = dayColor(day.dayIndex);
      const heading = "Day " + String(day.dayIndex) + " " + PlannerFormat.formatShortDate(day.date);
      let x = minX - 36;
      let y = minY - 52;
      let w = Math.max(128, maxX - minX + 72);
      let h = Math.max(96, maxY - minY + 86);
      const titleW = textWidth(heading, 15) + 28;
      if (w < titleW) {
        x -= (titleW - w) / 2;
        w = titleW;
      }
      if (y < 78) y = 78;
      h = Math.max(h, maxY + 34 - y);
      const pill = textWidth(heading, 15) + 20;
      plates.push({
        d: blobPath(x, y, w, h, hashText(day.date + ":" + String(day.dayIndex))),
        fill: color.fill,
        stroke: color.stroke,
        heading: heading,
        ink: color.ink,
        titleX: x + w / 2,
        titleY: y + 26,
        pill: pill
      });
    }
    return plates;
  }

  function drawDayBlobs(plates: DayPlate[]): string {
    let body = "";
    for (let index = 0; index < plates.length; index += 1) {
      const plate = plates[index];
      if (!plate) continue;
      body += '<path d="' + plate.d + '" fill="' + plate.fill + '" fill-opacity="0.72" stroke="' + plate.stroke +
        '" stroke-width="2.4"/>';
    }
    return body;
  }

  function titleRectsHit(
    left: { x: number; y: number; w: number; h: number },
    right: { x: number; y: number; w: number; h: number }
  ): boolean {
    return left.x < right.x + right.w + 8 && left.x + left.w + 8 > right.x &&
      left.y < right.y + right.h + 6 && left.y + left.h + 6 > right.y;
  }

  function drawDayTitles(plates: DayPlate[], nodes: SketchNode[]): string {
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (!node) continue;
      const ink = inkExtents(node);
      placed.push({
        x: node.x + ink.left - 5,
        y: node.y + ink.top - 5,
        w: ink.right - ink.left + 10,
        h: ink.bottom - ink.top + 10
      });
    }
    const shifts = [
      { dx: 0, dy: 0 },
      { dx: 0, dy: -32 },
      { dx: 0, dy: -64 },
      { dx: 0, dy: -96 },
      { dx: 0, dy: 34 },
      { dx: 0, dy: 68 },
      { dx: -56, dy: -32 },
      { dx: 56, dy: -32 },
      { dx: -56, dy: 0 },
      { dx: 56, dy: 0 },
      { dx: -112, dy: -32 },
      { dx: 112, dy: -32 },
      { dx: -112, dy: 0 },
      { dx: 112, dy: 0 },
      { dx: -168, dy: -64 },
      { dx: 168, dy: -64 },
      { dx: -168, dy: 34 },
      { dx: 168, dy: 34 }
    ];
    let body = "";
    for (let index = 0; index < plates.length; index += 1) {
      const plate = plates[index];
      if (!plate) continue;
      let titleX = plate.titleX;
      let titleY = plate.titleY;
      for (let shiftIndex = 0; shiftIndex < shifts.length; shiftIndex += 1) {
        const shift = shifts[shiftIndex];
        if (!shift) continue;
        const x = plate.titleX + shift.dx;
        const y = plate.titleY + shift.dy;
        const rect = { x: x - plate.pill / 2, y: y - 16, w: plate.pill, h: 24 };
        if (rect.x < 12 || rect.x + rect.w > VIEW_W - 12 || rect.y < 74 || rect.y + rect.h > VIEW_H - 12) continue;
        let hit = false;
        for (let placedIndex = 0; placedIndex < placed.length; placedIndex += 1) {
          const other = placed[placedIndex];
          if (other && titleRectsHit(rect, other)) {
            hit = true;
            break;
          }
        }
        if (hit) continue;
        titleX = x;
        titleY = y;
        break;
      }
      const rect = { x: titleX - plate.pill / 2, y: titleY - 16, w: plate.pill, h: 24 };
      placed.push(rect);
      body += '<rect x="' + num(rect.x) + '" y="' + num(rect.y) + '" width="' + num(plate.pill) +
        '" height="24" rx="12" fill="#fffaf6" fill-opacity="0.96"/>' +
        '<text x="' + num(titleX) + '" y="' + num(titleY + 2) +
        '" text-anchor="middle" font-family="jf open huninn, sans-serif" font-size="15" fill="' + plate.ink + '">' +
        esc(plate.heading) + "</text>";
    }
    return body;
  }

  /**
   * 單日圖若在自由時間後把住宿插進兩站中間，改畫直達下一站。
   * 出發（住宿 → 第一站）與收尾（最後一站 → 住宿）仍保留。
   */
  function dayLegs(day: SketchDayPath, byId: { [id: string]: SketchNode }): { fromId: string; toId: string; sourceIndex: number }[] {
    const legs: { fromId: string; toId: string; sourceIndex: number }[] = [];
    let leg = 0;
    while (leg < day.ids.length - 1) {
      const fromId = day.ids[leg];
      let toIndex = leg + 1;
      let toId = day.ids[toIndex];
      if (day.daySketch && fromId && toId && day.freeAfter[fromId]) {
        const toNode = byId[toId];
        const afterId = day.ids[toIndex + 1];
        const afterNode = afterId ? byId[afterId] : undefined;
        if (toNode && toNode.icon === "stay" && afterNode && afterNode.icon !== "stay" && afterId) {
          toId = afterId;
          toIndex += 1;
        }
      }
      if (fromId && toId && fromId !== toId) legs.push({ fromId: fromId, toId: toId, sourceIndex: leg });
      leg = toIndex;
    }
    return legs;
  }

  function routeBend(from: SketchNode, to: SketchNode, base: number, nodes: SketchNode[], gentle: boolean): number {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const origin = gentle ? clamp(base, -10, 10) : base;
    const candidates = gentle
      ? [origin, origin + 10, origin - 10, origin + 20, origin - 20]
      : [origin, origin + 48, origin - 48, origin + 88, origin - 88, origin + 128, origin - 128];
    let best = origin;
    let bestScore = Infinity;
    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
      const bend = candidates[candidateIndex] || 0;
      const cx = (from.x + to.x) / 2 + (-dy / len) * bend;
      const cy = (from.y + to.y) / 2 + (dx / len) * bend;
      let score = Math.abs(bend - origin) * (gentle ? 0.45 : 0.04) + (gentle ? Math.abs(bend) * 0.15 : 0);
      for (let step = 1; step < 12; step += 1) {
        const t = step / 12;
        const omt = 1 - t;
        const x = omt * omt * from.x + 2 * omt * t * cx + t * t * to.x;
        const y = omt * omt * from.y + 2 * omt * t * cy + t * t * to.y;
        if (x < 24 || x > VIEW_W - 24 || y < 92 || y > VIEW_H - 18) score += 80;
        for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
          const node = nodes[nodeIndex];
          if (!node) continue;
          const measure = measureLabel(node.name, node.subtitle);
          const box = labelBoxAt(node, node.labelCx, node.labelCy, measure.w, measure.h);
          if (x > box.x - 7 && x < box.x + box.w + 7 && y > box.y - 7 && y < box.y + box.h + 7) {
            score += 120;
          }
          if (node.id !== from.id && node.id !== to.id && Math.hypot(x - node.x, y - node.y) < 24) score += 40;
        }
      }
      if (score < bestScore) {
        bestScore = score;
        best = bend;
      }
      if (score < 1) break;
    }
    return best;
  }

  function routeLabelPoint(
    from: SketchNode,
    to: SketchNode,
    bend: number,
    label: string,
    nodes: SketchNode[],
    used: LabelBox[]
  ): KmPoint {
    const curve = curveParts(from.x, from.y, to.x, to.y, bend);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const tx = dx / len;
    const ty = dy / len;
    const pillW = textWidth(label, 13) + 18;
    const offsets = [
      { normal: 0, along: 0 },
      { normal: 18, along: 0 }, { normal: -18, along: 0 },
      { normal: 30, along: 0 }, { normal: -30, along: 0 },
      { normal: 18, along: 30 }, { normal: -18, along: 30 },
      { normal: 18, along: -30 }, { normal: -18, along: -30 },
      { normal: 42, along: 0 }, { normal: -42, along: 0 },
      { normal: 54, along: 0 }, { normal: -54, along: 0 },
      { normal: 30, along: 54 }, { normal: -30, along: 54 },
      { normal: 30, along: -54 }, { normal: -30, along: -54 },
      { normal: 52, along: 42 }, { normal: -52, along: 42 },
      { normal: 52, along: -42 }, { normal: -52, along: -42 },
      { normal: 0, along: 64 }, { normal: 0, along: -64 }
    ];
    let best = { x: curve.lx, y: curve.ly };
    let bestScore = Infinity;
    for (let index = 0; index < offsets.length; index += 1) {
      const offset = offsets[index];
      if (!offset) continue;
      const x = curve.lx + nx * offset.normal + tx * offset.along;
      const y = curve.ly + ny * offset.normal + ty * offset.along;
      const box: LabelBox = { x: x - pillW / 2, y: y - 12, w: pillW, h: 22 };
      if (box.x < 12 || box.x + box.w > VIEW_W - 12 || box.y < 78 || box.y + box.h > VIEW_H - 12) continue;
      let score = Math.abs(offset.normal) * 0.08 + Math.abs(offset.along) * 0.05;
      for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
        const node = nodes[nodeIndex];
        if (!node) continue;
        const measure = measureLabel(node.name, node.subtitle);
        const labelBox = labelBoxAt(node, node.labelCx, node.labelCy, measure.w, measure.h);
        if (boxesOverlap(box, labelBox, 5)) score += 500;
        const nearX = clamp(node.x, box.x, box.x + box.w);
        const nearY = clamp(node.y, box.y, box.y + box.h);
        if (Math.hypot(node.x - nearX, node.y - nearY) < 23) score += 500;
      }
      for (let usedIndex = 0; usedIndex < used.length; usedIndex += 1) {
        const other = used[usedIndex];
        if (other && boxesOverlap(box, other, 5)) score += 400;
      }
      if (score < bestScore) {
        bestScore = score;
        best = { x: x, y: y };
      }
      if (score < 4) break;
    }
    used.push({ x: best.x - pillW / 2, y: best.y - 12, w: pillW, h: 22 });
    return best;
  }

  function drawLinks(model: SketchModel, byId: { [id: string]: SketchNode }): string {
    let body = "";
    const routeLabels: LabelBox[] = [];
    for (let index = 0; index < model.days.length; index += 1) {
      const day = model.days[index];
      if (!day) continue;
      const color = dayColor(day.dayIndex);
      const legs = dayLegs(day, byId);
      for (let legIndex = 0; legIndex < legs.length; legIndex += 1) {
        const leg = legs[legIndex];
        if (!leg) continue;
        const from = byId[leg.fromId];
        const to = byId[leg.toId];
        if (!from || !to) continue;
        const baseBend = (unit(hashText(from.id + ">" + to.id)) - 0.5) * 36;
        const bend = routeBend(from, to, baseBend, model.nodes, !!model.overview);
        const hop = sameDayHopLabel(from, to);
        const arrowBend = hop !== "" || leg.sourceIndex === day.changeLeg ? (bend === 0 ? 28 : bend) : bend;
        const arrowColor = hop !== "" || leg.sourceIndex === day.changeLeg ? color.ink : color.stroke;
        const arrowWidth = hop !== "" || leg.sourceIndex === day.changeLeg ? 5 : 2.5;
        const arrowDash = true;
        const arrowLabel = legIndex === 0
          ? "Day " + String(day.dayIndex)
          : hop !== "" ? hop : leg.sourceIndex === day.changeLeg ? "移動" : "";
        const labelAt = arrowLabel === ""
          ? undefined
          : routeLabelPoint(from, to, arrowBend, arrowLabel, model.nodes, routeLabels);
        body += drawArrow(from, to, arrowBend, arrowColor, arrowWidth, arrowDash, arrowLabel, undefined, undefined, undefined, labelAt);
      }
    }
    for (let index = 0; index < model.rides.length; index += 1) {
      const ride = model.rides[index];
      if (!ride) continue;
      const from = byId[ride.fromId];
      const to = byId[ride.toId];
      if (!from || !to) continue;
      const sign = index % 2 === 0 ? 1 : -1;
      const bend = sign * (42 + (index % 3) * 10);
      body += drawArrow(from, to, bend, "#c45b78", 5.2, false, ride.label);
    }
    return body;
  }

  function ellipsis(text: string, maxW: number, size: number): string {
    if (textWidth(text, size) <= maxW) return text;
    let low = 0;
    let high = text.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      const slice = text.slice(0, mid).trimEnd() + "…";
      if (textWidth(slice, size) <= maxW) low = mid;
      else high = mid - 1;
    }
    const cut = text.slice(0, low).trimEnd();
    return cut === "" ? "…" : cut + "…";
  }

  function abbreviateWords(text: string): string {
    const words = text.split(" ");
    const next: string[] = [];
    for (let index = 0; index < words.length; index += 1) {
      const word = words[index];
      if (!word) continue;
      const lower = word.toLowerCase().replace(/\./g, "");
      if (lower === "station") next.push("Sta.");
      else if (lower === "international") next.push("Int'l");
      else if (lower === "airport") next.push("Apt.");
      else next.push(word);
    }
    return next.join(" ");
  }

  function balancedSplit(text: string, size: number): [string, string] | null {
    const words = text.split(" ");
    if (words.length < 2) return null;
    let best: [string, string] | null = null;
    let bestScore = Infinity;
    for (let index = 1; index < words.length; index += 1) {
      const left = words.slice(0, index).join(" ");
      const right = words.slice(index).join(" ");
      const leftW = textWidth(left, size);
      const rightW = textWidth(right, size);
      const score = Math.max(leftW, rightW) * 1000 + Math.abs(leftW - rightW);
      if (score < bestScore) {
        bestScore = score;
        best = [left, right];
      }
    }
    return best;
  }

  function splitChars(text: string, maxW: number, size: number): string[] {
    if (!/[^\u0000-\u00ff]/.test(text)) return [ellipsis(text, maxW, size)];
    let line = "";
    for (let index = 0; index < text.length; index += 1) {
      const next = line + text.charAt(index);
      if (line !== "" && textWidth(next, size) > maxW) break;
      line = next;
    }
    const rest = text.slice(line.length);
    if (rest === "") return [line];
    return [line, ellipsis(rest, maxW, size)];
  }

  function labelLines(name: string): string[] {
    const text = name.trim().replace(/\s+/g, " ");
    if (text === "") return [""];
    if (textWidth(text, LABEL_SIZE) <= LABEL_MAX_W) return [text];
    const split = balancedSplit(text, LABEL_SIZE);
    if (split && textWidth(split[0], LABEL_SIZE) <= LABEL_MAX_W && textWidth(split[1], LABEL_SIZE) <= LABEL_MAX_W) {
      return [split[0], split[1]];
    }
    const short = abbreviateWords(text);
    if (short !== text && textWidth(short, LABEL_SIZE) <= LABEL_MAX_W) return [short];
    const shortSplit = balancedSplit(short, LABEL_SIZE);
    if (shortSplit) return [ellipsis(shortSplit[0], LABEL_MAX_W, LABEL_SIZE), ellipsis(shortSplit[1], LABEL_MAX_W, LABEL_SIZE)];
    return splitChars(text, LABEL_MAX_W, LABEL_SIZE);
  }

  function measureLabel(name: string, subtitle: string): LabelMeasure {
    const lines = labelLines(name);
    let maxW = 0;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (line) maxW = Math.max(maxW, textWidth(line, LABEL_SIZE));
    }
    maxW = Math.max(maxW, textWidth(ellipsis(subtitle, LABEL_MAX_W, 10), 10));
    return { lines: lines, w: Math.max(38, maxW + 14), h: lines.length * 16 + 21 };
  }

  function leaderLine(cx: number, cy: number, w: number, h: number): string {
    const left = cx - w / 2;
    const top = cy - h / 2;
    const right = left + w;
    const bottom = top + h;
    let endX = cx;
    let endY = cy;
    let bestT = 1;
    function consider(t: number, x: number, y: number): void {
      if (!(t > 0.05 && t < bestT)) return;
      if (x < left - 0.8 || x > right + 0.8 || y < top - 0.8 || y > bottom + 0.8) return;
      bestT = t;
      endX = x;
      endY = y;
    }
    if (Math.abs(cx) > 0.01) {
      consider(left / cx, left, cy * (left / cx));
      consider(right / cx, right, cy * (right / cx));
    }
    if (Math.abs(cy) > 0.01) {
      consider(top / cy, cx * (top / cy), top);
      consider(bottom / cy, cx * (bottom / cy), bottom);
    }
    const len = Math.hypot(cx, cy) || 1;
    const x1 = (cx / len) * 18;
    const y1 = (cy / len) * 18;
    return '<line x1="' + num(x1) + '" y1="' + num(y1) + '" x2="' + num(endX) + '" y2="' + num(endY) +
      '" stroke="#b08980" stroke-width="1.3" fill="none"/>';
  }

  function drawNodes(nodes: SketchNode[]): string {
    let body = "";
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (!node) continue;
      const measure = measureLabel(node.name, node.subtitle);
      const rectX = node.labelCx - measure.w / 2;
      const rectY = node.labelCy - measure.h / 2;
      let labels = node.leader ? leaderLine(node.labelCx, node.labelCy, measure.w, measure.h) : "";
      labels += '<rect x="' + num(rectX) + '" y="' + num(rectY) + '" width="' + num(measure.w) + '" height="' +
        num(measure.h) + '" rx="9" fill="#fffaf6" fill-opacity="0.94"/>';
      for (let lineIndex = 0; lineIndex < measure.lines.length; lineIndex += 1) {
        const line = measure.lines[lineIndex];
        if (!line) continue;
        labels += '<text x="' + num(node.labelCx) + '" y="' + num(rectY + 16 + lineIndex * 16) +
          '" text-anchor="middle" font-family="jf open huninn, sans-serif" font-size="13" fill="#5c3b36">' +
          esc(line) + "</text>";
      }
      labels += '<text x="' + num(node.labelCx) + '" y="' + num(rectY + measure.lines.length * 16 + 13) +
        '" text-anchor="middle" font-family="jf open huninn, sans-serif" font-size="10" fill="#9a6e63">' +
        esc(ellipsis(node.subtitle, LABEL_MAX_W, 10)) + "</text>";
      body += '<g class="sketch-node" data-sketch-id="' + esc(node.id) + '" transform="translate(' +
        num(node.x) + " " + num(node.y) + ')">' +
        '<circle class="sketch-halo" cx="0" cy="0" r="22" fill="none" stroke="#d4537e" stroke-width="3" opacity="0"/>' +
        '<circle cx="0" cy="0" r="16" fill="#fffaf6" stroke="#f0d0c4" stroke-width="1.4"/>' +
        '<use href="#sk-' + node.icon + '" xlink:href="#sk-' + node.icon + '" x="-13" y="-13" width="26" height="26"/>' +
        labels +
        "</g>";
    }
    return body;
  }

  function drawLegend(): string {
    const items: { icon: SketchIcon; label: string }[] = [
      { icon: "spot", label: "景點" },
      { icon: "shrine", label: "寺廟" },
      { icon: "night", label: "夜市" },
      { icon: "spring", label: "溫泉" },
      { icon: "museum", label: "博物館" },
      { icon: "park", label: "公園" },
      { icon: "station", label: "車站" },
      { icon: "food", label: "美食" },
      { icon: "stay", label: "住宿" },
      { icon: "ride", label: "交通" }
    ];
    let body = '<rect x="' + String(LEGEND.x) + '" y="' + String(LEGEND.y) + '" width="' + String(LEGEND.w) +
      '" height="' + String(LEGEND.h) + '" rx="18" fill="#fffaf6" stroke="#e7b7a8" stroke-width="2"/>' +
      '<text x="' + String(LEGEND.x + 16) + '" y="' + String(LEGEND.y + 26) +
      '" font-family="jf open huninn, sans-serif" font-size="14" fill="#8a5a62">圖例</text>';
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!item) continue;
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = LEGEND.x + 14 + col * 118;
      const y = LEGEND.y + 42 + row * 38;
      body += '<use href="#sk-' + item.icon + '" xlink:href="#sk-' + item.icon + '" x="' + String(x) + '" y="' +
        String(y) + '" width="24" height="24"/>' +
        '<text x="' + String(x + 30) + '" y="' + String(y + 17) +
        '" font-family="jf open huninn, sans-serif" font-size="13" fill="#5c3b36">' + esc(item.label) + "</text>";
    }
    return body;
  }

  function boxesOverlap(a: LabelBox, b: LabelBox, gap: number): boolean {
    const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return overlapX + gap > 0 && overlapY + gap > 0;
  }

  function labelBoxAt(node: SketchNode, cx: number, cy: number, w: number, h: number): LabelBox {
    return { x: node.x + cx - w / 2, y: node.y + cy - h / 2, w: w, h: h };
  }

  function boxClear(box: LabelBox, obstacles: LabelBox[], placed: LabelBox[]): boolean {
    if (box.x < 16 || box.y < 84 || box.x + box.w > VIEW_W - 16 || box.y + box.h > VIEW_H - 16) return false;
    for (let index = 0; index < obstacles.length; index += 1) {
      const obstacle = obstacles[index];
      if (obstacle && boxesOverlap(box, obstacle, 3)) return false;
    }
    for (let index = 0; index < placed.length; index += 1) {
      const other = placed[index];
      if (other && boxesOverlap(box, other, 4)) return false;
    }
    return true;
  }

  function headingObstacles(model: SketchModel): LabelBox[] {
    const byId = nodeById(model.nodes);
    const boxes: LabelBox[] = [];
    for (let index = 0; index < model.days.length; index += 1) {
      const day = model.days[index];
      if (!day || day.ids.length === 0) continue;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let idIndex = 0; idIndex < day.ids.length; idIndex += 1) {
        const id = day.ids[idIndex];
        const node = id ? byId[id] : undefined;
        if (!node) continue;
        if (node.x < minX) minX = node.x;
        if (node.y < minY) minY = node.y;
        if (node.x > maxX) maxX = node.x;
        if (node.y > maxY) maxY = node.y;
      }
      if (!Number.isFinite(minX)) continue;
      const heading = "Day " + String(day.dayIndex) + " " + PlannerFormat.formatShortDate(day.date);
      let x = minX - 36;
      let y = minY - 52;
      let w = Math.max(128, maxX - minX + 72);
      const titleW = textWidth(heading, 15) + 28;
      if (w < titleW) {
        x -= (titleW - w) / 2;
        w = titleW;
      }
      if (y < 78) y = 78;
      const titleX = x + w / 2;
      const titleY = y + 26;
      const pill = textWidth(heading, 15) + 20;
      boxes.push({ x: titleX - pill / 2, y: titleY - 16, w: pill, h: 24 });
    }
    boxes.push({ x: LEGEND.x - 10, y: LEGEND.y - 10, w: LEGEND.w + 20, h: LEGEND.h + 16 });
    return boxes;
  }

  function placeLabels(model: SketchModel): void {
    const order: SketchNode[] = [];
    for (let index = 0; index < model.nodes.length; index += 1) {
      const node = model.nodes[index];
      if (node) order.push(node);
    }
    order.sort(function (left, right) {
      if (left.y !== right.y) return left.y - right.y;
      return left.x - right.x;
    });
    const obstacles = headingObstacles(model);
    for (let index = 0; index < model.nodes.length; index += 1) {
      const node = model.nodes[index];
      if (!node) continue;
      obstacles.push({ x: node.x - 18, y: node.y - 18, w: 36, h: 36 });
    }
    const placed: LabelBox[] = [];
    for (let index = 0; index < order.length; index += 1) {
      const node = order[index];
      if (!node) continue;
      const measure = measureLabel(node.name, node.subtitle);
      const candidates: { cx: number; cy: number; leader: boolean }[] = [
        { cx: 0, cy: 22 + measure.h / 2, leader: false },
        { cx: 0, cy: -(18 + measure.h / 2), leader: false },
        { cx: 22 + measure.w / 2, cy: 0, leader: false },
        { cx: -(22 + measure.w / 2), cy: 0, leader: false },
        { cx: measure.w / 2, cy: 18 + measure.h / 2, leader: false },
        { cx: -measure.w / 2, cy: 18 + measure.h / 2, leader: false },
        { cx: measure.w / 2, cy: -(14 + measure.h / 2), leader: false },
        { cx: -measure.w / 2, cy: -(14 + measure.h / 2), leader: false }
      ];
      let chosen: { cx: number; cy: number; leader: boolean } | null = null;
      for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
        const candidate = candidates[candidateIndex];
        if (!candidate) continue;
        if (boxClear(labelBoxAt(node, candidate.cx, candidate.cy, measure.w, measure.h), obstacles, placed)) {
          chosen = candidate;
          break;
        }
      }
      if (!chosen) {
        for (let ring = 1; ring <= 10 && !chosen; ring += 1) {
          const reach = 26 + ring * 16;
          for (let step = 0; step < 16; step += 1) {
            const angle = Math.PI / 2 + (step / 16) * Math.PI * 2;
            const cx = Math.cos(angle) * (reach + measure.w / 2);
            const cy = Math.sin(angle) * (reach + measure.h / 2);
            if (boxClear(labelBoxAt(node, cx, cy, measure.w, measure.h), obstacles, placed)) {
              chosen = { cx: cx, cy: cy, leader: true };
              break;
            }
          }
        }
      }
      if (!chosen) chosen = { cx: 0, cy: 22 + measure.h / 2, leader: false };
      node.labelCx = chosen.cx;
      node.labelCy = chosen.cy;
      node.leader = chosen.leader;
      placed.push(labelBoxAt(node, chosen.cx, chosen.cy, measure.w, measure.h));
    }
  }

  /** 圖示圓與標籤的局部範圍。原點是圖示中心，不隨縮放改變，字才不會變小。 */
  function inkExtents(node: SketchNode): { left: number; right: number; top: number; bottom: number } {
    const measure = measureLabel(node.name, node.subtitle);
    const labelLeft = node.labelCx - measure.w / 2;
    const labelRight = node.labelCx + measure.w / 2;
    const labelTop = node.labelCy - measure.h / 2;
    const labelBottom = node.labelCy + measure.h / 2;
    const icon = 18;
    return {
      left: Math.min(-icon, labelLeft),
      right: Math.max(icon, labelRight),
      top: Math.min(-icon, labelTop),
      bottom: Math.max(icon, labelBottom)
    };
  }

  /**
   * 單日圖縮放：圖示與標籤一起落在四周 40px 內。
   * 上方多留到標題下方，避免標籤蓋住「Day …」標題。
   */
  function fitDayInk(nodes: SketchNode[]): void {
    const live: SketchNode[] = [];
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (node) live.push(node);
    }
    if (live.length === 0) return;
    const minX = 40;
    const maxX = VIEW_W - 40;
    const minY = CONTENT.y;
    const maxY = VIEW_H - 40;

    function span(scale: number): { tx0: number; tx1: number; ty0: number; ty1: number } | null {
      let tx0 = -Infinity;
      let tx1 = Infinity;
      let ty0 = -Infinity;
      let ty1 = Infinity;
      for (let index = 0; index < live.length; index += 1) {
        const node = live[index];
        if (!node) continue;
        const box = inkExtents(node);
        const lowX = minX - box.left - scale * node.x;
        const highX = maxX - box.right - scale * node.x;
        const lowY = minY - box.top - scale * node.y;
        const highY = maxY - box.bottom - scale * node.y;
        if (lowX > tx0) tx0 = lowX;
        if (highX < tx1) tx1 = highX;
        if (lowY > ty0) ty0 = lowY;
        if (highY < ty1) ty1 = highY;
      }
      if (tx0 > tx1 || ty0 > ty1) return null;
      return { tx0: tx0, tx1: tx1, ty0: ty0, ty1: ty1 };
    }

    let low = 0.05;
    let high = 1;
    let best = span(low);
    let bestScale = low;
    if (!best) return;
    for (let step = 0; step < 24; step += 1) {
      const mid = (low + high) / 2;
      const fitted = span(mid);
      if (fitted) {
        best = fitted;
        bestScale = mid;
        low = mid;
      } else {
        high = mid;
      }
    }
    const tx = (best.tx0 + best.tx1) / 2;
    const ty = (best.ty0 + best.ty1) / 2;
    for (let index = 0; index < live.length; index += 1) {
      const node = live[index];
      if (!node) continue;
      node.x = tx + bestScale * node.x;
      node.y = ty + bestScale * node.y;
    }
    const gap = 8;
    for (let iter = 0; iter < 8; iter += 1) {
      let moved = false;
      for (let index = 0; index < live.length; index += 1) {
        const node = live[index];
        if (!node) continue;
        const box = inkExtents(node);
        const left = node.x + box.left;
        const right = node.x + box.right;
        const top = node.y + box.top;
        const bottom = node.y + box.bottom;
        const hit = left < LEGEND.x + LEGEND.w + gap && right > LEGEND.x - gap &&
          top < LEGEND.y + LEGEND.h + gap && bottom > LEGEND.y - gap;
        if (!hit) continue;
        node.x -= right - (LEGEND.x - gap);
        moved = true;
      }
      if (!moved) break;
    }
  }

  function dayStayCity(plan: TripPlan, date: string): { tonight: string; leaving: string } {
    const places = PlannerFormat.dayPlaces(plan, date);
    const tonight = collectCities(places.tonight);
    const leaving = collectCities(places.leaving);
    return {
      tonight: tonight.length > 0 && tonight[0] ? tonight[0] : "",
      leaving: leaving.length > 0 && leaving[0] ? leaving[0] : ""
    };
  }

  function keepIds(ids: string[], changeLeg: number, leaving: string, tonight: string, target: string): string[] {
    const split = changeLeg >= 0 && leaving !== "" && tonight !== "" && leaving !== tonight;
    if (!split) {
      const city = tonight || leaving;
      return city === target ? ids.slice() : [];
    }
    if (leaving === target) return ids.slice(0, changeLeg + 1);
    if (tonight === target) return ids.slice(changeLeg + 1);
    return [];
  }

  function citySegments(plan: TripPlan): CitySegment[] {
    const segments: CitySegment[] = [];
    for (let index = 0; index < plan.days.length; index += 1) {
      const day = plan.days[index];
      if (!day) continue;
      const stay = dayStayCity(plan, day.date);
      const city = stay.tonight || stay.leaving;
      if (city === "") continue;
      const last = segments.length > 0 ? segments[segments.length - 1] : undefined;
      if (last && last.city === city) {
        last.endDate = day.date;
        last.dayIndexes.push(index);
      } else {
        segments.push({ city: city, startDate: day.date, endDate: day.date, dayIndexes: [index] });
      }
    }
    return segments;
  }

  function cities(plan: TripPlan): string[] {
    const found: string[] = [];
    const segments = citySegments(plan);
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      if (segment && found.indexOf(segment.city) < 0) found.push(segment.city);
    }
    return found;
  }

  function stayRange(start: string, end: string): string {
    const from = PlannerFormat.formatShortDate(start);
    const to = PlannerFormat.formatShortDate(end);
    if (from === to) return from;
    return from + "–" + to;
  }

  function segmentPoint(plan: TripPlan, segment: CitySegment): { lat: number; lng: number } | null {
    const known = PlannerFormat.cityPoint(segment.city);
    if (known) return known;
    let lat = 0;
    let lng = 0;
    let count = 0;
    function add(point: { lat: number; lng: number } | null): void {
      if (!point) return;
      lat += point.lat;
      lng += point.lng;
      count += 1;
    }
    for (let index = 0; index < segment.dayIndexes.length; index += 1) {
      const dayIndex = segment.dayIndexes[index];
      const day = dayIndex === undefined ? undefined : plan.days[dayIndex];
      if (!day) continue;
      const lodging = PlannerFormat.dayLodging(plan, day.date);
      if (lodging.end) add(PlannerFormat.stayAnchor(lodging.end));
      if (lodging.start) add(PlannerFormat.stayAnchor(lodging.start));
      for (let itemIndex = 0; itemIndex < day.items.length; itemIndex += 1) {
        const item = day.items[itemIndex];
        if (item && PlannerFormat.isMappableLocation(item.location)) add(item.location);
      }
    }
    if (count === 0) return null;
    return { lat: lat / count, lng: lng / count };
  }

  function segmentIcon(plan: TripPlan, segment: CitySegment): SketchIcon {
    const counts: { [icon: string]: number } = {
      spot: 0, shrine: 0, night: 0, spring: 0, museum: 0, park: 0,
      station: 0, food: 0, shop: 0, stay: 0
    };
    const order: SketchIcon[] = [
      "spot", "shrine", "night", "spring", "museum", "park", "station", "food", "shop", "stay"
    ];
    for (let index = 0; index < segment.dayIndexes.length; index += 1) {
      const dayIndex = segment.dayIndexes[index];
      const day = dayIndex === undefined ? undefined : plan.days[dayIndex];
      if (!day) continue;
      for (let itemIndex = 0; itemIndex < day.items.length; itemIndex += 1) {
        const item = day.items[itemIndex];
        if (!item || !PlannerFormat.isMappableLocation(item.location)) continue;
        const icon = iconFor(item);
        counts[icon] = (counts[icon] || 0) + 1;
      }
      const lodging = PlannerFormat.dayLodging(plan, day.date);
      if (lodging.end && PlannerFormat.stayAnchor(lodging.end)) counts.stay = (counts.stay || 0) + 1;
    }
    let best: SketchIcon = "stay";
    let bestCount = 0;
    for (let index = 0; index < order.length; index += 1) {
      const icon = order[index];
      if (!icon) continue;
      const count = counts[icon] || 0;
      if (count > bestCount) {
        bestCount = count;
        best = icon;
      }
    }
    return best;
  }

  function pushUniqueLabel(labels: string[], label: string): void {
    if (labels.indexOf(label) < 0) labels.push(label);
  }

  function segmentArrowLabel(plan: TripPlan, from: CitySegment, to: CitySegment): string {
    const transports = plan.transports || [];
    const boundary: IntercityTransport[] = [];
    for (let index = 0; index < transports.length; index += 1) {
      const ride = transports[index];
      if (!ride) continue;
      const date = PlannerFormat.datePart(ride.departAt);
      if (date === from.endDate || date === to.startDate) boundary.push(ride);
    }
    const named: string[] = [];
    const loose: string[] = [];
    for (let index = 0; index < boundary.length; index += 1) {
      const ride = boundary[index];
      if (!ride) continue;
      const fromCities = PlannerFormat.citiesInText(ride.from);
      const toCities = PlannerFormat.citiesInText(ride.to);
      const label = rideLabel(ride);
      if (fromCities.indexOf(from.city) >= 0 && toCities.indexOf(to.city) >= 0) pushUniqueLabel(named, label);
      else if (fromCities.indexOf(from.city) >= 0 || toCities.indexOf(to.city) >= 0) pushUniqueLabel(loose, label);
    }
    if (named.length > 0) return named.join("、");
    if (loose.length === 1 && loose[0]) return loose[0];
    if (loose.length > 1) return loose.join("、");
    const fromPoint = segmentPoint(plan, from);
    const toPoint = segmentPoint(plan, to);
    if (fromPoint && toPoint) return estimatedHopLabel(fromPoint, toPoint);
    return "巴士／JR（估）";
  }

  function estimatedHopLabel(from: { lat: number; lng: number }, to: { lat: number; lng: number }): string {
    const km = PlannerFormat.straightKm(from, to);
    if (km < 20) return "巴士（估）";
    if (km >= 280) return "JR（估）";
    return "巴士／JR（估）";
  }

  function sameDayHopLabel(from: { lat: number; lng: number }, to: { lat: number; lng: number }): string {
    const km = PlannerFormat.straightKm(from, to);
    if (!(km > 20)) return "";
    if (km < 100) return "巴士（估）";
    return estimatedHopLabel(from, to);
  }

  function sameAirportCity(left: string, right: string): boolean {
    if (left === right) return true;
    return (left === "中部機場" || left === "名古屋") && (right === "中部機場" || right === "名古屋");
  }

  function placeFromText(text: string): { name: string; lat: number; lng: number } | null {
    const raw = text.trim();
    if (raw === "") return null;
    const lower = raw.toLowerCase();
    if (lower.indexOf("高雄") >= 0 || lower.indexOf("kaohsiung") >= 0) {
      return { name: "高雄", lat: 22.6273, lng: 120.3014 };
    }
    const labels = PlannerFormat.citiesInText(raw);
    let best = "";
    for (let index = 0; index < labels.length; index += 1) {
      const label = labels[index];
      if (label && label.length > best.length) best = label;
    }
    if (best !== "") {
      const point = PlannerFormat.cityPoint(best);
      if (point) return { name: best, lat: point.lat, lng: point.lng };
    }
    const resolved = resolveName(raw);
    if (!resolved) return null;
    return { name: raw, lat: resolved.lat, lng: resolved.lng };
  }

  function stopIndexForPlace(stops: CityStop[], name: string): number {
    for (let index = 0; index < stops.length; index += 1) {
      const stop = stops[index];
      if (stop && sameAirportCity(stop.city, name)) return index;
    }
    return -1;
  }

  function nearestStopKm(stops: CityStop[], place: { lat: number; lng: number }): number {
    let best = Infinity;
    for (let index = 0; index < stops.length; index += 1) {
      const stop = stops[index];
      if (!stop) continue;
      const km = PlannerFormat.straightKm(place, { lat: stop.lat, lng: stop.lng });
      if (km < best) best = km;
    }
    return best;
  }

  function markerEndpoint(
    stops: CityStop[],
    markers: OverviewMarker[],
    place: { name: string; lat: number; lng: number },
    subtitle: string
  ): { kind: "stop" | "marker"; index: number; display: string } {
    const stopIndex = stopIndexForPlace(stops, place.name);
    if (stopIndex >= 0) {
      const stop = stops[stopIndex];
      return { kind: "stop", index: stopIndex, display: stop ? stop.city : place.name };
    }
    for (let index = 0; index < markers.length; index += 1) {
      const marker = markers[index];
      if (!marker || marker.city !== place.name) continue;
      if (subtitle !== "" && marker.subtitle.indexOf(subtitle) < 0) {
        marker.subtitle = marker.subtitle === "" ? subtitle : marker.subtitle + "・" + subtitle;
      }
      return { kind: "marker", index: index, display: marker.city };
    }
    const remote = nearestStopKm(stops, place) > 450;
    markers.push({
      city: place.name,
      lat: place.lat,
      lng: place.lng,
      x: 0,
      y: 0,
      r: MARKER_R,
      remote: remote,
      subtitle: subtitle
    });
    return { kind: "marker", index: markers.length - 1, display: place.name };
  }

  function addOverviewFlights(plan: TripPlan, stops: CityStop[], markers: OverviewMarker[], links: OverviewLink[]): void {
    if (stops.length === 0) return;
    const flights: IntercityTransport[] = [];
    const transports = plan.transports || [];
    for (let index = 0; index < transports.length; index += 1) {
      const ride = transports[index];
      if (ride && ride.mode === "flight") flights.push(ride);
    }
    flights.sort(function (left, right) {
      if (left.departAt < right.departAt) return -1;
      if (left.departAt > right.departAt) return 1;
      return 0;
    });
    const seen: string[] = [];
    for (let index = 0; index < flights.length; index += 1) {
      const ride = flights[index];
      if (!ride) continue;
      const fromPlace = placeFromText(ride.from);
      const toPlace = placeFromText(ride.to);
      if (!fromPlace || !toPlace) continue;
      const date = PlannerFormat.datePart(ride.departAt);
      const subtitle = date === "" ? "" : PlannerFormat.formatShortDate(date);
      const fromEnd = markerEndpoint(stops, markers, fromPlace, subtitle);
      const toEnd = markerEndpoint(stops, markers, toPlace, subtitle);
      if (fromEnd.kind === "stop" && toEnd.kind === "stop" && toEnd.index === fromEnd.index + 1) continue;
      const key = fromEnd.display + ">" + toEnd.display;
      if (seen.indexOf(key) >= 0) continue;
      seen.push(key);
      const lastFlight = index === flights.length - 1;
      if (lastFlight && fromEnd.kind === "marker") {
        const origin = markers[fromEnd.index];
        const lastStop = stops[stops.length - 1];
        if (origin && !origin.remote && lastStop && lastStop.city !== origin.city) {
          links.push({
            fromKind: "stop",
            fromIndex: stops.length - 1,
            toKind: "marker",
            toIndex: fromEnd.index,
            label: estimatedHopLabel(lastStop, origin),
            flight: false
          });
        }
      }
      links.push({
        fromKind: fromEnd.kind,
        fromIndex: fromEnd.index,
        toKind: toEnd.kind,
        toIndex: toEnd.index,
        label: fromEnd.display + " ✈ " + toEnd.display,
        flight: true
      });
    }
  }

  function buildOverview(plan: TripPlan): OverviewModel {
    const segments = citySegments(plan);
    const stops: CityStop[] = [];
    const kept: CitySegment[] = [];
    let missing = 0;
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      if (!segment) continue;
      const pos = segmentPoint(plan, segment);
      if (!pos) {
        missing += 1;
        continue;
      }
      kept.push(segment);
      stops.push({
        city: segment.city,
        startDate: segment.startDate,
        endDate: segment.endDate,
        lat: pos.lat,
        lng: pos.lng,
        icon: segmentIcon(plan, segment),
        x: 0,
        y: 0
      });
    }
    const markers: OverviewMarker[] = [];
    const links: OverviewLink[] = [];
    for (let index = 0; index < kept.length - 1; index += 1) {
      const from = kept[index];
      const to = kept[index + 1];
      if (!from || !to) continue;
      const label = segmentArrowLabel(plan, from, to);
      links.push({
        fromKind: "stop",
        fromIndex: index,
        toKind: "stop",
        toIndex: index + 1,
        label: label,
        flight: label.indexOf("飛機") >= 0
      });
    }
    addOverviewFlights(plan, stops, markers, links);
    return { stops: stops, markers: markers, links: links, missing: missing };
  }

  interface FitPoint {
    kmx: number;
    kmy: number;
    r: number;
    set: (x: number, y: number) => void;
  }

  function circleHitsLegend(x: number, y: number, radius: number): boolean {
    const left = LEGEND.x - 10;
    const top = LEGEND.y - 10;
    const right = LEGEND.x + LEGEND.w + 8;
    const bottom = LEGEND.y + LEGEND.h + 8;
    const nearestX = clamp(x, left, right);
    const nearestY = clamp(y, top, bottom);
    const dx = x - nearestX;
    const dy = y - nearestY;
    return dx * dx + dy * dy < (radius + 8) * (radius + 8);
  }

  function insetRemote(trueKm: KmPoint, minX: number, maxX: number, minY: number, maxY: number, gap: number): KmPoint {
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    let dx = trueKm.x - cx;
    let dy = trueKm.y - cy;
    const len = Math.hypot(dx, dy);
    if (len < 1) {
      dx = -0.72;
      dy = -0.7;
    } else {
      dx /= len;
      dy /= len;
    }
    const hitX = Math.abs(dx) < 0.0001 ? Infinity : ((dx > 0 ? maxX : minX) - cx) / dx;
    const hitY = Math.abs(dy) < 0.0001 ? Infinity : ((dy > 0 ? maxY : minY) - cy) / dy;
    const edge = Math.max(0, Math.min(hitX, hitY));
    return { x: cx + dx * (edge + gap), y: cy + dy * (edge + gap) };
  }

  function anyHitsLegend(points: FitPoint[], scale: number, tx: number, ty: number): boolean {
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      if (!point) continue;
      const x = tx + scale * point.kmx;
      const y = ty - scale * point.kmy;
      if (circleHitsLegend(x, y, point.r)) return true;
    }
    return false;
  }

  function placeAtScale(points: FitPoint[], scale: number): { tx: number; ty: number } | null {
    const margin = 16;
    const top = 92;
    let tx0 = -1e9;
    let tx1 = 1e9;
    let ty0 = -1e9;
    let ty1 = 1e9;
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      if (!point) continue;
      const edge = point.r + 6;
      tx0 = Math.max(tx0, margin + edge - scale * point.kmx);
      tx1 = Math.min(tx1, VIEW_W - margin - edge - scale * point.kmx);
      ty0 = Math.max(ty0, top + edge + scale * point.kmy);
      ty1 = Math.min(ty1, VIEW_H - margin - edge + scale * point.kmy);
    }
    if (tx1 - tx0 < -0.5 || ty1 - ty0 < -0.5) return null;
    const steps = 12;
    const preferX = (tx0 + tx1) / 2;
    const preferY = (ty0 + ty1) / 2;
    let best: { tx: number; ty: number } | null = null;
    let bestDist = Infinity;
    for (let ix = 0; ix <= steps; ix += 1) {
      for (let iy = 0; iy <= steps; iy += 1) {
        const tx = tx0 + ((tx1 - tx0) * ix) / steps;
        const ty = ty0 + ((ty1 - ty0) * iy) / steps;
        if (anyHitsLegend(points, scale, tx, ty)) continue;
        const dist = (tx - preferX) * (tx - preferX) + (ty - preferY) * (ty - preferY);
        if (dist < bestDist) {
          bestDist = dist;
          best = { tx: tx, ty: ty };
        }
      }
    }
    return best;
  }

  function fitGeographic(points: FitPoint[]): void {
    if (points.length === 0) return;
    let low = 0.2;
    let high = 8;
    let bestScale = 0;
    let best: { tx: number; ty: number } | null = null;
    for (let step = 0; step < 22; step += 1) {
      const scale = (low + high) / 2;
      const placed = placeAtScale(points, scale);
      if (placed) {
        bestScale = scale;
        best = placed;
        low = scale;
      } else {
        high = scale;
      }
    }
    const scale = bestScale > 0 ? bestScale : 0.2;
    const placed = best || placeAtScale(points, scale) || { tx: VIEW_W / 2, ty: VIEW_H / 2 };
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      if (!point) continue;
      point.set(placed.tx + scale * point.kmx, placed.ty - scale * point.kmy);
    }
  }

  interface ScreenCircle {
    x: number;
    y: number;
    r: number;
  }

  function separateCircles(circles: ScreenCircle[]): void {
    const pad = 40;
    for (let iter = 0; iter < 120; iter += 1) {
      let moved = false;
      for (let i = 0; i < circles.length; i += 1) {
        const left = circles[i];
        if (!left) continue;
        for (let j = i + 1; j < circles.length; j += 1) {
          const right = circles[j];
          if (!right) continue;
          let dx = right.x - left.x;
          let dy = right.y - left.y;
          let dist = Math.hypot(dx, dy);
          const minDist = left.r + right.r + pad;
          if (dist >= minDist - 0.05) continue;
          if (dist < 0.01) {
            const angle = (i + 1) * 2.399 + (j + 1) * 0.73;
            dx = Math.cos(angle);
            dy = Math.sin(angle);
            dist = 1;
          }
          const push = (minDist - dist) / 2;
          const ux = dx / dist;
          const uy = dy / dist;
          left.x -= ux * push;
          left.y -= uy * push;
          right.x += ux * push;
          right.y += uy * push;
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  function separatedLayout(points: FitPoint[], scale: number): ScreenCircle[] | null {
    const circles: ScreenCircle[] = [];
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      if (!point) continue;
      circles.push({
        x: scale * point.kmx,
        y: -scale * point.kmy,
        r: point.r
      });
    }
    separateCircles(circles);
    const shifted: FitPoint[] = [];
    for (let index = 0; index < circles.length; index += 1) {
      const circle = circles[index];
      if (!circle) continue;
      shifted.push({
        kmx: circle.x,
        kmy: -circle.y,
        r: circle.r,
        set: function (): void { /* 只找平移 */ }
      });
    }
    const shift = placeAtScale(shifted, 1);
    if (!shift) return null;
    const placed: ScreenCircle[] = [];
    for (let index = 0; index < circles.length; index += 1) {
      const circle = circles[index];
      if (!circle) continue;
      placed.push({ x: shift.tx + circle.x, y: shift.ty + circle.y, r: circle.r });
    }
    return placed;
  }

  function fitSeparated(points: FitPoint[]): void {
    if (points.length === 0) return;
    let low = 0.15;
    let high = 8;
    let bestScale = 0;
    let best: ScreenCircle[] | null = null;
    for (let step = 0; step < 24; step += 1) {
      const scale = (low + high) / 2;
      const placed = separatedLayout(points, scale);
      if (placed) {
        bestScale = scale;
        best = placed;
        low = scale;
      } else {
        high = scale;
      }
    }
    const placed = best || separatedLayout(points, bestScale > 0 ? bestScale : 0.15);
    if (!placed) {
      fitGeographic(points);
      return;
    }
    let cursor = 0;
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      const spot = placed[cursor];
      if (!point || !spot) continue;
      point.set(spot.x, spot.y);
      cursor += 1;
    }
  }

  function layoutOverview(model: OverviewModel): void {
    const points: FitPoint[] = [];
    const locals: FitPoint[] = [];
    for (let index = 0; index < model.stops.length; index += 1) {
      const stop = model.stops[index];
      if (!stop) continue;
      const point: FitPoint = {
        kmx: 0,
        kmy: 0,
        r: OVERVIEW_R,
        set: function (x: number, y: number): void {
          stop.x = x;
          stop.y = y;
        }
      };
      points.push(point);
      locals.push(point);
      point.kmx = stop.lat;
      point.kmy = stop.lng;
    }
    const remoteMarkers: OverviewMarker[] = [];
    for (let index = 0; index < model.markers.length; index += 1) {
      const marker = model.markers[index];
      if (!marker) continue;
      const point: FitPoint = {
        kmx: marker.lat,
        kmy: marker.lng,
        r: marker.r,
        set: function (x: number, y: number): void {
          marker.x = x;
          marker.y = y;
        }
      };
      points.push(point);
      if (marker.remote) remoteMarkers.push(marker);
      else locals.push(point);
    }
    const basis = locals.length > 0 ? locals : points;
    if (basis.length === 0) return;
    let lat0 = 0;
    let lng0 = 0;
    for (let index = 0; index < basis.length; index += 1) {
      const point = basis[index];
      if (!point) continue;
      lat0 += point.kmx;
      lng0 += point.kmy;
    }
    lat0 /= basis.length;
    lng0 /= basis.length;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let index = 0; index < locals.length; index += 1) {
      const point = locals[index];
      if (!point) continue;
      const km = project(point.kmx, point.kmy, lat0, lng0);
      point.kmx = km.x;
      point.kmy = km.y;
      if (km.x < minX) minX = km.x;
      if (km.x > maxX) maxX = km.x;
      if (km.y < minY) minY = km.y;
      if (km.y > maxY) maxY = km.y;
    }
    if (locals.length === 0) {
      minX = 0;
      maxX = 0;
      minY = 0;
      maxY = 0;
    }
    const span = Math.max(maxX - minX, maxY - minY, 40);
    const gap = Math.max(96, span * 0.58);
    for (let index = 0; index < remoteMarkers.length; index += 1) {
      const marker = remoteMarkers[index];
      if (!marker) continue;
      const trueKm = project(marker.lat, marker.lng, lat0, lng0);
      let spot = insetRemote(trueKm, minX, maxX, minY, maxY, gap + index * 36);
      for (let other = 0; other < index; other += 1) {
        const previous = remoteMarkers[other];
        if (!previous) continue;
        if (Math.hypot(spot.x - previous.x, spot.y - previous.y) < 30) {
          spot = { x: spot.x - 28, y: spot.y + 24 };
        }
      }
      marker.x = spot.x;
      marker.y = spot.y;
    }
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      const marker = model.markers[index - model.stops.length];
      if (!point || !marker || !marker.remote) continue;
      point.kmx = marker.x;
      point.kmy = marker.y;
    }
    fitSeparated(points);
  }

  function linkPoint(model: OverviewModel, kind: "stop" | "marker", index: number): { x: number; y: number; r: number } | null {
    if (kind === "stop") {
      const stop = model.stops[index];
      if (!stop) return null;
      return { x: stop.x, y: stop.y, r: OVERVIEW_R };
    }
    const marker = model.markers[index];
    if (!marker) return null;
    return { x: marker.x, y: marker.y, r: marker.r };
  }

  function drawCityBubble(x: number, y: number, radius: number, icon: string, title: string, subtitle: string, attrs: string): string {
    const nameSize = textWidth(title, 16) > radius * 2 - 18 ? 13 : 16;
    const cityLabel = ellipsis(title, radius * 2 - 18, nameSize);
    const nameY = subtitle === "" ? 4 : 8;
    return "<g " + attrs + ' transform="translate(' + num(x) + " " + num(y) + ')">' +
      '<circle r="' + String(radius) + '" fill="#fffaf6" stroke="#e58aa0" stroke-width="3.5"/>' +
      '<use href="#sk-' + icon + '" xlink:href="#sk-' + icon + '" x="-12" y="-30" width="24" height="24"/>' +
      '<text x="0" y="' + String(nameY) + '" text-anchor="middle" font-family="jf open huninn, sans-serif" font-size="' +
      String(nameSize) + '" font-weight="700" fill="#7a4450">' + esc(cityLabel) + "</text>" +
      (subtitle === "" ? "" :
        '<text x="0" y="28" text-anchor="middle" font-family="jf open huninn, sans-serif" font-size="13" fill="#8a5a62">' +
        esc(subtitle) + "</text>") +
      "</g>";
  }

  function drawPill(x: number, y: number, label: string): string {
    const pill = textWidth(label, 13) + 18;
    return '<rect x="' + num(x - pill / 2) + '" y="' + num(y - 12) + '" width="' + num(pill) +
      '" height="22" rx="11" fill="#fffaf6" stroke="#e7b7a8" stroke-width="1.4"/>' +
      '<text x="' + num(x) + '" y="' + num(y + 4) +
      '" text-anchor="middle" font-family="jf open huninn, sans-serif" font-size="13" fill="#7a4450">' +
      esc(label) + "</text>";
  }

  function pillHitsLegend(x: number, y: number, half: number): boolean {
    const left = x - half;
    const right = x + half;
    return right > LEGEND.x - 6 && left < LEGEND.x + LEGEND.w + 6 && y + 12 > LEGEND.y - 6 && y - 12 < LEGEND.y + LEGEND.h + 6;
  }

  function quadLength(x1: number, y1: number, x2: number, y2: number, bend: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const cx = (x1 + x2) / 2 + (-dy / len) * bend;
    const cy = (y1 + y2) / 2 + (dx / len) * bend;
    let total = 0;
    let px = x1;
    let py = y1;
    for (let step = 1; step <= 10; step += 1) {
      const t = step / 10;
      const omt = 1 - t;
      const x = omt * omt * x1 + 2 * omt * t * cx + t * t * x2;
      const y = omt * omt * y1 + 2 * omt * t * cy + t * t * y2;
      total += Math.hypot(x - px, y - py);
      px = x;
      py = y;
    }
    return total;
  }

  function overviewArrow(
    from: { x: number; y: number; r: number },
    to: { x: number; y: number; r: number },
    avoid: { x: number; y: number; r: number }[]
  ): { start: { x: number; y: number }; end: { x: number; y: number }; bend: number; nx: number; ny: number } {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const start = { x: from.x + ux * from.r, y: from.y + uy * from.r };
    const end = { x: to.x - ux * to.r, y: to.y - uy * to.r };
    const px = -uy;
    const py = ux;
    const chord = Math.hypot(end.x - start.x, end.y - start.y);
    let magnitude = 0;
    if (chord < 42) {
      magnitude = 8;
      for (let step = 0; step < 16 && quadLength(start.x, start.y, end.x, end.y, magnitude) < 42; step += 1) {
        magnitude += 4;
      }
    }
    function bowClear(sign: number): number {
      const x = (start.x + end.x) / 2 + px * sign * magnitude * 0.5;
      const y = (start.y + end.y) / 2 + py * sign * magnitude * 0.5;
      let clear = 999;
      for (let index = 0; index < avoid.length; index += 1) {
        const city = avoid[index];
        if (!city) continue;
        const gapToCity = Math.hypot(x - city.x, y - city.y) - city.r;
        if (gapToCity < clear) clear = gapToCity;
      }
      return clear;
    }
    const sign = magnitude > 0 && bowClear(-1) > bowClear(1) ? -1 : 1;
    return { start: start, end: end, bend: magnitude * sign, nx: px * sign, ny: py * sign };
  }

  function pillCoversSegment(x: number, y: number, half: number, x1: number, y1: number, x2: number, y2: number): boolean {
    for (let step = 0; step <= 6; step += 1) {
      const t = step / 6;
      const sx = x1 + (x2 - x1) * t;
      const sy = y1 + (y2 - y1) * t;
      if (sx >= x - half - 3 && sx <= x + half + 3 && sy >= y - 16 && sy <= y + 16) return true;
    }
    return false;
  }

  function labelBesideArrow(
    midX: number,
    midY: number,
    nx: number,
    ny: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    label: string,
    avoid: { x: number; y: number; r: number }[],
    used: { x: number; y: number; half: number }[]
  ): { x: number; y: number } {
    const half = (textWidth(label, 13) + 18) / 2;
    const tx = -ny;
    const ty = nx;
    const distances = [26, 44, 64];
    const along = [0, 36, -36, 78, -78];
    let bestX = midX + nx * 26;
    let bestY = midY + ny * 26;
    let bestScore = -99999;
    let found = false;
    for (let distIndex = 0; distIndex < distances.length; distIndex += 1) {
      const dist = distances[distIndex] || 26;
      for (let side = 1; side >= -1; side -= 2) {
        for (let alongIndex = 0; alongIndex < along.length; alongIndex += 1) {
          const shift = along[alongIndex] || 0;
          const x = midX + nx * dist * side + tx * shift;
          const y = midY + ny * dist * side + ty * shift;
          if (x < half + 8 || x > VIEW_W - half - 8 || y < 78 || y > VIEW_H - 20) continue;
          if (pillHitsLegend(x, y, half)) continue;
          if (pillCoversSegment(x, y, half, x1, y1, x2, y2)) continue;
          let clear = 999;
          for (let index = 0; index < avoid.length; index += 1) {
            const city = avoid[index];
            if (!city) continue;
            const nearestX = clamp(city.x, x - half, x + half);
            const nearestY = clamp(city.y, y - 12, y + 12);
            const gap = Math.hypot(city.x - nearestX, city.y - nearestY) - city.r;
            if (gap < clear) clear = gap;
          }
          for (let index = 0; index < used.length; index += 1) {
            const pill = used[index];
            if (!pill) continue;
            const overlapX = half + pill.half + 8 - Math.abs(x - pill.x);
            const overlapY = 30 - Math.abs(y - pill.y);
            if (overlapX > 0 && overlapY > 0) clear = Math.min(clear, -Math.min(overlapX, overlapY));
          }
          if (clear < 2) continue;
          const score = clear - dist * 0.05 - Math.abs(shift) * 0.03;
          if (!found || score > bestScore) {
            found = true;
            bestScore = score;
            bestX = x;
            bestY = y;
          }
        }
      }
      if (found && bestScore > 6) break;
    }
    used.push({ x: bestX, y: bestY, half: half });
    return { x: bestX, y: bestY };
  }

  function drawCityStops(model: OverviewModel): string {
    const avoid: { x: number; y: number; r: number }[] = [];
    for (let index = 0; index < model.stops.length; index += 1) {
      const stop = model.stops[index];
      if (stop) avoid.push({ x: stop.x, y: stop.y, r: OVERVIEW_R });
    }
    for (let index = 0; index < model.markers.length; index += 1) {
      const marker = model.markers[index];
      if (marker) avoid.push({ x: marker.x, y: marker.y, r: marker.r });
    }
    const used: { x: number; y: number; half: number }[] = [];
    let under = "";
    let over = "";
    let pills = "";
    for (let index = 0; index < model.links.length; index += 1) {
      const link = model.links[index];
      if (!link) continue;
      const from = linkPoint(model, link.fromKind, link.fromIndex);
      const to = linkPoint(model, link.toKind, link.toIndex);
      if (!from || !to) continue;
      const arrowEnds = overviewArrow(from, to, avoid);
      const chord = Math.hypot(arrowEnds.end.x - arrowEnds.start.x, arrowEnds.end.y - arrowEnds.start.y);
      const arrow = drawArrow(
        arrowEnds.start,
        arrowEnds.end,
        arrowEnds.bend,
        link.flight ? "#2d6c90" : "#c45b78",
        link.flight ? 12 : 8,
        false,
        "",
        0,
        -2,
        4
      );
      const midX = (arrowEnds.start.x + arrowEnds.end.x) / 2 + arrowEnds.nx * Math.abs(arrowEnds.bend) * 0.5;
      const midY = (arrowEnds.start.y + arrowEnds.end.y) / 2 + arrowEnds.ny * Math.abs(arrowEnds.bend) * 0.5;
      const placed = labelBesideArrow(
        midX,
        midY,
        arrowEnds.nx,
        arrowEnds.ny,
        arrowEnds.start.x,
        arrowEnds.start.y,
        arrowEnds.end.x,
        arrowEnds.end.y,
        link.label,
        avoid,
        used
      );
      pills += drawPill(placed.x, placed.y, link.label);
      if (chord < 80) over += arrow;
      else under += arrow;
    }
    let marks = "";
    for (let index = 0; index < model.stops.length; index += 1) {
      const stop = model.stops[index];
      if (!stop) continue;
      const range = stayRange(stop.startDate, stop.endDate);
      marks += drawCityBubble(
        stop.x,
        stop.y,
        OVERVIEW_R,
        stop.icon,
        stop.city,
        range,
        'class="sketch-city" data-action="set-sketch-scope" data-sketch-kind="city" data-sketch-city="' +
          esc(stop.city) + '" role="button" aria-label="' + esc(stop.city + " " + range) + '"'
      );
    }
    for (let index = 0; index < model.markers.length; index += 1) {
      const marker = model.markers[index];
      if (!marker) continue;
      marks += drawCityBubble(
        marker.x,
        marker.y,
        marker.r,
        "plane",
        marker.city,
        marker.subtitle,
        'class="sketch-marker" pointer-events="none" aria-label="' + esc(marker.city + " " + marker.subtitle) + '"'
      );
    }
    return under + marks + over + pills;
  }

  function clearOfPoints(x: number, y: number, points: KmPoint[], radius: number): boolean {
    if (hitsLegend(x, y)) return false;
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      if (point && Math.hypot(point.x - x, point.y - y) < radius) return false;
    }
    return true;
  }

  function baseScenery(title: string, points: KmPoint[]): string {
    const seed = hashText(title);
    const seaOnLeft = seed % 2 === 0;
    const edge = seaOnLeft
      ? "M32 112 C115 190 78 276 132 360 C177 430 92 526 146 610 C175 658 124 730 32 792 Z"
      : "M1168 112 C1085 190 1122 276 1068 360 C1023 430 1108 526 1054 610 C1025 658 1076 730 1168 792 Z";
    const riverY = 250 + (seed % 190);
    let body = '<path d="' + edge + '" fill="#acddeb" fill-opacity=".88" stroke="#73b7ce" stroke-width="3"/>' +
      '<path d="M24 ' + String(riverY) + ' C260 ' + String(riverY - 95) + " 390 " + String(riverY + 105) +
      " 610 " + String(riverY + 14) + " S970 " + String(riverY - 80) + " 1176 " + String(riverY + 34) +
      '" fill="none" stroke="#8bcfe2" stroke-width="18" stroke-linecap="round" opacity=".8"/>' +
      '<path d="M24 ' + String(riverY) + ' C260 ' + String(riverY - 95) + " 390 " + String(riverY + 105) +
      " 610 " + String(riverY + 14) + " S970 " + String(riverY - 80) + " 1176 " + String(riverY + 34) +
      '" fill="none" stroke="#c9edf4" stroke-width="4" stroke-linecap="round" opacity=".75"/>';
    const candidates = [
      { x: 112, y: 166 }, { x: 1080, y: 174 }, { x: 174, y: 690 }, { x: 842, y: 174 },
      { x: 730, y: 710 }, { x: 362, y: 184 }, { x: 1050, y: 454 }, { x: 350, y: 720 }
    ];
    for (let index = 0; index < candidates.length; index += 1) {
      const spot = candidates[(index + seed) % candidates.length];
      if (!spot || !clearOfPoints(spot.x, spot.y, points, 104)) continue;
      if (index < 4) {
        body += '<use href="#sk-mountain" xlink:href="#sk-mountain" x="' + String(spot.x - 42) + '" y="' +
          String(spot.y - 30) + '" width="84" height="58" opacity=".9"/>';
      } else {
        for (let tree = 0; tree < 3; tree += 1) {
          const dx = (tree - 1) * 25;
          const dy = tree % 2 === 0 ? 0 : 12;
          body += '<use href="#sk-tree" xlink:href="#sk-tree" x="' + String(spot.x + dx - 14) + '" y="' +
            String(spot.y + dy - 21) + '" width="28" height="42" opacity=".88"/>';
        }
      }
    }
    return '<g class="sketch-scenery" pointer-events="none">' + body + "</g>";
  }

  function drawRoads(model: SketchModel, byId: { [id: string]: SketchNode }): string {
    let roads = "";
    for (let dayIndex = 0; dayIndex < model.days.length; dayIndex += 1) {
      const day = model.days[dayIndex];
      if (!day) continue;
      const legs = dayLegs(day, byId);
      for (let legIndex = 0; legIndex < legs.length; legIndex += 1) {
        const leg = legs[legIndex];
        if (!leg) continue;
        const from = byId[leg.fromId];
        const to = byId[leg.toId];
        if (!from || !to) continue;
        const baseBend = (unit(hashText(from.id + ">" + to.id)) - 0.5) * 36;
        const bend = routeBend(from, to, baseBend, model.nodes, !!model.overview);
        const curve = curveParts(from.x, from.y, to.x, to.y, bend);
        roads += '<path d="' + curve.d + '" fill="none" stroke="#fff2d5" stroke-width="18" stroke-linecap="round"/>' +
          '<path d="' + curve.d + '" fill="none" stroke="#e8c58c" stroke-width="11" stroke-linecap="round"/>';
      }
    }
    return '<g class="sketch-roads" pointer-events="none" opacity=".92">' + roads + "</g>";
  }

  function drawOverviewRoads(model: OverviewModel): string {
    let roads = "";
    for (let index = 0; index < model.links.length; index += 1) {
      const link = model.links[index];
      if (!link || link.flight) continue;
      const from = linkPoint(model, link.fromKind, link.fromIndex);
      const to = linkPoint(model, link.toKind, link.toIndex);
      if (!from || !to) continue;
      const curve = curveParts(from.x, from.y, to.x, to.y, index % 2 === 0 ? 20 : -20);
      roads += '<path d="' + curve.d + '" fill="none" stroke="#fff2d5" stroke-width="22" stroke-linecap="round"/>' +
        '<path d="' + curve.d + '" fill="none" stroke="#e8c58c" stroke-width="14" stroke-linecap="round"/>';
    }
    return '<g class="sketch-roads" pointer-events="none" opacity=".9">' + roads + "</g>";
  }

  function paper(title: string, middle: string, empty: string): string {
    const size = title.length > 28 ? 22 : title.length > 20 ? 26 : 32;
    const flowers = [
      sakura(78, 150, 0.72, -18, 0.95),
      sakura(168, 188, 0.42, 12, 0.8),
      sakura(1110, 146, 0.8, 16, 0.9),
      sakura(1036, 196, 0.46, -8, 0.75),
      sakura(70, 730, 0.62, 20, 0.85),
      sakura(150, 690, 0.38, -14, 0.7)
    ].join("");
    return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ' +
      String(VIEW_W) + " " + String(VIEW_H) + '" width="' + String(VIEW_W) + '" height="' + String(VIEW_H) +
      '" role="img" aria-label="' + esc(title) + '">' +
      "<defs>" + iconDefs() +
      '<filter id="sk-grain" x="-10%" y="-10%" width="120%" height="120%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4"/>' +
      '<feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.16 0"/>' +
      "</filter></defs>" +
      '<rect width="' + String(VIEW_W) + '" height="' + String(VIEW_H) + '" rx="28" fill="#fff6ef"/>' +
      '<rect width="' + String(VIEW_W) + '" height="' + String(VIEW_H) + '" rx="28" fill="#e7c4b4" filter="url(#sk-grain)" opacity="0.45"/>' +
      '<rect x="10" y="10" width="' + String(VIEW_W - 20) + '" height="' + String(VIEW_H - 20) +
      '" rx="24" fill="none" stroke="#f0d2c4" stroke-width="3"/>' +
      '<rect x="22" y="22" width="' + String(VIEW_W - 44) + '" height="' + String(VIEW_H - 44) +
      '" rx="19" fill="none" stroke="#e9b9b9" stroke-width="2" stroke-dasharray="3 9" opacity=".8"/>' +
      flowers +
      middle +
      empty +
      '<title id="sketch-map-tip">' + esc(title) + "</title>" +
      '<text id="sketch-map-title" x="600" y="58" text-anchor="middle" font-family="jf open huninn, sans-serif" font-size="' +
      String(size) + '" fill="#7a4450">' + esc(title) + "</text>" +
      "</svg>";
  }

  function draw(title: string, model: SketchModel): string {
    const byId = nodeById(model.nodes);
    const empty = model.nodes.length === 0
      ? '<text x="600" y="420" text-anchor="middle" font-family="jf open huninn, sans-serif" font-size="20" fill="#8a5a62">這段行程還沒有可畫的地點</text>'
      : "";
    const plates = dayPlates(model, byId);
    const points: KmPoint[] = [];
    for (let index = 0; index < model.nodes.length; index += 1) {
      const node = model.nodes[index];
      if (node) points.push({ x: node.x, y: node.y });
    }
    return paper(
      title,
      baseScenery(title, points) + drawRoads(model, byId) + drawLinks(model, byId) +
      drawNodes(model.nodes) + drawDayTitles(plates, model.nodes) + drawLegend(),
      empty
    );
  }

  function drawOverview(title: string, model: OverviewModel): string {
    const empty = model.stops.length === 0
      ? '<text x="600" y="420" text-anchor="middle" font-family="jf open huninn, sans-serif" font-size="20" fill="#8a5a62">這段行程還沒有可畫的城市</text>'
      : "";
    const points: KmPoint[] = [];
    for (let index = 0; index < model.stops.length; index += 1) {
      const stop = model.stops[index];
      if (stop) points.push({ x: stop.x, y: stop.y });
    }
    for (let index = 0; index < model.markers.length; index += 1) {
      const marker = model.markers[index];
      if (marker) points.push({ x: marker.x, y: marker.y });
    }
    return paper(title, baseScenery(title, points) + drawOverviewRoads(model) + drawCityStops(model) + drawLegend(), empty);
  }

  function render(options: SketchOptions): SketchResult {
    const title = options.title.trim() !== "" ? options.title.trim() : defaultTitle(options.plan);
    if (options.scope.kind === "overview") {
      const model = buildModel(options.plan, options.plan.days.slice(), "", false);
      model.overview = true;
      placeNodes(model.nodes, false, model.nodes.length > 14 ? 112 : 126);
      placeLabels(model);
      return { svg: draw(title, model), missing: model.missing };
    }
    const daySketch = options.scope.kind === "day";
    const cityFilter = options.scope.kind === "city" ? options.scope.city : "";
    const days = options.scope.kind === "day"
      ? (options.plan.days[options.scope.index] ? [options.plan.days[options.scope.index] as DayPlan] : [])
      : options.plan.days.slice();
    const model = buildModel(options.plan, days, cityFilter, daySketch);
    placeNodes(model.nodes, true);
    placeLabels(model);
    if (daySketch) fitDayInk(model.nodes);
    return { svg: draw(title, model), missing: model.missing };
  }

  const api: PlannerSketchApi = {
    defaultTitle: defaultTitle,
    cities: cities,
    render: render
  };

  (root as typeof globalThis & { PlannerSketch: PlannerSketchApi }).PlannerSketch = api;
})(globalThis);
