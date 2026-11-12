(function (root) {
  "use strict";

  const SRC = {
    kanazawa: { title: "金澤市觀光情報", url: "https://visitkanazawa.jp/" },
    association: { title: "金澤市觀光協會", url: "https://www.kanazawa-kankoukyoukai.or.jp/" },
    kenrokuen: { title: "兼六園", url: "https://www.pref.ishikawa.lg.jp/siro-niwa/kenrokuen/index.html" },
    museum21: { title: "金澤21世紀美術館", url: "https://www.kanazawa21.jp/" },
    omicho: { title: "近江町市場", url: "https://ohmicho-ichiba.com/" },
    toyama: { title: "富山縣觀光", url: "https://www.info-toyama.com/" },
    glass: { title: "富山市玻璃美術館", url: "https://www.toyama-glass-art-museum.jp/" },
    takayama: { title: "飛驒・高山觀光", url: "https://www.hida.jp/" },
    kaga: { title: "加賀市觀光", url: "https://www.city.kaga.ishikawa.jp/" },
    zhibenSpring: { title: "知本溫泉", url: "https://tour.taitung.gov.tw/zh-tw/attraction/details/284" },
    zhibenBureau: { title: "交通部觀光署：知本溫泉", url: "https://www.tad.gov.tw/m1.aspx?id=772&sNo=0001016" },
    zhibenForest: { title: "知本國家森林遊樂區", url: "https://www.forest.gov.tw/0000188" },
    zhibenForestTour: { title: "知本國家森林遊樂區", url: "https://tour.taitung.gov.tw/zh-tw/attraction/details/283" },
    baiyu: { title: "白玉瀑布", url: "https://tour.taitung.gov.tw/zh-tw/attraction/details/279" },
    forestFall: { title: "知本林道瀑布", url: "https://tour.taitung.gov.tw/zh-tw/attraction/details/472" },
    katatipul: { title: "卡地布文化園區", url: "https://tour.taitung.gov.tw/zh-tw/attraction/details/463" },
    bigBoss: { title: "大頭目野食館", url: "https://www.walkerland.com.tw/article/view/345199" },
    sauqa: { title: "原住民的ㄙㄠˊㄍㄚˋ", url: "https://happytravel.tw/chihpen-food/" },
    tenpalu: { title: "天巴洛音樂風味餐廳", url: "https://food.gotoformosa.com/5tdsO3" },
    shiangchi: { title: "知本景點美食", url: "https://beri.tw/chihpen/" }
  };

  const CATALOG = {
    "金澤": {
      "景點": [
        { name: "兼六園", hours: "3月至10月 7:00–17:00；11月至2月 8:00–16:30", reservation: "不需要", lat: 36.5621, lng: 136.6625, cost: { amount: 320, currency: "JPY" }, sources: [SRC.kenrokuen, SRC.kanazawa] },
        { name: "金澤21世紀美術館", hours: "10:00–18:00（週一休館，週一為國定假日則開館）", reservation: "需要", lat: 36.5609, lng: 136.6581, sources: [SRC.museum21] },
        { name: "東茶屋街", hours: "來源未記載", reservation: "不需要", lat: 36.5742, lng: 136.6673, sources: [SRC.association] },
        { name: "近江町市場", hours: "各店不同，市場大約上午至下午", reservation: "不需要", lat: 36.5712, lng: 136.6565, sources: [SRC.omicho, SRC.kanazawa] },
        { name: "長町武家屋敷跡", hours: "外觀可自由散步；個別設施時間不同", reservation: "不需要", lat: 36.5618, lng: 136.6502, sources: [SRC.kanazawa] },
        { name: "主計町茶屋街", hours: "來源未記載", reservation: "來源未記載", lat: null, lng: null, sources: [SRC.association] },
        { name: "金澤城公園", hours: "公園開放；城內施設另有開放時間", reservation: "不需要", lat: 36.564, lng: 136.6596, sources: [SRC.kanazawa] },
        { name: "鈴木大拙館", hours: "9:30–17:00（週一休館）", reservation: "不需要", lat: 36.5614, lng: 136.6678, sources: [SRC.kanazawa] }
      ],
      "美食": [
        { name: "近江町市場海鮮丼", hours: "各店不同，多集中在上午至下午", reservation: "不需要", lat: 36.5714, lng: 136.6568, sources: [SRC.omicho] },
        { name: "森八", hours: "來源未記載", reservation: "不需要", lat: 36.5718, lng: 136.6576, sources: [SRC.kanazawa] },
        { name: "金澤咖哩", hours: "各店約 11:00–22:00，午間常需排隊", reservation: "不需要", lat: 36.5635, lng: 136.6554, sources: [SRC.kanazawa] },
        { name: "福梅", hours: "9:00–18:00 左右，售完即結束", reservation: "不需要", lat: 36.561, lng: 136.6569, sources: [SRC.association] },
        { name: "大友", hours: "10:00–18:00 左右", reservation: "來源未記載", lat: 36.5628, lng: 136.6548, sources: [SRC.kanazawa] },
        { name: "安江八幡金箔冰淇淋", hours: "10:00–17:00 左右", reservation: "不需要", lat: 36.5726, lng: 136.6654, sources: [SRC.association] }
      ]
    },
    "富山": {
      "景點": [
        { name: "富山市玻璃美術館", hours: "9:30–18:00（週三休館）", reservation: "需要", lat: 36.6957, lng: 137.2107, sources: [SRC.glass, SRC.toyama] },
        { name: "富山城址公園", hours: "城址公園可自由進出；天守展覽另計", reservation: "不需要", lat: 36.6935, lng: 137.2112, sources: [SRC.toyama] },
        { name: "環水公園", hours: "公園全天可到；星巴克美術館分店另有營業時間", reservation: "不需要", lat: 36.7097, lng: 137.213, sources: [SRC.toyama] },
        { name: "雨晴海岸", hours: "來源未記載", reservation: "不需要", lat: 36.819, lng: 137.03, sources: [SRC.toyama] },
        { name: "高岡古城公園", hours: "公園自由參觀", reservation: "不需要", lat: 36.7528, lng: 137.0256, sources: [SRC.toyama] },
        { name: "八尾", hours: "町家街道自由散步；個別店家時間不同", reservation: "不需要", lat: 36.582, lng: 137.137, sources: [SRC.toyama] }
      ],
      "美食": [
        { name: "白蝦亭", hours: "11:00–14:00、17:00–20:00 左右", reservation: "需要", lat: 36.7062, lng: 137.2118, sources: [SRC.toyama] },
        { name: "鱒壽司", hours: "站前店約 8:00–19:00", reservation: "不需要", lat: 36.7016, lng: 137.2132, sources: [SRC.toyama] },
        { name: "富山ブラックラーメン", hours: "各店不同，多為 11:00–15:00、18:00–24:00", reservation: "不需要", lat: 36.6994, lng: 137.2115, sources: [SRC.toyama] },
        { name: "冰見漁港海鮮", hours: "市場上午較齊，下午部分店家結束", reservation: "來源未記載", lat: 36.857, lng: 136.986, sources: [SRC.toyama] }
      ]
    },
    "高山": {
      "景點": [
        { name: "上三之町", hours: "街道全天可走；店家多約 9:00–17:00", reservation: "不需要", lat: 36.1425, lng: 137.2585, sources: [SRC.takayama] },
        { name: "高山陣屋", hours: "9:00–17:00（年末年始休館）", reservation: "不需要", lat: 36.1402, lng: 137.2588, sources: [SRC.takayama] },
        { name: "宮川朝市", hours: "大約 7:00–12:00", reservation: "不需要", lat: 36.1434, lng: 137.2592, sources: [SRC.takayama] },
        { name: "飛驒民俗村", hours: "8:30–17:00", reservation: "不需要", lat: 36.1405, lng: 137.2365, sources: [SRC.takayama] },
        { name: "中橋", hours: "來源未記載", reservation: "不需要", lat: 36.144, lng: 137.2608, sources: [SRC.takayama] },
        { name: "日下部民藝館", hours: "9:00–16:30", reservation: "來源未記載", lat: 36.1416, lng: 137.2596, sources: [SRC.takayama] }
      ],
      "美食": [
        { name: "飛驒牛握壽司", hours: "各店約 11:00–15:00、17:00–21:00", reservation: "需要", lat: 36.1428, lng: 137.2579, cost: { amount: 4500, currency: "JPY" }, sources: [SRC.takayama] },
        { name: "朴葉味噌", hours: "老街餐廳午晚兩段，約 11:00–20:30", reservation: "不需要", lat: 36.1431, lng: 137.2588, sources: [SRC.takayama] },
        { name: "高山拉麵", hours: "11:00–19:00 左右，售完可能提早結束", reservation: "不需要", lat: 36.1412, lng: 137.2574, sources: [SRC.takayama] },
        { name: "赤牛重", hours: "來源未記載", reservation: "來源未記載", lat: 36.1422, lng: 137.2566, sources: [SRC.takayama] }
      ]
    },
    "加賀": {
      "景點": [
        { name: "山代溫泉", hours: "溫泉街自由散步；各湯約 11:00–21:00", reservation: "不需要", lat: 36.292, lng: 136.363, sources: [SRC.kaga] },
        { name: "山中溫泉", hours: "湯之曲輪街全天可走；鶴仙溪散步不需預約", reservation: "不需要", lat: 36.2475, lng: 136.367, sources: [SRC.kaga] },
        { name: "加賀傳統工藝村", hours: "9:00–17:00 左右", reservation: "來源未記載", lat: 36.246, lng: 136.37, sources: [SRC.kaga] }
      ],
      "美食": [
        { name: "治部煮", hours: "旅館與餐廳多於午晚兩段供應", reservation: "需要", lat: 36.2934, lng: 136.3618, sources: [SRC.kaga] },
        { name: "加賀棒茶甜點", hours: "來源未記載", reservation: "不需要", lat: 36.2488, lng: 136.3662, sources: [SRC.kaga] }
      ]
    },
    "台東知本": {
      "景點": [
        { name: "知本溫泉", hours: "來源未記載", reservation: "不需要", lat: 22.693043, lng: 121.01812, sources: [SRC.zhibenSpring, SRC.zhibenBureau] },
        { name: "知本國家森林遊樂區", hours: "7:30–17:00（7月至8月延長至18:00，除夕休園）；平日全票 80 元、假日全票 100 元", reservation: "不需要", lat: 22.687449, lng: 120.99127, cost: { amount: 100, currency: "TWD" }, sources: [SRC.zhibenForest, SRC.zhibenForestTour] },
        { name: "白玉瀑布", hours: "來源未記載", reservation: "不需要", lat: 22.68806, lng: 121.016889, sources: [SRC.baiyu] },
        { name: "知本林道瀑布", hours: "來源未記載", reservation: "不需要", lat: 22.7045, lng: 121.01467, sources: [SRC.forestFall] },
        { name: "卡地布文化園區", hours: "來源未記載", reservation: "來源未記載", lat: null, lng: null, sources: [SRC.katatipul] }
      ],
      "美食": [
        { name: "大頭目野食館", hours: "每天 16:00–23:00", reservation: "不需要", lat: 22.6921323, lng: 121.0159122, sources: [SRC.bigBoss] },
        { name: "原住民的ㄙㄠˊㄍㄚˋ", hours: "10:00–18:00", reservation: "不需要", lat: 22.7076228, lng: 121.0504521, cost: { amount: 100, currency: "TWD" }, sources: [SRC.sauqa] },
        { name: "天巴洛音樂風味餐廳", hours: "11:00–14:00、17:00–23:00", reservation: "不需要", lat: 22.7026085, lng: 121.0326724, sources: [SRC.tenpalu] },
        { name: "湘琪牛肉麵", hours: "10:00–15:00（週二休息）", reservation: "不需要", lat: 22.70569, lng: 121.04129, sources: [SRC.shiangchi] },
        { name: "知本八社番美食", hours: "11:00–14:00、17:00–21:00（週五公休）", reservation: "不需要", lat: 22.7060582, lng: 121.0564157, sources: [SRC.shiangchi] },
        { name: "知本車上蔥油餅", hours: "14:30–17:30", reservation: "不需要", lat: 22.7075077, lng: 121.0481639, sources: [SRC.shiangchi] }
      ]
    }
  };

  function catalogCity(destination) {
    const raw = String(destination || "").trim();
    if (CATALOG[raw]) return CATALOG[raw];
    const normalized = raw.replace(/\s+/g, "").replace(/臺/g, "台");
    if (CATALOG[normalized]) return CATALOG[normalized];
    if (normalized.indexOf("知本") !== -1) return CATALOG["台東知本"];
    return null;
  }

  function whyFit(destination, days, name, type) {
    if (type === "景點") {
      return destination + "這段安排 " + days + " 天，" + name + "可以放進其中一天，不必拆成跨日行程。它是規劃" + destination + "時會拿來比較的去處，看完營業時間與要不要預約就能決定留不留下。";
    }
    return destination + "只停留 " + days + " 天，用餐要少而明確，" + name + "適合排進其中一餐。若營業時間或預約方式足夠判斷，就直接勾選；還想核對時再打開資料來源。";
  }

  function listed(type, destination, days, destIndex, retrievedAt, flags) {
    if (days < 1) return { status: "unassigned", items: [] };
    const fail = flags.fail && flags.fail[destination];
    if (fail && fail.indexOf(type) !== -1) return { status: "failed", items: [] };
    const blank = flags.empty && flags.empty[destination];
    if (blank && blank.indexOf(type) !== -1) return { status: "empty", items: [] };
    const city = catalogCity(destination);
    const pool = city && city[type] ? city[type] : [];
    const limit = type === "景點"
      ? root.TripLogic.targetCounts(days).attractions
      : root.TripLogic.targetCounts(days).food;
    const items = pool.slice(0, limit).map(function (raw, itemIndex) {
      const hasCoord = Number.isFinite(raw.lat) && Number.isFinite(raw.lng);
      const item = {
        id: (type === "景點" ? "s" : "f") + "-" + destIndex + "-" + itemIndex,
        type: type,
        destination: destination,
        name: raw.name,
        whyFit: whyFit(destination, days, raw.name, type),
        hours: raw.hours,
        reservation: raw.reservation,
        sources: raw.sources.map(function (source) {
          return { title: source.title, url: source.url };
        }),
        retrievedAt: retrievedAt,
        lat: hasCoord ? raw.lat : null,
        lng: hasCoord ? raw.lng : null,
        geocodeStatus: hasCoord ? "已標點" : "未能標上地圖"
      };
      if (raw.cost && typeof raw.cost.amount === "number" && raw.cost.currency) {
        item.cost = { amount: raw.cost.amount, currency: raw.cost.currency };
      }
      return root.TripModel.enrichActivity(item);
    });
    if (!items.length) return { status: "empty", items: [] };
    return { status: "ok", items: items };
  }

  function buildGroups(destinations, retrievedAt, flags) {
    const options = flags || {};
    return destinations.map(function (destination, destIndex) {
      return {
        destination: destination.name,
        days: destination.days,
        attractions: listed("景點", destination.name, destination.days, destIndex, retrievedAt, options),
        food: listed("美食", destination.name, destination.days, destIndex, retrievedAt, options)
      };
    });
  }

  function buildSlot(destination, days, destIndex, type, retrievedAt) {
    return listed(type, destination, days, destIndex, retrievedAt, {});
  }

  function catalogPoint(destination, name) {
    const city = catalogCity(destination);
    if (!city) return null;
    const pools = (city["景點"] || []).concat(city["美食"] || []);
    const found = pools.find(function (item) { return item.name === name; });
    if (!found || !Number.isFinite(found.lat) || !Number.isFinite(found.lng)) return null;
    return { lat: found.lat, lng: found.lng };
  }

  root.TripPreview = {
    buildGroups: buildGroups,
    buildSlot: buildSlot,
    catalogPoint: catalogPoint
  };
})(globalThis);
