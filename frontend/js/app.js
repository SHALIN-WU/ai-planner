(function () {
  "use strict";

  var STORAGE_KEY = "travel-planner-v1";
  var app = document.getElementById("app");
  var state = null;
  var map = null;
  var runToken = 0;
  var composing = false;
  var pendingFocus = null;
  var lastView = null;

  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  function blankDestination() {
    return { id: uid(), name: "", days: "" };
  }

  function initialState() {
    return TripModel.ensureTrip({
      tripName: "",
      totalDays: "",
      destinations: [blankDestination()],
      mode: "edit",
      view: "input",
      groups: null,
      retrievedAt: null,
      selectedIds: [],
      usingPreview: false,
      activeTab: "景點",
      showErrors: false,
      errors: emptyErrors(1),
      retrying: null
    });
  }

  function emptyErrors(count) {
    var rows = [];
    for (var index = 0; index < count; index += 1) rows.push({ name: "", days: "" });
    return { totalDays: "", form: "", formCode: "", rows: rows };
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function delay(ms) {
    return new Promise(function (resolve) { window.setTimeout(resolve, ms); });
  }

  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!raw || typeof raw !== "object") return null;
      if (!Array.isArray(raw.destinations) || raw.destinations.length === 0) {
        raw.destinations = [blankDestination()];
      }
      raw.destinations = raw.destinations.map(function (destination) {
        return {
          id: destination.id || uid(),
          name: destination.name || "",
          days: destination.days == null ? "" : String(destination.days)
        };
      });
      raw.selectedIds = Array.isArray(raw.selectedIds) ? raw.selectedIds : [];
      raw.mode = raw.mode === "review-allocation" ? "review-allocation" : "edit";
      raw.view = raw.view || "input";
      raw.activeTab = raw.activeTab === "美食" ? "美食" : "景點";
      raw.showErrors = false;
      raw.errors = emptyErrors(raw.destinations.length);
      raw.retrying = null;
      if ((raw.view === "list" || raw.view === "confirm") && !Array.isArray(raw.groups)) raw.view = "input";
      if (Array.isArray(raw.groups)) {
        raw.groups.forEach(function (group) {
          ["attractions", "food"].forEach(function (key) {
            var slot = group[key];
            if (!slot || !Array.isArray(slot.items)) return;
            slot.items.forEach(function (item) {
              if ((typeof item.lat !== "number" || typeof item.lng !== "number") && TripPreview.catalogPoint) {
                var point = TripPreview.catalogPoint(item.destination || group.destination, item.name);
                if (point) {
                  item.lat = point.lat;
                  item.lng = point.lng;
                  item.geocodeStatus = "已標點";
                }
              }
              TripModel.enrichActivity(item);
            });
          });
        });
      }
      return TripModel.ensureTrip(raw);
    } catch (error) {
      return null;
    }
  }

  function save() {
    try {
      var copy = {
        id: state.id,
        tripName: state.tripName,
        totalDays: state.totalDays,
        travelers: state.travelers,
        baseCurrency: state.baseCurrency,
        destinations: state.destinations,
        days: state.days,
        transports: state.transports,
        accommodations: state.accommodations,
        mode: state.mode === "searching" ? "edit" : state.mode,
        view: state.view,
        groups: state.groups,
        retrievedAt: state.retrievedAt,
        selectedIds: state.selectedIds,
        usingPreview: state.usingPreview,
        activeTab: state.activeTab
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(copy));
    } catch (error) {
      /* 私人瀏覽可能無法寫入，這一趟只留在目前分頁。 */
    }
  }

  function snapshotTrip(name, total, places) {
    return TripModel.ensureTrip({
      tripName: name,
      totalDays: String(total),
      destinations: places.map(function (place) {
        return { id: uid(), name: place.name, days: String(place.days) };
      }),
      mode: "edit",
      view: "list",
      retrievedAt: TripLogic.todayString(),
      selectedIds: [],
      usingPreview: true,
      activeTab: "景點",
      showErrors: false,
      retrying: null,
      errors: emptyErrors(places.length)
    });
  }

  function exampleState() {
    var places = [
      { name: "金澤", days: 2 },
      { name: "富山", days: 2 },
      { name: "高山", days: 2 },
      { name: "加賀", days: 1 }
    ];
    var next = snapshotTrip("北陸與飛驒", 7, places);
    TripModel.applySample(next, 7);
    next.groups = TripPreview.buildGroups(places, next.retrievedAt);
    return next;
  }

  function exceptionState() {
    var places = [
      { name: "金澤", days: 2 },
      { name: "富山", days: 2 },
      { name: "高山", days: 2 },
      { name: "加賀", days: 0 }
    ];
    var next = snapshotTrip("例外狀態預覽", 6, places);
    TripModel.applySample(next, 6);
    next.groups = TripPreview.buildGroups(places, next.retrievedAt, {
      fail: { "高山": ["景點"] },
      empty: { "富山": ["景點"] }
    });
    var spots = next.groups[0].attractions.items;
    var located = spots.find(function (item) { return item.geocodeStatus === "已標點"; });
    var missing = spots.find(function (item) { return item.geocodeStatus === "未能標上地圖"; });
    var food = next.groups[1].food.items[0];
    next.selectedIds = [located, missing, food].filter(Boolean).map(function (item) { return item.id; });
    return next;
  }

  function selectedItems() {
    var chosen = new Set(state.selectedIds);
    var items = [];
    (state.groups || []).forEach(function (group) {
      group.attractions.items.concat(group.food.items).forEach(function (item) {
        if (chosen.has(item.id)) items.push(item);
      });
    });
    return items;
  }

  function selectedCount(type) {
    return selectedItems().filter(function (item) { return item.type === type; }).length;
  }

  function routeText() {
    return state.destinations
      .filter(function (destination) { return String(destination.name || "").trim(); })
      .map(function (destination) {
        var days = String(destination.days || "").trim();
        return esc(destination.name.trim()) + (days === "" ? "" : " " + esc(days) + "天");
      })
      .join("<span>→</span>");
  }

  function pageTitle() {
    var named = String(state.tripName || "").trim();
    if (state.view === "input") return "安排這一趟";
    if (state.view === "confirm") return named || "確認留下的項目";
    if (state.view === "transport") return "交通";
    if (state.view === "stay") return "住宿";
    if (state.view === "budget") return "預算";
    if (state.view === "map") return "地圖";
    return named || "景點與美食清單";
  }

  function reservationTag(value) {
    if (value === "需要") return '<span class="tag tag-need">需要</span>';
    if (value === "不需要") return '<span class="tag tag-none">不需要</span>';
    return '<span class="unknown">來源未記載</span>';
  }

  function hoursText(value) {
    if (value === "來源未記載") return '<span class="unknown">來源未記載</span>';
    return esc(value);
  }

  function sourceList(sources, className) {
    return '<ul class="' + className + '">' + sources.map(function (source) {
      var url = String(source.url || "");
      var safeUrl = /^https?:\/\//i.test(url) ? esc(url) : "";
      var title = esc(source.title || url);
      if (!safeUrl) return "<li>" + title + "</li>";
      return '<li><a href="' + safeUrl + '" target="_blank" rel="noopener noreferrer">' + title + "</a>" +
        '<span class="url">' + safeUrl + "</span></li>";
    }).join("") + "</ul>";
  }

  function describeDays(result) {
    if (state.mode === "searching") return { tone: "", text: "" };
    if (result.needsAllocationConfirm && state.mode !== "review-allocation") {
      return { tone: "", text: "各目的地天數都留空時，按下產生後會先分配天數，確認後才開始搜尋。" };
    }
    if (state.mode === "review-allocation" && result.needsAllocationConfirm) {
      return { tone: "", text: "天數已清空。再按一次會依順序重新分配。" };
    }
    if (state.showErrors && (result.errors.form || result.errors.totalDays)) return { tone: "", text: "" };
    if (result.errors.formCode === "sum") {
      return { tone: "error", text: result.errors.form };
    }
    if (result.errors.formCode === "partial") {
      return { tone: "", text: "每個目的地都要填天數；若想由系統分配，請把天數全部清空。" };
    }
    if (result.ok) {
      var bits = result.normalized.destinations.map(function (destination) {
        return destination.name + " " + destination.days + " 天";
      }).join("、");
      var prefix = state.mode === "review-allocation" ? "請確認分配：" : "將依這個分配搜尋：";
      return { tone: "ok", text: prefix + bits + "。加總 " + result.normalized.totalDays + " 天。" };
    }
    return { tone: "", text: "" };
  }

  function captureFocus() {
    var element = document.activeElement;
    if (!element || !element.dataset || !element.dataset.focus) return null;
    return {
      key: element.dataset.focus,
      start: element.selectionStart,
      end: element.selectionEnd
    };
  }

  function restoreFocus(saved) {
    if (!saved) return;
    var element = document.querySelector('[data-focus="' + CSS.escape(saved.key) + '"]');
    if (!element) return;
    element.focus();
    if (typeof saved.start === "number" && element.setSelectionRange) {
      try { element.setSelectionRange(saved.start, saved.end); } catch (error) { /* 非文字欄位 */ }
    }
  }

  function renderSourcesNote() {
    if (!state.usingPreview || !state.groups) return "";
    return '<p class="preview-note">這份清單是預覽資料，用來對照畫面與流程。接上後端後，會改由該次搜尋結果產生。</p>';
  }

  function renderActions() {
    var buttons = [];
    var picked = state.groups ? selectedItems().length : 0;
    if (state.view === "input" && state.groups && state.mode !== "searching") {
      buttons.push('<button type="button" class="btn secondary" data-action="goto" data-view="list">回到清單</button>');
    }
    if (state.view === "list") {
      buttons.push('<p class="picked-note">已選 ' + picked + " 項</p>");
      buttons.push('<button type="button" class="btn secondary" data-action="goto" data-view="input">修改條件</button>');
      buttons.push('<button type="button" class="btn" data-action="goto" data-view="confirm">前往確認頁</button>');
    }
    if (state.view === "confirm") {
      buttons.push('<button type="button" class="btn secondary" data-action="goto" data-view="list">返回清單</button>');
      buttons.push('<button type="button" class="btn secondary" data-action="goto" data-view="input">修改條件</button>');
    }
    if (state.view === "transport" || state.view === "stay" || state.view === "budget" || state.view === "map") {
      buttons.push('<button type="button" class="btn secondary" data-action="goto" data-view="input">修改條件</button>');
    }
    return buttons.length ? '<div class="top-actions">' + buttons.join("") + "</div>" : "";
  }

  function renderPlanNav() {
    if (state.mode === "searching") return "";
    var items = [
      ["list", "景點與美食", null],
      ["transport", "交通", (state.transports || []).length],
      ["stay", "住宿", (state.accommodations || []).length],
      ["budget", "預算", null],
      ["map", "地圖", null]
    ];
    return '<nav class="plan-nav" aria-label="行程分頁">' + items.map(function (item) {
      var selected = state.view === item[0];
      var count = item[2] == null ? "" : '<span class="count">' + item[2] + "</span>";
      return '<button type="button" class="plan-link" data-action="goto" data-view="' + item[0] + '"' +
        (selected ? ' aria-current="page"' : "") + ">" + item[1] + count + "</button>";
    }).join("") + "</nav>";
  }

  function renderHeader() {
    var route = routeText();
    return '<header class="topbar"><div><p class="eyebrow">旅遊行程管理系統</p>' +
      '<h1 data-page-title tabindex="-1">' + esc(pageTitle()) + "</h1>" +
      (route ? '<p class="route">' + route + "</p>" : "") +
      "</div>" + renderActions() + renderPlanNav() + "</header>";
  }

  function fieldError(text, id) {
    if (!state.showErrors || !text) return "";
    return '<small class="field-error" id="' + id + '">' + esc(text) + "</small>";
  }

  function renderDestinationRow(destination, index) {
    var rowError = (state.errors.rows && state.errors.rows[index]) || { name: "", days: "" };
    var nameInvalid = state.showErrors && rowError.name ? "true" : "false";
    var daysInvalid = state.showErrors && rowError.days ? "true" : "false";
    var nameDescribed = state.showErrors && rowError.name ? ' aria-describedby="name-error-' + destination.id + '"' : "";
    var daysDescribed = state.showErrors && rowError.days ? ' aria-describedby="days-error-' + destination.id + '"' : "";
    var errors = "";
    if (state.showErrors && (rowError.name || rowError.days)) {
      errors = '<div class="dest-error">' + fieldError(rowError.name, "name-error-" + destination.id) +
        fieldError(rowError.days, "days-error-" + destination.id) + "</div>";
    }
    return '<li class="dest-row">' +
      '<span class="order-no">' + (index + 1) + "</span>" +
      '<button type="button" class="icon-btn up" data-action="up" data-id="' + destination.id + '" data-focus="up-' + destination.id + '"' +
      (index === 0 ? " disabled" : "") + ' aria-label="上移第 ' + (index + 1) + ' 個目的地">上</button>' +
      '<button type="button" class="icon-btn down" data-action="down" data-id="' + destination.id + '" data-focus="down-' + destination.id + '"' +
      (index === state.destinations.length - 1 ? " disabled" : "") + ' aria-label="下移第 ' + (index + 1) + ' 個目的地">下</button>' +
      '<input class="name-input" type="text" data-field="destName" data-id="' + destination.id + '" data-focus="name-' + destination.id + '" value="' + esc(destination.name) + '" placeholder="例如台東知本" aria-label="第 ' + (index + 1) + ' 個目的地" aria-invalid="' + nameInvalid + '"' + nameDescribed + ">" +
      '<input class="days-input" type="text" inputmode="numeric" data-field="destDays" data-id="' + destination.id + '" data-focus="days-' + destination.id + '" value="' + esc(destination.days) + '" placeholder="未填" aria-label="第 ' + (index + 1) + ' 個目的地的天數" aria-invalid="' + daysInvalid + '"' + daysDescribed + ">" +
      '<button type="button" class="btn text remove" data-action="remove" data-id="' + destination.id + '" data-focus="remove-' + destination.id + '">刪除</button>' +
      errors + "</li>";
  }

  function renderInput() {
    var result = TripLogic.validateTrip(state);
    var summary = describeDays(result);
    var alertText = state.showErrors ? (state.errors.form || state.errors.totalDays) : "";
    var alert = alertText
      ? '<div class="alert" role="alert" tabindex="-1">' + esc(alertText) + "</div>"
      : "";
    var totalInvalid = state.showErrors && state.errors.totalDays;
    var primary = "產生景點與美食清單";
    if (state.mode === "review-allocation" && result.needsAllocationConfirm) primary = "重新分配天數";
    else if (state.mode === "review-allocation") primary = "確認並開始搜尋";
    else if (state.groups) primary = "重新產生清單";
    var secondary = state.mode === "review-allocation"
      ? '<button type="button" class="btn secondary" data-action="clear-days">清空天數，改為自行分配</button>'
      : "";
    var replace = state.groups
      ? '<p class="replace-note">重新產生會以新清單取代目前這一趟，並清空勾選、交通與住宿。</p>'
      : "";
    var searching = state.mode === "searching";
    var formHidden = searching ? "hidden" : "";
    return '<section class="panel">' + (searching ? "" : '<p class="lead">依旅行順序填入目的地與總天數。系統整理成景點與美食兩張清單，勾選後標到同一張地圖上。</p>') +
      alert +
      '<form id="trip-form" ' + formHidden + ">" +
      '<div class="form-grid"><label class="field"><span>旅行名稱</span>' +
      '<input type="text" data-field="tripName" data-focus="trip-name" value="' + esc(state.tripName) + '" placeholder="可空白" aria-label="旅行名稱"></label>' +
      '<label class="field"><span>總天數</span>' +
      '<input type="text" inputmode="numeric" data-field="totalDays" data-focus="total-days" value="' + esc(state.totalDays) + '" placeholder="例如 7" aria-label="總天數" aria-invalid="' + (totalInvalid ? "true" : "false") + '"' +
      (totalInvalid ? ' aria-describedby="total-error"' : "") + ">" +
      fieldError(state.errors.totalDays, "total-error") +
      "</label></div>" +
      '<div class="dest-head"><span></span><span></span><span></span><span>目的地</span><span>天數</span><span></span></div>' +
      '<ol class="dest-list">' + state.destinations.map(renderDestinationRow).join("") + "</ol>" +
      '<div class="tool-row"><button type="button" class="btn text" data-action="add">新增目的地</button>' +
      '<button type="button" class="btn text" data-action="example">填入範例：台東知本，2 天</button></div>' +
      (summary.text ? '<p class="summary ' + summary.tone + '">' + esc(summary.text) + "</p>" : "") +
      '<div class="form-actions"><button type="submit" class="btn" data-focus="submit">' + primary + "</button>" +
      secondary + replace + "</div></form>" +
      (searching ? renderSearch() : "") +
      "</section>";
  }

  function renderSearch() {
    var steps = state.searchSteps || [];
    var current = steps.find(function (step) { return step.status === "running"; });
    var label = current ? "正在搜尋：" + current.destination + " · " + current.kind : "正在整理清單";
    return '<div><p class="search-now" aria-live="polite">' + esc(label) + "</p>" +
      '<ol class="steps">' + steps.map(function (step) {
        var text = { wait: "等待", running: "搜尋中", done: "完成", skipped: "略過" }[step.status] || step.status;
        var detail = step.status === "skipped" ? step.destination + " · 未分配天數" : step.destination + " · " + step.kind;
        return "<li><span class=\"step-state " + step.status + "\">" + text + "</span><span>" + esc(detail) + "</span></li>";
      }).join("") + "</ol></div>";
  }

  function renderStatus(slot) {
    if (slot.status === "unassigned") {
      return '<div class="status-box"><strong>這段未分配天數，沒有候選</strong></div>';
    }
    if (slot.status === "empty") {
      return '<div class="status-box"><strong>查無資料</strong></div>';
    }
    if (slot.status === "failed") {
      var busy = state.retrying && state.retrying.index === slot.groupIndex && state.retrying.kind === slot.kind;
      return '<div class="status-box"><strong>搜尋失敗</strong><p>其他目的地的結果仍保留。</p>' +
        '<button type="button" class="btn secondary" data-action="retry" data-index="' + slot.groupIndex + '" data-kind="' + slot.kind + '"' +
        (busy ? " disabled" : "") + ">" + (busy ? "正在重試此組" : "只重試此組") + "</button></div>";
    }
    return "";
  }

  function renderItem(item) {
    var checked = state.selectedIds.indexOf(item.id) !== -1;
    var hoursLabel = item.type === "景點" ? "景點營業時間" : "美食營業時間";
    return '<article class="item' + (checked ? " is-selected" : "") + '" data-type="' + item.type + '">' +
      '<input class="check" id="pick-' + esc(item.id) + '" type="checkbox" data-action="toggle" data-id="' + esc(item.id) + '" data-focus="pick-' + esc(item.id) + '"' +
      (checked ? " checked" : "") + ' aria-label="留下' + esc(item.name) + '">' +
      '<div><p class="group-meta">目的地　' + esc(item.destination) + "</p>" +
      '<h3 class="item-name"><span class="sr-only">名稱　</span><label for="pick-' + esc(item.id) + '">' + esc(item.name) + "</label></h3>" +
      '<dl class="fields"><div class="field-why"><dt>為什麼適合</dt><dd>' + esc(item.whyFit) + "</dd></div>" +
      "<div><dt>" + hoursLabel + "</dt><dd>" + hoursText(item.hours) + "</dd></div>" +
      "<div><dt>要不要預約</dt><dd>" + reservationTag(item.reservation) + "</dd></div>" +
      '<div class="field-sources"><dt>資料來源</dt><dd>' + sourceList(item.sources || [], "sources") + "</dd></div>" +
      "<div><dt>擷取日期</dt><dd>" + esc(item.retrievedAt) + "</dd></div></dl>" +
      (item.custom ? '<div class="card-actions"><span class="tag tag-custom">自行填入</span><button type="button" class="btn text" data-action="delete-extra" data-id="' + esc(item.id) + '">刪除</button></div>' : "") +
      "</div></article>";
  }

  function renderExtraForm(draft) {
    var groups = state.groups || [];
    var destOptions = groups.map(function (group) {
      return '<option value="' + esc(group.destination) + '"' + (group.destination === draft.destination ? " selected" : "") + ">" + esc(group.destination) + "</option>";
    }).join("");
    var reservations = ["來源未記載", "不需要", "需要"];
    var reservationOptions = reservations.map(function (value) {
      return '<option value="' + value + '"' + (draft.reservation === value ? " selected" : "") + ">" + value + "</option>";
    }).join("");
    return '<form id="extra-form" class="panel plan-form"><h2>新增其他' + esc(draft.itemType) + "</h2>" +
      (draft.error ? '<p class="alert" role="alert">' + esc(draft.error) + "</p>" : "") +
      '<div class="plan-grid">' +
      planInput("名稱", "name", draft.name, ' required placeholder="清單沒有的名稱"') +
      '<label class="field"><span>目的地</span><select name="destination">' + destOptions + "</select></label>" +
      planInput("營業時間", "hours", draft.hours, ' placeholder="不知道可空白"') +
      '<label class="field"><span>要不要預約</span><select name="reservation">' + reservationOptions + "</select></label>" +
      placeField("地圖位置", "place", draft.place) +
      '<label class="field wide"><span>備註</span><textarea name="note" placeholder="為什麼想排進去，可空白">' + esc(draft.note) + "</textarea></label>" +
      "</div><p class=\"preview-note\">名稱自己填。地圖位置選填，選了才會標在地圖上。</p>" +
      '<div class="form-actions"><button type="submit" class="btn">加入清單</button>' +
      '<button type="button" class="btn secondary" data-action="cancel-draft">取消</button></div></form>';
  }

  function renderList() {
    var kind = state.activeTab === "美食" ? "food" : "attractions";
    var typeLabel = state.activeTab === "美食" ? "美食" : "景點";
    var draft = state.draft && state.draft.kind === "extra" ? state.draft : null;
    var groups = (state.groups || []).map(function (group, index) {
      var slot = group[kind];
      var hasItems = slot && Array.isArray(slot.items) && slot.items.length;
      var body = hasItems
        ? '<div class="items">' + slot.items.map(renderItem).join("") + "</div>"
        : renderStatus({ status: slot.status, groupIndex: index, kind: kind });
      var countLabel = hasItems ? " · " + slot.items.length + " 項" : "";
      return '<section class="group"><header class="group-head"><span class="index-no">' +
        String(index + 1).padStart(2, "0") + "</span><h2>" + esc(group.destination) +
        '</h2><p class="group-meta">' + group.days + " 天" + countLabel + "</p></header>" + body + "</section>";
    }).join("");
    var adder = draft
      ? renderExtraForm(draft)
      : '<div class="section-head"><p class="lead">清單沒有的' + typeLabel + "，可以用其他自行補上。</p>" +
        '<button type="button" class="btn" data-action="open-extra">新增其他' + typeLabel + "</button></div>";
    return renderSourcesNote() +
      '<div class="tabs" role="tablist" aria-label="清單分頁"><button type="button" class="tab" role="tab" data-action="tab" data-tab="景點" data-focus="tab-spot" aria-selected="' +
      (state.activeTab === "景點" ? "true" : "false") + '">景點<span class="count">' + selectedCount("景點") + "</span></button>" +
      '<button type="button" class="tab" role="tab" data-action="tab" data-tab="美食" data-focus="tab-food" aria-selected="' +
      (state.activeTab === "美食" ? "true" : "false") + '">美食<span class="count">' + selectedCount("美食") + "</span></button></div>" +
      adder + groups;
  }

  function renderConfirmCard(item) {
    var located = item.geocodeStatus !== "未能標上地圖";
    var kindClass = item.type === "景點" ? "spot" : "food";
    return '<article class="confirm-card"><p><em class="kind ' + kindClass + '">' + item.type + "</em>" +
      (located ? "" : '<em class="miss">未能標上地圖</em>') + "</p>" +
      "<h3>" + esc(item.name) + "</h3>" +
      '<p class="confirm-meta">營業時間　' + (item.hours === "來源未記載" ? "來源未記載" : esc(item.hours)) + "</p>" +
      '<p class="confirm-meta">要不要預約　' + esc(item.reservation) + "</p>" +
      sourceList(item.sources, "confirm-links") + "</article>";
  }

  function renderConfirm() {
    var chosen = new Set(state.selectedIds);
    var items = selectedItems();
    var list;
    if (!items.length) {
      list = '<div class="empty-confirm"><p>尚未勾選景點或美食</p>' +
        '<button type="button" class="btn" data-action="goto" data-view="list">回到清單勾選</button></div>';
    } else {
      var chunks = [];
      (state.groups || []).forEach(function (group) {
        var groupItems = group.attractions.items.concat(group.food.items).filter(function (item) {
          return chosen.has(item.id);
        });
        if (!groupItems.length) return;
        chunks.push('<section class="confirm-group"><header class="group-head"><h2>' + esc(group.destination) +
          '</h2><p class="group-meta">' + group.days + " 天</p></header>" +
          groupItems.map(renderConfirmCard).join("") + "</section>");
      });
      list = chunks.join("");
    }
    return '<div class="confirm-layout"><div class="selected-column">' + renderSourcesNote() + list +
      '<p class="footer">這一趟的條件、清單與勾選保存在這台瀏覽器。<a href="../wireframes/index.html">畫面 wireframe</a></p></div>' +
      '<section class="map-panel"><p class="map-caption"><span>這一趟有座標的景點與美食</span><span class="legend">' +
      '<span><i class="swatch spot"></i>景點</span><span><i class="swatch food"></i>美食</span></span></p>' +
      '<div id="map" role="region" aria-label="已選項目地圖"></div></section></div>';
  }

  function modeLabel(mode) {
    var labels = { flight: "飛機", train: "火車", bus: "巴士", car: "汽車", taxi: "計程車", walk: "步行", ferry: "渡輪", other: "其他" };
    return labels[mode] || mode || "";
  }

  function moneyText(money) {
    if (!money || typeof money.amount !== "number" || !Number.isFinite(money.amount)) return "";
    return esc(money.amount.toLocaleString("zh-Hant")) + " " + esc(money.currency || "");
  }

  function dayLabel(dayId) {
    var day = (state.days || []).find(function (item) { return item.id === dayId; });
    if (!day) return dayId || "未指定日期";
    return [day.date, day.destination].filter(Boolean).join(" · ");
  }

  function stayNights(stay) {
    return TripModel.getAccommodationNights(stay);
  }

  function stayCost(stay) {
    var nights = stayNights(stay);
    var rooms = stay.rooms || 1;
    return {
      nights: nights,
      rooms: rooms,
      amount: nights * stay.pricePerNight.amount * rooms,
      currency: stay.pricePerNight.currency
    };
  }

  function normalizePlaceName(value) {
    return String(value || "").replace(/\s+/g, "").replace(/臺/g, "台");
  }

  function namesOverlap(left, right) {
    var a = normalizePlaceName(left);
    var b = normalizePlaceName(right);
    if (!a || !b) return false;
    return a.indexOf(b) !== -1 || b.indexOf(a) !== -1;
  }

  function namedDestinations() {
    return (state.destinations || []).map(function (item) {
      return { name: String(item.name || "").trim(), days: parseInt(item.days, 10) };
    }).filter(function (item) { return item.name; });
  }

  function addDays(iso, offset) {
    var parts = String(iso || "").split("-");
    var date = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
    if (Number.isNaN(date.getTime())) return "";
    date.setUTCDate(date.getUTCDate() + offset);
    var month = String(date.getUTCMonth() + 1).padStart(2, "0");
    var day = String(date.getUTCDate()).padStart(2, "0");
    return date.getUTCFullYear() + "-" + month + "-" + day;
  }

  function buildDaysForTrip() {
    var start = TripLogic.todayString();
    var days = [];
    var index = 0;
    namedDestinations().forEach(function (dest) {
      if (!Number.isInteger(dest.days) || dest.days < 1) return;
      for (var i = 0; i < dest.days; i += 1) {
        index += 1;
        days.push({
          id: state.id + "-day-" + index,
          date: addDays(start, index - 1),
          destination: dest.name
        });
      }
    });
    return days;
  }

  function planMatchesTrip() {
    var dests = namedDestinations();
    var days = state.days || [];
    if (!dests.length) return true;
    if (!days.length) return !((state.transports || []).length || (state.accommodations || []).length);
    return days.every(function (day) {
      return dests.some(function (item) { return namesOverlap(item.name, day.destination); });
    });
  }

  function groupsMatchTrip() {
    var dests = namedDestinations();
    var groups = state.groups || [];
    if (!dests.length || !groups.length) return true;
    return groups.every(function (group) {
      return dests.some(function (item) { return namesOverlap(item.name, group.destination); });
    });
  }

  function alignPlanWithDestinations(forceRebuild) {
    if (!groupsMatchTrip()) {
      state.groups = null;
      state.selectedIds = [];
      if (state.view === "list" || state.view === "confirm") state.view = "input";
    }
    var nextDays = buildDaysForTrip();
    var mismatched = !planMatchesTrip();
    if (!nextDays.length) {
      if (mismatched) {
        state.days = [];
        state.transports = [];
        state.accommodations = [];
      }
      return;
    }
    if (!forceRebuild && !mismatched && (state.days || []).length) return;
    state.days = nextDays;
    if (forceRebuild || mismatched) {
      state.transports = [];
      state.accommodations = [];
    }
  }

  function locatedActivities() {
    var items = [];
    (state.groups || []).forEach(function (group) {
      ["attractions", "food"].forEach(function (key) {
        var slot = group[key];
        if (!slot || !Array.isArray(slot.items)) return;
        slot.items.forEach(function (item) {
          if (typeof item.lat === "number" && typeof item.lng === "number") items.push(item);
        });
      });
    });
    return items;
  }

  function tripPlaces() {
    var places = [];
    var seen = {};
    function add(name, lat, lng) {
      if (!name || seen[name]) return;
      if (typeof lat !== "number" || typeof lng !== "number") return;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      seen[name] = true;
      places.push({ name: name, lat: lat, lng: lng });
    }
    var hint = normalizePlaceName(namedDestinations().map(function (item) { return item.name; }).join(""));
    if (hint.indexOf("知本") !== -1 || hint.indexOf("台東") !== -1) {
      add("台東車站", 22.7938, 121.1235);
      add("知本車站", 22.7106, 121.0603);
    }
    locatedActivities().forEach(function (item) { add(item.name, item.lat, item.lng); });
    (state.accommodations || []).forEach(function (stay) {
      var loc = stay.location || {};
      add(stay.name, loc.lat, loc.lng);
    });
    return places;
  }

  function placeValue(place) {
    return place.name + "|" + place.lat + "|" + place.lng;
  }

  function parsePlace(value) {
    var parts = String(value || "").split("|");
    if (parts.length < 3) return null;
    var name = parts[0].trim();
    var lat = Number(parts[1]);
    var lng = Number(parts[2]);
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { name: name, lat: lat, lng: lng };
  }

  function placeField(label, fieldName, selectedValue) {
    var places = tripPlaces();
    var matched = false;
    var options = places.map(function (place) {
      var value = placeValue(place);
      var selected = value === selectedValue;
      if (selected) matched = true;
      return '<option value="' + esc(value) + '"' + (selected ? " selected" : "") + ">" + esc(place.name) + "</option>";
    }).join("");
    var current = "";
    if (selectedValue && !matched) {
      current = '<option value="' + esc(selectedValue) + '" selected>' + esc(String(selectedValue).split("|")[0]) + "</option>";
    }
    return '<label class="field wide"><span>' + label + '</span><select name="' + fieldName + '">' +
      '<option value="">請選擇地點</option>' + options + current + "</select></label>";
  }

  function splitWhen(value) {
    var match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
    return match ? { date: match[1], time: match[2] } : { date: "", time: "" };
  }

  function combineDateTime(date, time) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return "";
    var clock = /^\d{2}:\d{2}/.test(time || "") ? String(time).slice(0, 5) : "09:00";
    return date + "T" + clock + ":00+08:00";
  }

  function blankTransportDraft() {
    var firstDay = (state.days || [])[0];
    return {
      kind: "transport",
      id: "",
      dayId: firstDay ? firstDay.id : "",
      mode: "bus",
      fromPlace: "",
      toPlace: "",
      departDate: firstDay && firstDay.date ? firstDay.date : TripLogic.todayString(),
      departTime: "09:00",
      arriveDate: "",
      arriveTime: "",
      amount: "",
      currency: state.baseCurrency || "TWD",
      bookingRef: "",
      note: "",
      error: ""
    };
  }

  function transportDraftFrom(item) {
    var depart = splitWhen(item.departAt);
    var arrive = splitWhen(item.arriveAt);
    return {
      kind: "transport",
      id: item.id,
      dayId: item.dayId,
      mode: item.mode,
      fromPlace: item.from.name + "|" + item.from.lat + "|" + item.from.lng,
      toPlace: item.to.name + "|" + item.to.lat + "|" + item.to.lng,
      departDate: depart.date,
      departTime: depart.time || "09:00",
      arriveDate: arrive.date,
      arriveTime: arrive.time,
      amount: String(item.cost.amount),
      currency: item.cost.currency,
      bookingRef: item.bookingRef || "",
      note: item.note || "",
      error: ""
    };
  }

  function blankStayDraft() {
    var firstDay = (state.days || [])[0];
    var lastDay = (state.days || [])[(state.days || []).length - 1];
    var checkIn = firstDay && firstDay.date ? firstDay.date : "";
    var checkOut = lastDay && lastDay.date ? addDays(lastDay.date, 1) : (checkIn ? addDays(checkIn, 1) : "");
    return {
      kind: "stay",
      id: "",
      name: "",
      place: "",
      address: "",
      checkIn: checkIn,
      checkOut: checkOut,
      amount: "",
      currency: state.baseCurrency || "TWD",
      rooms: "1",
      bookingUrl: "",
      note: "",
      error: ""
    };
  }

  function stayDraftFrom(item) {
    return {
      kind: "stay",
      id: item.id,
      name: item.name,
      place: item.location.name + "|" + item.location.lat + "|" + item.location.lng,
      address: item.location.address || "",
      checkIn: item.checkIn,
      checkOut: item.checkOut,
      amount: String(item.pricePerNight.amount),
      currency: item.pricePerNight.currency,
      rooms: item.rooms ? String(item.rooms) : "1",
      bookingUrl: item.bookingUrl || "",
      note: item.note || "",
      error: ""
    };
  }

  function planInput(label, name, value, extra) {
    return '<label class="field"><span>' + label + '</span><input type="text" name="' + name + '" value="' + esc(value || "") + '"' + (extra || "") + "></label>";
  }

  function dayOptions(selected) {
    var days = (state.days || []).slice();
    if (selected && !days.some(function (day) { return day.id === selected; })) {
      days.unshift({ id: selected, date: "", destination: "" });
    }
    if (!days.length) {
      return planInput("對應的一天", "dayId", selected, ' placeholder="例如 day-1"').replace('class="field"', 'class="field wide"');
    }
    return '<label class="field wide"><span>對應的一天</span><select name="dayId">' + days.map(function (day) {
      return '<option value="' + esc(day.id) + '"' + (day.id === selected ? " selected" : "") + ">" + esc(dayLabel(day.id)) + "</option>";
    }).join("") + "</select></label>";
  }

  function modeOptions(selected) {
    var modes = [
      ["flight", "飛機"],
      ["train", "火車"],
      ["bus", "巴士"],
      ["car", "汽車"],
      ["taxi", "計程車"],
      ["walk", "步行"],
      ["ferry", "渡輪"],
      ["other", "其他"]
    ];
    return '<label class="field"><span>方式</span><select name="mode">' + modes.map(function (mode) {
      return '<option value="' + mode[0] + '"' + (mode[0] === selected ? " selected" : "") + ">" + mode[1] + "</option>";
    }).join("") + "</select></label>";
  }

  function renderTransportForm(draft) {
    var places = tripPlaces();
    var hint = places.length
      ? ""
      : '<p class="alert" role="alert">還沒有可選的地點。請先產生景點清單，或把目的地填成台東知本。</p>';
    return '<form id="plan-form" class="panel plan-form"><h2>' + (draft.id ? "編輯交通" : "新增交通") + "</h2>" +
      (draft.error ? '<p class="alert" role="alert">' + esc(draft.error) + "</p>" : "") + hint +
      '<div class="plan-grid">' +
      modeOptions(draft.mode) +
      dayOptions(draft.dayId) +
      placeField("出發地", "fromPlace", draft.fromPlace) +
      placeField("目的地", "toPlace", draft.toPlace) +
      '<label class="field"><span>出發日期</span><input type="date" name="departDate" value="' + esc(draft.departDate) + '"></label>' +
      '<label class="field"><span>出發時間</span><input type="time" name="departTime" value="' + esc(draft.departTime) + '"></label>' +
      '<label class="field"><span>到達日期</span><input type="date" name="arriveDate" value="' + esc(draft.arriveDate) + '"></label>' +
      '<label class="field"><span>到達時間</span><input type="time" name="arriveTime" value="' + esc(draft.arriveTime) + '"></label>' +
      planInput("費用", "amount", draft.amount, ' inputmode="decimal" placeholder="0"') +
      planInput("幣別", "currency", draft.currency, ' placeholder="TWD"') +
      planInput("預訂代號", "bookingRef", draft.bookingRef, ' placeholder="可空白"') +
      '<label class="field wide"><span>備註</span><textarea name="note">' + esc(draft.note) + "</textarea></label>" +
      "</div><div class=\"form-actions\"><button type=\"submit\" class=\"btn\">儲存</button>" +
      '<button type="button" class="btn secondary" data-action="cancel-draft">取消</button></div></form>';
  }

  function renderStayForm(draft) {
    return '<form id="plan-form" class="panel plan-form"><h2>' + (draft.id ? "編輯住宿" : "新增住宿") + "</h2>" +
      (draft.error ? '<p class="alert" role="alert">' + esc(draft.error) + "</p>" : "") +
      '<div class="plan-grid">' +
      planInput("名稱", "name", draft.name, ' required placeholder="自行填寫住宿名稱"') +
      planInput("地址", "address", draft.address, ' placeholder="自行填寫地址，可空白"') +
      placeField("參考位置", "place", draft.place) +
      '<label class="field"><span>入住</span><input type="date" name="checkIn" value="' + esc(draft.checkIn) + '"></label>' +
      '<label class="field"><span>退房</span><input type="date" name="checkOut" value="' + esc(draft.checkOut) + '"></label>' +
      planInput("每晚價格", "amount", draft.amount, ' inputmode="decimal" placeholder="0"') +
      planInput("幣別", "currency", draft.currency, ' placeholder="TWD"') +
      planInput("房間數", "rooms", draft.rooms, ' inputmode="numeric"') +
      planInput("預訂連結", "bookingUrl", draft.bookingUrl, ' placeholder="https://"') +
      '<label class="field wide"><span>備註</span><textarea name="note">' + esc(draft.note) + "</textarea></label>" +
      "</div><div class=\"form-actions\"><button type=\"submit\" class=\"btn\">儲存</button>" +
      '<button type="button" class="btn secondary" data-action="cancel-draft">取消</button></div></form>';
  }

  function renderTransportCard(item, index) {
    return '<article class="plan-card"><p><em class="kind ride">第 ' + (index + 1) + " 段 · " + esc(modeLabel(item.mode)) + "</em></p>" +
      "<h3>" + esc(item.from.name) + " → " + esc(item.to.name) + "</h3>" +
      '<p class="confirm-meta">' + esc(dayLabel(item.dayId)) + "</p>" +
      '<p class="confirm-meta">出發　' + esc(item.departAt) + (item.arriveAt ? "　　到達　" + esc(item.arriveAt) : "") + "</p>" +
      '<p class="confirm-meta">費用　' + moneyText(item.cost) + "</p>" +
      (item.bookingRef ? '<p class="confirm-meta">預訂代號　' + esc(item.bookingRef) + "</p>" : "") +
      (item.note ? "<p>" + esc(item.note) + "</p>" : "") +
      '<div class="card-actions"><button type="button" class="btn secondary" data-action="edit-transport" data-id="' + esc(item.id) + '">編輯</button>' +
      '<button type="button" class="btn text" data-action="delete-transport" data-id="' + esc(item.id) + '">刪除</button></div></article>';
  }

  function renderStayCard(item) {
    var cost = stayCost(item);
    var place = item.location.address || item.location.name;
    return '<article class="plan-card"><p><em class="kind stay">住宿</em></p><h3>' + esc(item.name) + "</h3>" +
      '<p class="confirm-meta">' + esc(place) + "</p>" +
      '<p class="confirm-meta">入住　' + esc(item.checkIn) + "　　退房　" + esc(item.checkOut) + "　　" + cost.nights + " 晚</p>" +
      '<p class="confirm-meta">' + cost.nights + " 晚 × " + cost.rooms + " 間 × " + moneyText(item.pricePerNight) + "／晚</p>" +
      '<p class="confirm-meta">小計　' + moneyText(cost) + "</p>" +
      (item.bookingUrl && /^https?:\/\//i.test(item.bookingUrl) ? '<p><a href="' + esc(item.bookingUrl) + '" target="_blank" rel="noopener noreferrer">預訂頁</a></p>' : "") +
      (item.note ? "<p>" + esc(item.note) + "</p>" : "") +
      '<div class="card-actions"><button type="button" class="btn secondary" data-action="edit-stay" data-id="' + esc(item.id) + '">編輯</button>' +
      '<button type="button" class="btn text" data-action="delete-stay" data-id="' + esc(item.id) + '">刪除</button></div></article>';
  }

  function transportChainText(items) {
    if (!items.length) return "";
    var names = [items[0].from.name];
    items.forEach(function (item) {
      if (names[names.length - 1] !== item.to.name) names.push(item.to.name);
    });
    return '<p class="route">' + names.map(function (name) { return esc(name); }).join("<span>→</span>") + "</p>";
  }

  function renderTransport() {
    var draft = state.draft && state.draft.kind === "transport" ? state.draft : null;
    var items = state.transports || [];
    var list = items.length
      ? transportChainText(items) + '<div class="plan-list">' + items.map(function (item, index) {
        return renderTransportCard(item, index);
      }).join("") + "</div>"
      : '<div class="status-box"><strong>這一趟還沒有交通</strong><p>依景點與美食清單排出一份連續的移動方式。</p></div>';
    var notice = "";
    if (state.transportMessage) {
      notice = state.transportMessage.indexOf("已依") === 0
        ? '<p class="summary ok">' + esc(state.transportMessage) + "</p>"
        : '<p class="alert" role="alert">' + esc(state.transportMessage) + "</p>";
    }
    return '<div class="section-head"><p class="lead">依景點與美食清單排出一份交通。有勾選時只排勾過的項目，再產生會取代目前的交通。</p>' +
      (draft ? "" : '<div class="card-actions"><button type="button" class="btn secondary" data-action="suggest-transport">依清單規劃交通</button><button type="button" class="btn" data-action="open-transport">新增交通</button></div>') +
      "</div>" + notice + (draft ? renderTransportForm(draft) : "") + list;
  }

  function kmBetween(a, b) {
    var toRad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * toRad;
    var dLng = (b.lng - a.lng) * toRad;
    var lat1 = a.lat * toRad;
    var lat2 = b.lat * toRad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  }

  function minutesFor(mode, km) {
    if (mode === "walk") return Math.max(10, Math.round(km * 12));
    if (mode === "taxi" || mode === "car") return Math.max(10, Math.round(km * 2 + 8));
    if (mode === "train") return Math.max(20, Math.round(km * 1.2 + 20));
    return Math.max(15, Math.round(km * 2.5 + 15));
  }

  function costFor(mode, km) {
    if (mode === "walk") return 0;
    if (mode === "taxi") return Math.max(100, Math.round(km * 35 / 10) * 10);
    if (mode === "car") return Math.max(200, Math.round(km * 10 / 10) * 10);
    if (mode === "train") return Math.max(40, Math.round(km * 2.5 / 10) * 10);
    return Math.max(20, Math.round(Math.max(km, 1) * 4 / 10) * 10);
  }

  function modeForDistance(km, prefer) {
    if (prefer) return prefer;
    if (km < 1.5) return "walk";
    if (km < 20) return "taxi";
    if (km < 120) return "bus";
    return "train";
  }

  function clockPlus(time, minutes) {
    var parts = String(time || "09:00").split(":");
    var total = Number(parts[0]) * 60 + Number(parts[1]) + minutes;
    total = ((total % 1440) + 1440) % 1440;
    return String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
  }

  function hasPoint(lat, lng) {
    return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng);
  }

  function daysForDestination(name) {
    return (state.days || []).filter(function (day) {
      return namesOverlap(day.destination, name);
    });
  }

  function taitungGateway() {
    var hint = normalizePlaceName(namedDestinations().map(function (item) { return item.name; }).join(""));
    if (hint.indexOf("知本") === -1 && hint.indexOf("台東") === -1) return null;
    return { name: "台東車站", lat: 22.7938, lng: 121.1235, role: "gateway", destination: "" };
  }

  function collectRouteGroups() {
    var chosen = new Set(state.selectedIds || []);
    var grouped = [];
    var selectedLocated = 0;
    var selectedMissing = 0;
    var listedMissing = 0;
    (state.groups || []).forEach(function (group) {
      var stops = [];
      ["attractions", "food"].forEach(function (key) {
        var slot = group[key];
        if (!slot || !Array.isArray(slot.items)) return;
        slot.items.forEach(function (item) {
          var picked = chosen.has(item.id);
          var located = hasPoint(item.lat, item.lng);
          if (!located) {
            listedMissing += 1;
            if (picked) selectedMissing += 1;
            return;
          }
          if (picked) selectedLocated += 1;
          if (stops.some(function (stop) { return stop.name === item.name; })) return;
          stops.push({
            name: item.name,
            lat: item.lat,
            lng: item.lng,
            role: key === "food" ? "food" : "spot",
            destination: group.destination,
            selected: picked
          });
        });
      });
      grouped.push({ destination: group.destination, stops: stops });
    });
    var useSelection = selectedLocated > 0 || selectedMissing > 0;
    if (useSelection) {
      grouped.forEach(function (group) {
        group.stops = group.stops.filter(function (stop) { return stop.selected; });
      });
    }
    return {
      groups: grouped.filter(function (group) { return group.stops.length; }),
      missingCoords: useSelection ? selectedMissing : listedMissing
    };
  }

  function orderNearest(stops, origin) {
    var remaining = stops.slice();
    var ordered = [];
    var current = origin;
    while (remaining.length) {
      var best = 0;
      var bestKm = Infinity;
      for (var index = 0; index < remaining.length; index += 1) {
        var km = current ? kmBetween(current, remaining[index]) : 0;
        if (km < bestKm) {
          bestKm = km;
          best = index;
        }
      }
      current = remaining.splice(best, 1)[0];
      ordered.push(current);
    }
    return ordered;
  }

  function assignStopDays(stops) {
    var buckets = {};
    stops.forEach(function (stop) {
      if (!buckets[stop.destination]) buckets[stop.destination] = [];
      buckets[stop.destination].push(stop);
    });
    Object.keys(buckets).forEach(function (destination) {
      var group = buckets[destination];
      var days = daysForDestination(destination);
      var fallback = (state.days || [])[0] || null;
      group.forEach(function (stop, index) {
        if (!days.length) {
          stop.day = fallback;
          return;
        }
        var bucket = Math.min(days.length - 1, Math.floor(index * days.length / group.length));
        stop.day = days[bucket];
      });
    });
  }

  function preferMode(from, to, km) {
    if (from.role === "gateway" || to.role === "gateway") return "bus";
    if (from.destination && to.destination && from.destination !== to.destination) {
      return km >= 25 ? "train" : "bus";
    }
    return "";
  }

  function legNote(from, to, km) {
    var distance = km < 1 ? "不到 1 公里" : "約 " + Math.max(1, Math.round(km)) + " 公里";
    if (from.role === "gateway") return "從" + from.name + "出發，接上清單的第一個地點。" + distance + "，費用依距離估算，可再修改。";
    if (to.role === "gateway") return "清單走完後返回" + to.name + "。" + distance + "，費用依距離估算，可再修改。";
    if (from.destination && to.destination && from.destination !== to.destination) {
      return "換到下一個目的地。" + distance + "，費用依距離估算，可再修改。";
    }
    var kind = to.role === "food" ? "前往下一餐" : "前往下一個景點";
    return kind + "。" + distance + "，費用依距離估算，可再修改。";
  }

  function clockFromMinutes(total) {
    var wrapped = ((Math.round(total) % 1440) + 1440) % 1440;
    return String(Math.floor(wrapped / 60)).padStart(2, "0") + ":" + String(wrapped % 60).padStart(2, "0");
  }

  function transportPlans() {
    var collected = collectRouteGroups();
    var groups = collected.groups;
    if (!groups.length) return { plans: [], missingCoords: collected.missingCoords };
    var days = (state.days && state.days.length) ? state.days : buildDaysForTrip();
    if (!days.length) return { plans: [], missingCoords: collected.missingCoords };
    var gateway = taitungGateway();
    var chain = [];
    var cursor = gateway;
    groups.forEach(function (group) {
      var ordered = orderNearest(group.stops, cursor);
      ordered.forEach(function (stop) { chain.push(stop); });
      cursor = ordered[ordered.length - 1];
    });
    if (!chain.length) return { plans: [], missingCoords: collected.missingCoords };
    assignStopDays(chain);
    var plans = [];
    function pushLeg(from, to) {
      if (!from || !to || from.name === to.name) return;
      var km = kmBetween(from, to);
      var day = to.day || from.day || days[0];
      if (!day) return;
      plans.push({
        from: from,
        to: to,
        day: day,
        km: km,
        prefer: preferMode(from, to, km),
        label: legNote(from, to, km)
      });
    }
    if (gateway) pushLeg(gateway, chain[0]);
    for (var index = 0; index < chain.length - 1; index += 1) pushLeg(chain[index], chain[index + 1]);
    if (gateway) pushLeg(chain[chain.length - 1], gateway);
    var byDay = {};
    plans.forEach(function (plan) {
      var key = plan.day.id;
      if (!byDay[key]) byDay[key] = [];
      byDay[key].push(plan);
    });
    Object.keys(byDay).forEach(function (key) {
      var legs = byDay[key];
      var cursorMin = 9 * 60;
      legs.forEach(function (plan, index) {
        var mode = modeForDistance(plan.km, plan.prefer);
        var travel = minutesFor(mode, plan.km);
        var slotsLeft = legs.length - index - 1;
        var remain = Math.max(0, 18 * 60 + 30 - cursorMin - travel);
        var dwellCap = plan.to.role === "food" ? 70 : 85;
        if (plan.to.role === "gateway") dwellCap = 0;
        var dwell = slotsLeft > 0 ? Math.min(dwellCap, Math.floor(remain / slotsLeft)) : 0;
        plan.mode = mode;
        plan.time = clockFromMinutes(cursorMin);
        plan.arrive = clockFromMinutes(cursorMin + travel);
        cursorMin += travel + dwell;
      });
    });
    return { plans: plans, missingCoords: collected.missingCoords };
  }

  function applyTransportSuggestions() {
    if (!(state.days || []).length) alignPlanWithDestinations(false);
    var result = transportPlans();
    var plans = result.plans || [];
    if (!plans.length) {
      state.transportMessage = "清單裡還沒有足夠的座標，無法規劃交通。";
      return 0;
    }
    state.transports = [];
    plans.forEach(function (plan) {
      var date = plan.day.date || TripLogic.todayString();
      TripModel.addTransport({
        dayId: plan.day.id,
        mode: plan.mode,
        from: { name: plan.from.name, lat: plan.from.lat, lng: plan.from.lng },
        to: { name: plan.to.name, lat: plan.to.lat, lng: plan.to.lng },
        departAt: combineDateTime(date, plan.time),
        arriveAt: combineDateTime(date, plan.arrive),
        cost: { amount: costFor(plan.mode, plan.km), currency: state.baseCurrency || "TWD" },
        note: plan.label
      });
    });
    var skipped = result.missingCoords ? "有 " + result.missingCoords + " 個項目沒有座標，未排進路線。" : "";
    state.transportMessage = "已依清單排出 " + plans.length + " 段交通。" + skipped;
    return plans.length;
  }

  function stayWindow() {
    var days = state.days || [];
    var checkIn = days[0] && days[0].date ? days[0].date : "";
    var checkOut = days.length > 1 && days[days.length - 1].date ? days[days.length - 1].date : (checkIn ? addDays(checkIn, 1) : "");
    return { checkIn: checkIn, checkOut: checkOut };
  }

  function stayChoices() {
    var choices = [];
    var seen = {};
    var stay = stayWindow();
    function push(place, ride) {
      if (!place || !place.name || seen[place.name] || choices.length >= 3) return;
      if (String(place.name).indexOf("車站") !== -1) return;
      if (typeof place.lat !== "number" || typeof place.lng !== "number") return;
      seen[place.name] = true;
      choices.push({
        title: place.name + " 附近",
        place: place.name + "|" + place.lat + "|" + place.lng,
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        basedOn: ride.from.name + " → " + ride.to.name
      });
    }
    (state.transports || []).forEach(function (ride) { push(ride.to, ride); });
    (state.transports || []).forEach(function (ride) { push(ride.from, ride); });
    return choices;
  }

  function renderStayChoices() {
    var choices = stayChoices();
    if (!choices.length) {
      return '<section class="choice-head"><h2>依交通規劃的住宿選項</h2><p class="lead">先依清單規劃交通，這裡會列出可入住的位置。</p></section>';
    }
    return '<section class="choice-head"><h2>依交通規劃的住宿選項</h2><p class="lead">這些位置跟著交通的起訖。選一個之後，再自己填住宿名稱和地址。</p></section>' +
      '<div class="plan-list">' + choices.map(function (choice, index) {
        return '<article class="plan-card"><p><em class="kind stay">住宿選項</em></p><h3>' + esc(choice.title) + "</h3>" +
          '<p class="confirm-meta">配合交通　' + esc(choice.basedOn) + "</p>" +
          '<p class="confirm-meta">建議入住　' + esc(choice.checkIn) + "　　退房　" + esc(choice.checkOut) + "</p>" +
          '<div class="card-actions"><button type="button" class="btn" data-action="use-stay" data-index="' + index + '">用這個位置填寫</button></div></article>';
      }).join("") + "</div>";
  }

  function renderStay() {
    var draft = state.draft && state.draft.kind === "stay" ? state.draft : null;
    var items = state.accommodations || [];
    var list = items.length
      ? '<div class="plan-list">' + items.map(renderStayCard).join("") + "</div>"
      : '<div class="status-box"><strong>這一趟還沒有住宿</strong><p>新增飯店或旅館後，會一併算進預算與地圖。</p></div>';
    return '<div class="section-head"><p class="lead">名稱和地址自己填。選項依交通的起訖產生，選定後再補上這間住宿的資料。</p>' +
      (draft ? "" : '<button type="button" class="btn" data-action="open-stay">新增住宿</button>') +
      "</div>" + (draft && draft.id ? "" : renderStayChoices()) + (draft ? renderStayForm(draft) : "") + list;
  }

  function budgetLines() {
    var lines = [];
    (state.transports || []).forEach(function (item) {
      lines.push({
        category: "交通",
        title: item.from.name + " → " + item.to.name,
        amount: item.cost.amount,
        currency: item.cost.currency
      });
    });
    (state.accommodations || []).forEach(function (stay) {
      var cost = stayCost(stay);
      lines.push({
        category: "住宿",
        title: stay.name + " · " + cost.nights + " 晚",
        amount: cost.amount,
        currency: cost.currency
      });
    });
    var chosen = new Set(state.selectedIds || []);
    (state.groups || []).forEach(function (group) {
      ["attractions", "food"].forEach(function (key) {
        var slot = group[key];
        if (!slot || !Array.isArray(slot.items)) return;
        slot.items.forEach(function (item) {
          if (!chosen.has(item.id) || !item.cost) return;
          lines.push({
            category: item.type === "美食" ? "美食" : "景點",
            title: item.name,
            amount: item.cost.amount,
            currency: item.cost.currency
          });
        });
      });
    });
    return lines;
  }

  function renderBudget() {
    var lines = budgetLines();
    var currencies = [];
    lines.forEach(function (line) {
      if (currencies.indexOf(line.currency) === -1) currencies.push(line.currency);
    });
    var boards = currencies.map(function (currency) {
      var subset = lines.filter(function (line) { return line.currency === currency; });
      var total = subset.reduce(function (sum, line) { return sum + line.amount; }, 0);
      var groups = ["交通", "住宿", "景點", "美食"];
      var bits = groups.map(function (category) {
        var amount = subset.filter(function (line) { return line.category === category; }).reduce(function (sum, line) {
          return sum + line.amount;
        }, 0);
        if (!amount) return "";
        return "<div><dt>" + category + "</dt><dd>" + moneyText({ amount: amount, currency: currency }) + "</dd></div>";
      }).join("");
      return '<article class="plan-card"><p class="group-meta">' + esc(currency) + '</p><p class="budget-total">' +
        moneyText({ amount: total, currency: currency }) + "</p><dl class=\"fields\">" + bits + "</dl></article>";
    }).join("");
    var detail = lines.length
      ? '<ul class="budget-lines">' + lines.map(function (line) {
        return "<li><span><em class=\"kind\">" + esc(line.category) + "</em> " + esc(line.title) + "</span><strong>" +
          moneyText(line) + "</strong></li>";
      }).join("") + "</ul>"
      : '<div class="status-box"><strong>還沒有可加總的費用</strong><p>交通、住宿，以及已勾選且有費用的景點與美食會出現在這裡。</p></div>';
    return '<div class="panel" style="margin-bottom:16px"><div class="plan-grid">' +
      '<label class="field"><span>旅客人數</span><input type="number" min="1" step="1" data-budget="travelers" value="' + esc(state.travelers || 1) + '"></label>' +
      '<label class="field"><span>主幣別</span><input type="text" data-budget="baseCurrency" value="' + esc(state.baseCurrency || "TWD") + '"></label>' +
      "</div><p class=\"preview-note\">各筆費用依原幣別加總，不換算成主幣別。景點與美食只計入已勾選、且填了費用的項目。</p></div>" +
      (boards ? '<div class="budget-board">' + boards + "</div>" : "") +
      '<section class="plan-card"><h2>明細</h2>' + detail + "</section>";
  }

  function renderMapPage() {
    return '<div class="map-page"><section class="map-panel"><p class="map-caption"><span>住宿、交通起訖，以及這一趟有座標的景點與美食</span><span class="legend">' +
      '<span><i class="swatch stay"></i>住宿</span><span><i class="swatch ride"></i>交通</span>' +
      '<span><i class="swatch spot"></i>景點</span><span><i class="swatch food"></i>美食</span></span></p>' +
      '<div id="map" role="region" aria-label="行程地圖"></div></section></div>';
  }

  function formValue(form, name) {
    return String(new FormData(form).get(name) || "").trim();
  }

  function requiredNumber(text) {
    if (text === "") return null;
    var number = Number(text);
    return Number.isFinite(number) ? number : null;
  }

  function rememberTransportDraft(form, error) {
    state.draft = {
      kind: "transport",
      id: state.draft ? state.draft.id : "",
      dayId: formValue(form, "dayId"),
      mode: formValue(form, "mode") || "bus",
      fromPlace: formValue(form, "fromPlace"),
      toPlace: formValue(form, "toPlace"),
      departDate: formValue(form, "departDate"),
      departTime: formValue(form, "departTime"),
      arriveDate: formValue(form, "arriveDate"),
      arriveTime: formValue(form, "arriveTime"),
      amount: formValue(form, "amount"),
      currency: formValue(form, "currency") || state.baseCurrency || "TWD",
      bookingRef: formValue(form, "bookingRef"),
      note: formValue(form, "note"),
      error: error
    };
  }

  function rememberStayDraft(form, error) {
    state.draft = {
      kind: "stay",
      id: state.draft ? state.draft.id : "",
      name: formValue(form, "name"),
      place: formValue(form, "place"),
      address: formValue(form, "address"),
      checkIn: formValue(form, "checkIn"),
      checkOut: formValue(form, "checkOut"),
      amount: formValue(form, "amount"),
      currency: formValue(form, "currency") || state.baseCurrency || "TWD",
      rooms: formValue(form, "rooms") || "1",
      bookingUrl: formValue(form, "bookingUrl"),
      note: formValue(form, "note"),
      error: error
    };
  }

  function saveTransportDraft(form) {
    var draftId = state.draft ? state.draft.id : "";
    var from = parsePlace(formValue(form, "fromPlace"));
    var to = parsePlace(formValue(form, "toPlace"));
    var departAt = combineDateTime(formValue(form, "departDate"), formValue(form, "departTime"));
    var dayId = formValue(form, "dayId");
    var amountText = formValue(form, "amount");
    var amount = amountText === "" ? 0 : requiredNumber(amountText);
    if (!from || !to || !departAt || !dayId || amount == null) {
      rememberTransportDraft(form, "請選擇出發地、目的地與對應的一天，並填出發日期。");
      return false;
    }
    var input = {
      dayId: dayId,
      mode: formValue(form, "mode") || "other",
      from: from,
      to: to,
      departAt: departAt,
      cost: { amount: amount, currency: formValue(form, "currency") || state.baseCurrency || "TWD" }
    };
    var arriveAt = combineDateTime(formValue(form, "arriveDate"), formValue(form, "arriveTime"));
    var bookingRef = formValue(form, "bookingRef");
    var note = formValue(form, "note");
    if (arriveAt) input.arriveAt = arriveAt;
    if (bookingRef) input.bookingRef = bookingRef;
    if (note) input.note = note;
    var saved = draftId ? TripModel.updateTransport(draftId, input) : TripModel.addTransport(input);
    if (!saved) {
      rememberTransportDraft(form, "這筆交通沒有存進去。請確認方式、地點與費用。");
      return false;
    }
    state.draft = null;
    return true;
  }

  function saveStayDraft(form) {
    var draftId = state.draft ? state.draft.id : "";
    var name = formValue(form, "name");
    var place = parsePlace(formValue(form, "place"));
    var amountText = formValue(form, "amount");
    var amount = amountText === "" ? 0 : requiredNumber(amountText);
    var checkIn = formValue(form, "checkIn");
    var checkOut = formValue(form, "checkOut");
    if (!name || !place || !checkIn || !checkOut || amount == null) {
      rememberStayDraft(form, "請填寫名稱，並選擇交通規劃裡的參考位置、入住日與退房日。地址可自己填。");
      return false;
    }
    var address = formValue(form, "address");
    if (address) place.address = address;
    var input = {
      name: name,
      location: place,
      checkIn: checkIn,
      checkOut: checkOut,
      pricePerNight: { amount: amount, currency: formValue(form, "currency") || state.baseCurrency || "TWD" }
    };
    var rooms = requiredNumber(formValue(form, "rooms"));
    var bookingUrl = formValue(form, "bookingUrl");
    var note = formValue(form, "note");
    if (rooms != null) input.rooms = rooms;
    if (bookingUrl) input.bookingUrl = bookingUrl;
    if (note) input.note = note;
    var saved = draftId ? TripModel.updateAccommodation(draftId, input) : TripModel.addAccommodation(input);
    if (!saved) {
      rememberStayDraft(form, "這筆住宿沒有存進去。請確認日期、地點與價格。");
      return false;
    }
    state.draft = null;
    return true;
  }

  function saveExtra(form) {
    var draft = state.draft || {};
    var name = formValue(form, "name");
    var destination = formValue(form, "destination");
    var group = (state.groups || []).find(function (item) { return item.destination === destination; });
    if (!name || !group) {
      state.draft = {
        kind: "extra",
        itemType: draft.itemType || (state.activeTab === "美食" ? "美食" : "景點"),
        name: name,
        destination: destination,
        hours: formValue(form, "hours"),
        reservation: formValue(form, "reservation") || "來源未記載",
        note: formValue(form, "note"),
        place: formValue(form, "place"),
        error: "請填名稱，並選擇目的地。"
      };
      render();
      var alert = document.querySelector("[role=alert]");
      if (alert) alert.focus();
      return;
    }
    var type = draft.itemType === "美食" ? "美食" : "景點";
    var key = type === "美食" ? "food" : "attractions";
    var slot = group[key];
    if (!slot || !Array.isArray(slot.items)) {
      slot = { status: "ok", items: [] };
      group[key] = slot;
    }
    var place = parsePlace(formValue(form, "place"));
    var note = formValue(form, "note");
    var item = {
      id: "c-" + uid(),
      type: type,
      destination: group.destination,
      name: name,
      whyFit: note || ("自行加入的" + type + "，用來補清單沒有列出的項目。"),
      hours: formValue(form, "hours") || "來源未記載",
      reservation: formValue(form, "reservation") || "來源未記載",
      sources: [{ title: "自行填入", url: "" }],
      retrievedAt: state.retrievedAt || TripLogic.todayString(),
      lat: place ? place.lat : null,
      lng: place ? place.lng : null,
      geocodeStatus: place ? "已標點" : "未能標上地圖",
      custom: true
    };
    TripModel.enrichActivity(item);
    slot.items.push(item);
    slot.status = "ok";
    state.draft = null;
    state.activeTab = type;
    render();
  }

  function deleteExtra(id) {
    (state.groups || []).forEach(function (group) {
      ["attractions", "food"].forEach(function (key) {
        var slot = group[key];
        if (!slot || !Array.isArray(slot.items)) return;
        slot.items = slot.items.filter(function (item) { return item.id !== id; });
      });
    });
    state.selectedIds = (state.selectedIds || []).filter(function (item) { return item !== id; });
  }

  function submitPlan(form) {
    if (!state.draft) return;
    var ok = state.draft.kind === "stay" ? saveStayDraft(form) : saveTransportDraft(form);
    if (!ok) {
      var alert = document.querySelector("[role=alert]");
      render();
      alert = document.querySelector("[role=alert]");
      if (alert) alert.focus();
      return;
    }
    render();
  }

  function renderFooter() {
    if (state.view === "confirm" || state.view === "map") return "";
    return '<footer class="footer"><p>這一趟的條件、清單與勾選保存在這台瀏覽器。 <a href="../wireframes/index.html">畫面 wireframe</a></p></footer>';
  }

  function renderMain() {
    if (state.view === "list") return renderList();
    if (state.view === "confirm") return renderConfirm();
    if (state.view === "transport") return renderTransport();
    if (state.view === "stay") return renderStay();
    if (state.view === "budget") return renderBudget();
    if (state.view === "map") return renderMapPage();
    return renderInput();
  }

  function render() {
    var saved = pendingFocus || captureFocus();
    pendingFocus = null;
    var scrollY = window.scrollY;
    var viewChanged = lastView !== state.view;
    destroyMap();
    document.body.dataset.view = state.view;
    document.title = pageTitle() + " · 旅遊行程管理系統";
    var main = renderMain();
    app.innerHTML = '<div class="shell">' + renderHeader() + "<main>" + main + "</main>" + renderFooter() + "</div>";
    lastView = state.view;
    if (viewChanged) {
      var title = document.querySelector("[data-page-title]");
      if (title) title.focus();
      window.scrollTo(0, 0);
    } else {
      restoreFocus(saved);
      window.scrollTo(0, scrollY);
    }
    if (state.view === "confirm" || state.view === "map") initMap();
    if (state.mode !== "searching") save();
  }

  function destroyMap() {
    if (map) {
      map.remove();
      map = null;
    }
  }

  function mapPoint(lat, lng, kind, mark, title, popup) {
    if (typeof lat !== "number" || typeof lng !== "number") return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat: lat, lng: lng, kind: kind, mark: mark, title: title, popup: popup };
  }

  function spotPopup(item) {
    var links = item.sources.map(function (source) {
      var url = String(source.url || "");
      if (!/^https?:\/\//i.test(url)) return esc(source.title || "");
      return '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(source.title || url) + "</a>";
    }).join("");
    return "<strong>" + esc(item.name) + "</strong><p>" + esc(item.type) + " · " + esc(item.destination) +
      "</p><p>營業時間　" + esc(item.hours) + "</p><p>要不要預約　" + esc(item.reservation) +
      "</p><p>資料來源　" + links + "</p>";
  }

  function mapPoints() {
    var points = [];
    if (state.view === "map") {
      (state.accommodations || []).forEach(function (stay) {
        var loc = stay.location || {};
        var point = mapPoint(loc.lat, loc.lng, "stay", "住", stay.name,
          "<strong>" + esc(stay.name) + "</strong><p>住宿 · " + stayNights(stay) + " 晚</p><p>" +
          esc(stay.checkIn) + " → " + esc(stay.checkOut) + "</p><p>" + moneyText(stay.pricePerNight) + "／晚</p>");
        if (point) points.push(point);
      });
      (state.transports || []).forEach(function (item) {
        var from = mapPoint(item.from.lat, item.from.lng, "from", "起", item.from.name,
          "<strong>" + esc(item.from.name) + "</strong><p>" + esc(modeLabel(item.mode)) + " 出發</p><p>" + esc(item.departAt) + "</p>");
        var to = mapPoint(item.to.lat, item.to.lng, "to", "迄", item.to.name,
          "<strong>" + esc(item.to.name) + "</strong><p>" + esc(modeLabel(item.mode)) + " 到達</p><p>" + esc(item.arriveAt || "") + "</p>");
        if (from) points.push(from);
        if (to) points.push(to);
      });
    }
    if (state.view === "confirm" || state.view === "map") {
      locatedActivities().forEach(function (item) {
        var point = mapPoint(item.lat, item.lng, item.type === "景點" ? "spot" : "food", item.type === "景點" ? "景" : "食", item.name, spotPopup(item));
        if (point) points.push(point);
      });
    }
    return points;
  }

  function initMap() {
    var node = document.getElementById("map");
    if (!node) return;
    if (typeof L === "undefined") {
      node.innerHTML = '<p class="map-status">地圖元件沒有載入。請重新開啟 frontend/index.html。</p>';
      return;
    }
    if (typeof L.maplibreGL !== "function") {
      node.innerHTML = '<p class="map-status">地圖元件沒有載入。請重新開啟 frontend/index.html。</p>';
      return;
    }
    map = L.map(node, { scrollWheelZoom: true });
    var located = mapPoints();
    var bounds = [];
    located.forEach(function (item) { bounds.push([item.lat, item.lng]); });
    if (bounds.length === 1) map.setView(bounds[0], 14);
    else if (bounds.length > 1) map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 });
    else {
      var hint = normalizePlaceName((state.destinations || []).map(function (item) { return item.name || ""; }).join(""));
      if (hint.indexOf("知本") !== -1 || hint.indexOf("台東") !== -1) map.setView([22.693, 121.018], 13);
      else map.setView([23.7, 121], 7);
    }
    try {
      var base = L.maplibreGL({
        style: "https://tiles.openfreemap.org/styles/liberty"
      }).addTo(map);
      var styled = false;
      base.getMaplibreMap().on("load", function () { styled = true; });
      window.setTimeout(function () {
        if (styled || !map || node.querySelector(".map-status")) return;
        var note = document.createElement("p");
        note.className = "map-status";
        note.textContent = "地圖底圖沒有載入。請檢查網路後重新整理。";
        node.appendChild(note);
      }, 4000);
    } catch (error) {
      node.insertAdjacentHTML("beforeend", '<p class="map-status">地圖底圖沒有載入。請檢查網路後重新整理。</p>');
    }
    if (state.view === "map") {
      (state.transports || []).forEach(function (item) {
        if (!Number.isFinite(item.from.lat) || !Number.isFinite(item.from.lng)) return;
        if (!Number.isFinite(item.to.lat) || !Number.isFinite(item.to.lng)) return;
        L.polyline([[item.from.lat, item.from.lng], [item.to.lat, item.to.lng]], {
          color: "#8a6232",
          weight: 3,
          opacity: 0.85
        }).addTo(map);
      });
    }
    located.forEach(function (item) {
      var icon = L.divIcon({
        className: "leaflet-div-icon pin pin-" + item.kind,
        html: "<span>" + esc(item.mark) + "</span>",
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });
      var marker = L.marker([item.lat, item.lng], { icon: icon, title: item.title }).addTo(map);
      marker.bindPopup('<div class="map-popup">' + item.popup + "</div>");
    });
    window.requestAnimationFrame(function () {
      if (!map) return;
      map.invalidateSize();
      window.setTimeout(function () { if (map) map.invalidateSize(); }, 250);
    });
  }

  function go(view) {
    if (state.mode === "searching") return;
    if ((view === "list" || view === "confirm") && !state.groups) {
      if (view === "confirm") return;
      view = "input";
    }
    state.draft = null;
    state.view = view;
    setHash(view, false);
    render();
  }

  function setHash(view, replace) {
    var next = "#" + view;
    try {
      if (replace) history.replaceState(null, "", location.pathname + next);
      else if (location.hash !== next) history.pushState(null, "", next);
    } catch (error) {
      if (location.hash !== next) location.hash = view;
    }
  }

  function refreshErrors() {
    if (!state.showErrors) return;
    var result = TripLogic.validateTrip(state);
    state.errors = result.errors;
    if (result.ok || result.needsAllocationConfirm) state.showErrors = result.errors.formCode === "sum";
  }

  function updateFromInput(element) {
    var field = element.dataset.field;
    if (!field) return;
    if (field === "tripName") state.tripName = element.value;
    else if (field === "totalDays") state.totalDays = element.value;
    else {
      var destination = state.destinations.find(function (item) { return item.id === element.dataset.id; });
      if (!destination) return;
      if (field === "destName") destination.name = element.value;
      if (field === "destDays") destination.days = element.value;
    }
    refreshErrors();
  }

  function submitTrip() {
    if (state.mode === "searching") return;
    var result = TripLogic.validateTrip(state);
    if (result.needsAllocationConfirm) {
      result.proposedDays.forEach(function (days, index) {
        state.destinations[index].days = String(days);
      });
      state.mode = "review-allocation";
      state.showErrors = false;
      state.errors = emptyErrors(state.destinations.length);
      render();
      return;
    }
    if (!result.ok) {
      state.errors = result.errors;
      state.showErrors = true;
      render();
      var alert = document.querySelector("[role=alert]");
      if (alert) alert.focus();
      else {
        var invalid = document.querySelector("[aria-invalid='true']");
        if (invalid) invalid.focus();
      }
      return;
    }
    startSearch(result.normalized);
  }

  async function startSearch(normalized) {
    var token = ++runToken;
    state.mode = "searching";
    state.view = "input";
    state.showErrors = false;
    state.searchSteps = normalized.destinations.flatMap(function (destination) {
      if (destination.days < 1) {
        return [{ destination: destination.name, kind: "景點", status: "skipped" }];
      }
      return [
        { destination: destination.name, kind: "景點", status: "wait" },
        { destination: destination.name, kind: "美食", status: "wait" }
      ];
    });
    render();
    for (var index = 0; index < state.searchSteps.length; index += 1) {
      if (runToken !== token) return;
      var step = state.searchSteps[index];
      if (step.status === "skipped") continue;
      step.status = "running";
      render();
      await delay(320);
      if (runToken !== token) return;
      step.status = "done";
      render();
    }
    var retrievedAt = TripLogic.todayString();
    state.groups = TripPreview.buildGroups(normalized.destinations, retrievedAt);
    state.retrievedAt = retrievedAt;
    state.selectedIds = [];
    state.usingPreview = true;
    state.tripName = normalized.tripName;
    state.totalDays = String(normalized.totalDays);
    state.destinations = normalized.destinations.map(function (destination, index) {
      return {
        id: state.destinations[index] ? state.destinations[index].id : uid(),
        name: destination.name,
        days: String(destination.days)
      };
    });
    state.mode = "edit";
    state.activeTab = "景點";
    state.view = "list";
    alignPlanWithDestinations(true);
    applyTransportSuggestions();
    setHash("list", false);
    render();
  }

  async function retryGroup(index, kind) {
    if (state.retrying) return;
    var group = state.groups[index];
    if (!group) return;
    state.retrying = { index: index, kind: kind };
    render();
    await delay(450);
    var type = kind === "food" ? "美食" : "景點";
    var slot = TripPreview.buildSlot(group.destination, group.days, index, type, state.retrievedAt || TripLogic.todayString());
    var oldIds = new Set(group[kind].items.map(function (item) { return item.id; }));
    state.selectedIds = state.selectedIds.filter(function (id) { return !oldIds.has(id); });
    group[kind] = slot;
    state.retrying = null;
    render();
  }

  function moveDestination(id, direction) {
    var index = state.destinations.findIndex(function (destination) { return destination.id === id; });
    var target = index + direction;
    if (index < 0 || target < 0 || target >= state.destinations.length) return;
    var row = state.destinations.splice(index, 1)[0];
    state.destinations.splice(target, 0, row);
    pendingFocus = { key: (direction < 0 ? "up-" : "down-") + id };
    render();
  }

  function onClick(event) {
    var button = event.target.closest("[data-action]");
    if (!button || button.dataset.action === "toggle") return;
    var action = button.dataset.action;
    if (action === "goto") go(button.dataset.view);
    else if (action === "add") {
      var created = blankDestination();
      state.destinations.push(created);
      state.errors = emptyErrors(state.destinations.length);
      pendingFocus = { key: "name-" + created.id };
      render();
    } else if (action === "remove") {
      if (state.destinations.length === 1) {
        state.destinations[0].name = "";
        state.destinations[0].days = "";
      } else {
        state.destinations = state.destinations.filter(function (destination) {
          return destination.id !== button.dataset.id;
        });
      }
      state.errors = emptyErrors(state.destinations.length);
      refreshErrors();
      render();
    } else if (action === "up") moveDestination(button.dataset.id, -1);
    else if (action === "down") moveDestination(button.dataset.id, 1);
    else if (action === "example") {
      state.tripName = "台東知本";
      state.totalDays = "2";
      state.destinations = [{ id: uid(), name: "台東知本", days: "2" }];
      state.mode = "edit";
      state.showErrors = false;
      state.errors = emptyErrors(1);
      state.view = "input";
      state.groups = null;
      state.selectedIds = [];
      state.days = [];
      state.transports = [];
      state.accommodations = [];
      render();
    } else if (action === "clear-days") {
      state.destinations.forEach(function (destination) { destination.days = ""; });
      state.mode = "edit";
      state.showErrors = false;
      state.errors = emptyErrors(state.destinations.length);
      render();
    } else if (action === "tab") {
      state.activeTab = button.dataset.tab;
      pendingFocus = { key: button.dataset.tab === "美食" ? "tab-food" : "tab-spot" };
      render();
    } else if (action === "retry") {
      retryGroup(Number(button.dataset.index), button.dataset.kind);
    } else if (action === "open-extra") {
      var firstGroup = (state.groups || [])[0];
      state.draft = {
        kind: "extra",
        itemType: state.activeTab === "美食" ? "美食" : "景點",
        name: "",
        destination: firstGroup ? firstGroup.destination : "",
        hours: "",
        reservation: "來源未記載",
        note: "",
        place: "",
        error: ""
      };
      render();
    } else if (action === "delete-extra") {
      deleteExtra(button.dataset.id);
      render();
    } else if (action === "suggest-transport") {
      state.draft = null;
      applyTransportSuggestions();
      render();
    } else if (action === "open-transport") {
      alignPlanWithDestinations(false);
      state.transportMessage = "";
      state.draft = blankTransportDraft();
      render();
    } else if (action === "open-stay") {
      alignPlanWithDestinations(false);
      state.draft = blankStayDraft();
      render();
    } else if (action === "use-stay") {
      var choice = stayChoices()[Number(button.dataset.index)];
      if (!choice) return;
      var stayDraft = blankStayDraft();
      stayDraft.place = choice.place;
      if (choice.checkIn) stayDraft.checkIn = choice.checkIn;
      if (choice.checkOut) stayDraft.checkOut = choice.checkOut;
      state.draft = stayDraft;
      render();
    } else if (action === "cancel-draft") {
      state.draft = null;
      render();
    } else if (action === "edit-transport") {
      var ride = (state.transports || []).find(function (item) { return item.id === button.dataset.id; });
      if (!ride) return;
      state.draft = transportDraftFrom(ride);
      render();
    } else if (action === "edit-stay") {
      var stay = (state.accommodations || []).find(function (item) { return item.id === button.dataset.id; });
      if (!stay) return;
      state.draft = stayDraftFrom(stay);
      render();
    } else if (action === "delete-transport") {
      TripModel.deleteTransport(button.dataset.id);
      if (state.draft && state.draft.id === button.dataset.id) state.draft = null;
      render();
    } else if (action === "delete-stay") {
      TripModel.deleteAccommodation(button.dataset.id);
      if (state.draft && state.draft.id === button.dataset.id) state.draft = null;
      render();
    }
  }

  function onInput(event) {
    if (!event.target.dataset || !event.target.dataset.field) return;
    updateFromInput(event.target);
    if (composing) return;
    render();
  }

  function onChange(event) {
    if (event.target.dataset && event.target.dataset.budget) {
      if (event.target.dataset.budget === "travelers") {
        var count = Number(event.target.value);
        state.travelers = Number.isInteger(count) && count >= 1 ? count : 1;
      } else if (event.target.dataset.budget === "baseCurrency") {
        var code = String(event.target.value || "").trim();
        state.baseCurrency = code || "TWD";
      }
      render();
      return;
    }
    if (!event.target.dataset || event.target.dataset.action !== "toggle") return;
    var id = event.target.dataset.id;
    if (event.target.checked) {
      if (state.selectedIds.indexOf(id) === -1) state.selectedIds.push(id);
    } else {
      state.selectedIds = state.selectedIds.filter(function (item) { return item !== id; });
    }
    render();
  }

  function viewFromHash(hash, fallback) {
    var view = (hash || "").replace("#", "");
    if (["input", "list", "confirm", "transport", "stay", "budget", "map"].indexOf(view) === -1) return fallback;
    if ((view === "list" || view === "confirm") && !state.groups) return "input";
    return view;
  }

  function applyHash() {
    if (!state || state.mode === "searching") return;
    var view = viewFromHash(location.hash || "#input", "input");
    if (state.view === view) return;
    state.view = view;
    render();
  }

  var params = new URLSearchParams(location.search);
  var demo = params.get("demo");
  if (demo === "example") state = exampleState();
  else if (demo === "exceptions") state = exceptionState();
  else state = load() || initialState();
  if (!demo) alignPlanWithDestinations(false);

  if (demo) {
    state.view = viewFromHash(location.hash, state.view);
    setHash(state.view, true);
  } else if (location.hash) {
    state.view = viewFromHash(location.hash, state.view);
  }

  app.addEventListener("click", onClick);
  app.addEventListener("input", onInput);
  app.addEventListener("change", onChange);
  app.addEventListener("compositionstart", function () { composing = true; });
  app.addEventListener("compositionend", function (event) {
    composing = false;
    if (!event.target.dataset || !event.target.dataset.field) return;
    updateFromInput(event.target);
    render();
  });
  app.addEventListener("submit", function (event) {
    if (event.target.id === "extra-form") {
      event.preventDefault();
      saveExtra(event.target);
      return;
    }
    if (event.target.id === "plan-form") {
      event.preventDefault();
      submitPlan(event.target);
      return;
    }
    if (event.target.id !== "trip-form") return;
    event.preventDefault();
    submitTrip();
  });
  app.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && event.target.tagName === "INPUT") event.preventDefault();
    if ((event.key === "ArrowRight" || event.key === "ArrowLeft") && event.target.dataset.action === "tab") {
      state.activeTab = state.activeTab === "景點" ? "美食" : "景點";
      pendingFocus = { key: state.activeTab === "美食" ? "tab-food" : "tab-spot" };
      render();
    }
  });
  window.addEventListener("popstate", applyHash);

  TripModel.attach(state, function () {
    if (state.mode !== "searching") save();
  });

  render();
})();
