(function (root: typeof globalThis) {
  "use strict";

  const INTERESTS = ["美食", "文化", "購物", "自然", "親子", "夜生活", "藝術"];
  const CITIES = ["金澤", "高山", "日光", "奈良", "京都", "台東"];
  const PACES: Pace[] = ["relaxed", "moderate", "packed"];

  function interestOptions(): string[] {
    return INTERESTS.slice();
  }

  function nextInterests(current: string[], interest: string): string[] {
    if (INTERESTS.indexOf(interest) === -1) return current.slice();
    const picked = current.indexOf(interest) === -1;
    return INTERESTS.filter(function (item) {
      if (item === interest) return picked;
      return current.indexOf(item) !== -1;
    });
  }

  function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, function (char) {
      if (char === "&") return "&amp;";
      if (char === "<") return "&lt;";
      if (char === ">") return "&gt;";
      if (char === '"') return "&quot;";
      return "&#39;";
    });
  }

  function formatUpdated(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    return String(date.getFullYear()) + "/" + month + "/" + day + " " + hour + ":" + minute;
  }

  function tripMeta(trip: TripListItem): string {
    const when = formatUpdated(trip.updatedAt);
    const edited = when === "" ? "" : " · 最後修改 " + when;
    if (trip.startDate === "" || trip.days < 1) return "尚未設定日期" + edited;
    return PlannerFormat.formatDateRange(trip.startDate, trip.endDate) + " · " + String(trip.days) + " 天" + edited;
  }

  function renderTripActions(trip: TripListItem, state: PlannerState): string {
    const id = escapeHtml(trip.id);
    if (state.pendingDeleteId === trip.id) {
      return '<p>確定刪除「' + escapeHtml(trip.name) + '」？刪除後無法還原。</p>' +
        '<div class="actions">' +
        '<button type="button" class="btn ghost small" data-action="cancel-delete">取消</button>' +
        '<button type="button" class="btn primary small" data-action="confirm-delete">確定刪除</button>' +
        "</div>";
    }
    if (state.renameId === trip.id) {
      return '<label class="field" for="rename-trip"><span>行程名稱</span>' +
        '<input id="rename-trip" data-field="rename-trip" type="text" maxlength="80" value="' +
        escapeHtml(state.renameDraft) + '"></label>' +
        '<div class="actions">' +
        '<button type="button" class="btn ghost small" data-action="cancel-rename">取消</button>' +
        '<button type="button" class="btn primary small" data-action="confirm-rename">儲存名稱</button>' +
        "</div>";
    }
    const open = trip.id === state.activeTripId
      ? ""
      : '<button type="button" class="btn ghost small" data-action="open-trip" data-id="' + id + '">開啟</button>';
    return '<div class="actions">' + open +
      '<button type="button" class="btn ghost small" data-action="rename-trip" data-id="' + id + '">重新命名</button>' +
      '<button type="button" class="btn ghost small" data-action="copy-trip" data-id="' + id + '">複製</button>' +
      '<button type="button" class="btn ghost small" data-action="export-trip" data-id="' + id + '">匯出</button>' +
      '<button type="button" class="btn ghost small" data-action="ask-delete-trip" data-id="' + id + '">刪除</button>' +
      "</div>";
  }

  function renderLibrary(state: PlannerState): string {
    if (!state.libraryOpen) return "";
    const rows = state.tripList.map(function (trip) {
      const current = trip.id === state.activeTripId;
      const badge = current ? '<span class="badge">目前</span>' : "";
      return '<article class="plan-banner">' +
        "<p><strong>" + escapeHtml(trip.name) + "</strong> " + badge + "</p>" +
        '<p class="hint">' + escapeHtml(tripMeta(trip)) + "</p>" +
        renderTripActions(trip, state) +
        "</article>";
    }).join("");
    const empty = rows === "" ? '<p class="empty">還沒有行程。</p>' : "";
    return '<section class="card" aria-label="我的行程">' +
      "<h2>我的行程</h2>" +
      '<div class="actions">' +
      '<button type="button" class="btn ghost small" data-action="save-trip-as">另存目前行程</button>' +
      '<button type="button" class="btn ghost small" data-action="new-trip">新增行程</button>' +
      '<button type="button" class="btn ghost small" data-action="import-trip">匯入</button>' +
      "</div>" +
      '<input id="trip-import" type="file" accept="application/json,.json" hidden>' +
      renderAlert("trip-error", state.tripError) +
      empty +
      rows +
      "</section>";
  }

  function renderBrand(state: PlannerState): string {
    return '<div class="summary-title">' +
      '<p class="brand">AI 旅遊行程小助手</p>' +
      '<button type="button" class="btn ghost small" data-action="toggle-library" aria-expanded="' +
      (state.libraryOpen ? "true" : "false") + '">我的行程</button></div>' +
      renderLibrary(state);
  }

  function renderProgress(current: 1 | 2): string {
    const labels = ["目的地", "偏好", "行程"];
    const items = labels.map(function (label, index) {
      const number = index + 1;
      let className = "";
      let currentAttr = "";
      if (number < current) className = "is-done";
      if (number === current) {
        className = "is-current";
        currentAttr = ' aria-current="step"';
      }
      const classAttr = className === "" ? "" : ' class="' + className + '"';
      return "<li" + classAttr + currentAttr + '><span class="num">' + String(number) + "</span>" + label + "</li>";
    }).join("");
    return '<ol class="progress" aria-label="規劃步驟">' + items + "</ol>";
  }

  function renderAlert(id: string, error: string): string {
    if (error === "") return "";
    return '<p id="' + id + '" class="error" role="alert" tabindex="-1">' + escapeHtml(error) + "</p>";
  }

  function renderError(error: string): string {
    return renderAlert("form-error", error);
  }

  function renderDestination(state: PlannerState): string {
    const name = state.draft.destination.trim();
    const chips = CITIES.map(function (city) {
      const on = name === city;
      return '<button type="button" class="chip' + (on ? " is-on" : "") + '" data-action="pick-city" data-city="' +
        escapeHtml(city) + '" aria-pressed="' + (on ? "true" : "false") + '">' + escapeHtml(city) + "</button>";
    }).join("");
    return '<section class="card destination-hero">' +
      '<div class="destination-copy">' +
      '<h1><label for="destination">你想去哪裡？</label></h1>' +
      '<p class="hero-lead">告訴我們下一站，讓 AI 為你安排一趟剛剛好的旅程。</p>' +
      '<input id="destination" class="destination-input" data-field="destination" type="text" maxlength="40" enterkeyhint="next" autocomplete="off" placeholder="例如：金澤、高山、台東" value="' + escapeHtml(state.draft.destination) + '">' +
      '<p class="group-label" id="city-label">熱門城市</p>' +
      '<div class="chips" role="group" aria-labelledby="city-label">' + chips + "</div>" +
      renderError(state.error) +
      '<div class="actions"><button type="button" class="btn primary" data-action="next">下一步</button></div>' +
      '</div>' +
      '<figure class="hero-visual"><img src="images/travel-planner-hero-v2.svg?v=20261112d" alt="山景、寺院、列車與旅行路線的插畫" width="720" height="540"></figure>' +
      "</section>";
  }

  function renderCurrencyOptions(current: string): string {
    return PlannerFormat.currencyChoices().map(function (choice) {
      const selected = choice.code === current ? " selected" : "";
      return '<option value="' + escapeHtml(choice.code) + '"' + selected + ">" + escapeHtml(choice.label) + "</option>";
    }).join("");
  }

  function renderPasscode(): string {
    if (PlannerRemote.onLocalHost()) return "";
    const saved = PlannerRemote.passcode();
    const hint = saved !== ""
      ? "已存在這台瀏覽器。清除後要重新輸入。"
      : "只存在這台瀏覽器，不會上傳到 GitHub。按儲存後，產生行程才會送出。";
    return '<label class="field" for="passcode"><span>通行碼</span>' +
      '<input id="passcode" data-field="passcode" type="password" autocomplete="off" value="' +
      escapeHtml(saved) + '"></label>' +
      '<p class="hint">' + escapeHtml(hint) + "</p>" +
      '<div class="actions">' +
        '<button type="button" class="btn ghost" data-action="save-passcode">儲存通行碼</button>' +
        '<button type="button" class="btn ghost" data-action="clear-passcode">清除通行碼</button>' +
      "</div>";
  }

  function renderPreferences(state: PlannerState): string {
    const days = PlannerFormat.inclusiveDays(state.draft.startDate, state.draft.endDate);
    const interests = INTERESTS.map(function (interest, index) {
      const on = state.draft.interests.indexOf(interest) !== -1;
      return '<button type="button" id="interest-' + String(index) + '" class="chip' + (on ? " is-on" : "") +
        '" data-action="toggle-interest" data-interest="' + escapeHtml(interest) + '" aria-pressed="' +
        (on ? "true" : "false") + '">' + escapeHtml(interest) + "</button>";
    }).join("");
    const paces = PACES.map(function (pace) {
      const on = state.draft.pace === pace;
      return '<button type="button" id="pace-' + pace + '" class="' + (on ? "is-on" : "") +
        '" role="radio" aria-checked="' + (on ? "true" : "false") + '" data-action="set-pace" data-pace="' +
        pace + '">' + escapeHtml(PlannerFormat.formatPace(pace)) + "</button>";
    }).join("");
    return '<section class="card preferences-card">' +
      "<h1>設定偏好</h1>" +
      '<p class="lead">目的地：' + escapeHtml(state.draft.destination.trim()) + "</p>" +
      '<div class="date-row">' +
        '<label class="field" for="start-date"><span>出發日期</span>' +
        '<input id="start-date" data-field="start-date" type="date" value="' + escapeHtml(state.draft.startDate) + '"></label>' +
        '<label class="field" for="end-date"><span>結束日期</span>' +
        '<input id="end-date" data-field="end-date" type="date" min="' + escapeHtml(state.draft.startDate) + '" value="' + escapeHtml(state.draft.endDate) + '"></label>' +
      "</div>" +
      '<p class="day-count' + (days <= 0 ? " is-bad" : "") + '" data-day-count>' +
        escapeHtml(PlannerFormat.formatStayLength(state.draft.startDate, state.draft.endDate)) + "</p>" +
      '<label class="field field-narrow" for="travelers"><span>人數</span>' +
        '<input id="travelers" data-field="travelers" type="number" min="1" max="20" step="1" inputmode="numeric" value="' +
        escapeHtml(state.draft.travelers) + '"></label>' +
      '<div class="budget-row">' +
        '<label class="field" for="budget-amount"><span>預算</span>' +
        '<input id="budget-amount" data-field="budget-amount" type="number" min="0" step="1" inputmode="numeric" value="' +
        escapeHtml(state.draft.budgetAmount) + '"></label>' +
        '<label class="field" for="budget-currency"><span>幣別</span>' +
        '<select id="budget-currency" data-field="budget-currency">' + renderCurrencyOptions(state.draft.budgetCurrency) + "</select></label>" +
      "</div>" +
      '<p class="group-label" id="interest-label">興趣（可複選）</p>' +
      '<div class="chips" role="group" aria-labelledby="interest-label">' + interests + "</div>" +
      '<p class="group-label" id="pace-label">旅遊步調</p>' +
      '<div class="pace" role="radiogroup" aria-labelledby="pace-label">' + paces + "</div>" +
      '<p class="hint">' + escapeHtml(PlannerFormat.paceHint(state.draft.pace)) + "</p>" +
      '<label class="field" for="note"><span>還有什麼想告訴 AI 的？</span>' +
        '<textarea id="note" data-field="note" maxlength="300" placeholder="例如：想避開爬山、中午要吃拉麵、帶著長輩">' +
        escapeHtml(state.draft.note) + "</textarea></label>" +
      renderPasscode() +
      renderError(state.error) +
      '<p class="hint" data-quota-hint' + (quotaSentence(days) === "" ? " hidden" : "") + ">" +
        escapeHtml(quotaSentence(days)) + "</p>" +
      '<div class="actions">' +
        '<button type="button" class="btn ghost" data-action="back">上一步</button>' +
        '<button type="button" class="btn ghost" data-action="use-mock">改用示範資料</button>' +
        '<button type="button" class="btn primary" data-action="generate">產生行程</button>' +
      "</div></section>";
  }

  function daySpan(offset: number, total: number): string {
    const from = offset + 1;
    const to = Math.min(total, offset + 2);
    if (from >= to) return "第 " + String(from) + " 天";
    return "第 " + String(from) + "–" + String(to) + " 天";
  }

  function quotaSentence(days: number): string {
    if (days < 1) return "";
    return "這次大約會用掉 " + String(Math.ceil(days / 2)) + " 次 Gemini 額度（每 2 天 1 次）。";
  }

  function remainingSentence(days: number): string {
    if (days < 1) return "";
    return "剩下大約 " + String(Math.ceil(days / 2)) + " 次。";
  }

  function renderGenerating(state: PlannerState): string {
    const progress = state.progress;
    let hint = "請稍候，通常需要十幾秒。";
    if (progress) {
      const calls = Math.ceil(progress.totalDays / 2);
      hint = "正在產生" + daySpan(progress.nextOffset, progress.totalDays) + "（共 " + String(calls) + " 次）。";
    }
    return '<div class="loading" role="status" aria-live="polite">' +
      '<div class="spinner" aria-hidden="true"></div>' +
      "<p>AI 正在為你規劃行程…</p>" +
      '<p class="hint">' + escapeHtml(hint) + "</p>" +
      "</div>";
  }

  function renderPlanError(state: PlannerState): string {
    const progress = state.progress;
    const detail = state.error !== "" ? state.error : "這一段還沒完成。";
    let resumeHint = "";
    let resumeButton = "";
    let mockClass = "btn primary";
    if (progress && !progress.running) {
      const left = progress.totalDays - progress.nextOffset;
      mockClass = "btn ghost";
      resumeHint = '<p class="hint">' + escapeHtml(remainingSentence(left)) + "</p>";
      resumeButton = '<button type="button" class="btn primary" id="plan-continue" data-action="continue-plan">從失敗的那天繼續產生</button>';
    }
    return '<div class="loading plan-error" role="alert">' +
      '<p id="plan-error" tabindex="-1">這次沒有產生出行程</p>' +
      '<p class="hint">' + escapeHtml(detail) + "</p>" +
      resumeHint +
      '<div class="actions">' +
      resumeButton +
      '<button type="button" class="btn ghost" data-action="edit-preferences">返回修改</button>' +
      '<button type="button" class="' + mockClass + '" data-action="use-mock">改用示範資料</button>' +
      "</div></div>";
  }

  function renderChunkStatus(state: PlannerState): string {
    const progress = state.progress;
    if (!progress) return "";
    const done = state.plan ? state.plan.days.length : 0;
    if (progress.running) {
      return '<div class="plan-banner" role="status" aria-live="polite">' +
        "<p>已完成 " + String(done) + " / " + String(progress.totalDays) +
        " 天，正在產生" + daySpan(progress.nextOffset, progress.totalDays) + "…</p></div>";
    }
    const message = progress.error !== "" ? progress.error : "產生中斷了，已保留完成的天數。";
    const left = progress.totalDays - progress.nextOffset;
    return '<div class="plan-banner" role="alert">' +
      '<p id="plan-error" tabindex="-1">' + escapeHtml(message) + "</p>" +
      '<p class="hint">' + escapeHtml(remainingSentence(left)) + "</p>" +
      '<div class="actions"><button type="button" class="btn primary" id="plan-continue" data-action="continue-plan">從失敗的那天繼續產生</button></div>' +
      "</div>";
  }

  function renderLegForm(state: PlannerState): string {
    const draft = state.legDraft;
    if (!draft) return "";
    const modes: TransportMode[] = ["walk", "train", "bus", "car", "taxi"];
    const options = modes.map(function (mode) {
      const selected = draft.mode === mode ? " selected" : "";
      return '<option value="' + mode + '"' + selected + ">" + escapeHtml(PlannerFormat.transportModeLabel(mode)) + "</option>";
    }).join("");
    return '<div class="add-panel">' +
      renderAlert("leg-error", state.legError) +
      '<label class="field" for="leg-mode"><span>交通方式</span>' +
      '<select id="leg-mode" data-field="leg-mode">' + options + "</select></label>" +
      '<label class="field field-narrow" for="leg-minutes"><span>分鐘數</span>' +
      '<input id="leg-minutes" data-field="leg-minutes" type="number" min="1" max="1440" step="1" inputmode="numeric" value="' +
      escapeHtml(draft.minutes) + '"></label>' +
      '<div class="budget-row">' +
        '<label class="field" for="leg-price"><span>費用（可留空）</span>' +
        '<input id="leg-price" data-field="leg-price" type="number" min="0" step="1" inputmode="numeric" value="' +
        escapeHtml(draft.price) + '"></label>' +
        '<label class="field" for="leg-currency"><span>幣別</span>' +
        '<select id="leg-currency" data-field="leg-currency">' + renderCurrencyOptions(draft.currency) + "</select></label>" +
      "</div>" +
      '<div class="actions">' +
        '<button type="button" class="btn ghost" data-action="recalc-leg">重新計算</button>' +
        '<button type="button" class="btn ghost" data-action="cancel-leg">取消</button>' +
        '<button type="button" class="btn primary" data-action="confirm-leg">儲存交通</button>' +
      "</div></div>";
  }

  function renderLeg(leg: TransportLeg, index: number, state: PlannerState, itemId: string): string {
    let visible = PlannerFormat.transportIcon(leg.mode) + " " + String(leg.minutes) + " 分鐘";
    if (typeof leg.distanceMeters === "number") {
      const distance = PlannerFormat.formatDistance(leg.distanceMeters);
      if (distance !== "") visible += "・" + distance;
    }
    if (leg.cost) visible += " · " + PlannerFormat.formatMoney(leg.cost);
    let source = "";
    let sourceNote = "";
    if (leg.routeSource === "route") {
      source = '<span class="est">路線</span>';
      sourceNote = "，路線";
    } else if (leg.routeSource === "estimate" || leg.distanceEstimate) {
      source = '<span class="est">估算</span>';
      sourceNote = "，估算";
    }
    const suggestWalk = leg.mode === "walk" && typeof leg.distanceMeters === "number" && leg.distanceMeters > 1500;
    const suggest = suggestWalk ? "，建議改搭電車" : "";
    const suggestMark = suggestWalk ? '<span class="leg-suggest">建議改搭電車</span>' : "";
    const label = visible + sourceNote + suggest;
    const editor = state.legDraft && state.legDraft.itemId === itemId ? renderLegForm(state) : "";
    return '<p class="leg"><button type="button" class="leg-pill" data-action="edit-leg" data-index="' + String(index) +
      '" aria-label="編輯交通：' + escapeHtml(label) + '">' + visible + "</button>" + source + suggestMark + "</p>" + editor;
  }

  function dinnerWaitParts(item: ItineraryItem, arrivalMinutes: number): { stay: number; free: number } {
    const stay = Number.isFinite(item.durationMinutes) && item.durationMinutes > 0 ? item.durationMinutes : 0;
    const gap = typeof item.breakMinutes === "number" && item.breakMinutes > 0 ? Math.round(item.breakMinutes) : 0;
    if (item.type === "restaurant" || !Number.isFinite(arrivalMinutes)) return { stay: stay, free: gap };
    const cap = PlannerSchedule.dinnerStayCap(item, arrivalMinutes);
    if (stay > cap) return { stay: cap, free: stay - cap + gap };
    return { stay: stay, free: gap };
  }

  function renderFreeTime(startMinutes: number, minutes: number): string {
    const when = PlannerFormat.formatMinuteClock(startMinutes);
    const length = PlannerFormat.formatDuration(minutes);
    return '<p class="free-time"><strong>自由時間／回飯店休息</strong><span>' +
      escapeHtml(when) + " · " + escapeHtml(length) + "</span></p>";
  }

  function renderStop(
    item: ItineraryItem,
    index: number,
    travelers: number,
    state: PlannerState,
    arrival: string,
    arrivalMinutes: number,
    pool?: "day" | "held"
  ): string {
    const meta = PlannerFormat.placeMeta(item.type);
    const share = PlannerFormat.splitPerPerson(item.cost, travelers);
    const held = pool === "held";
    const leg = !held && item.transportToNext ? renderLeg(item.transportToNext, index, state, item.id) : "";
    const unmapped = PlannerFormat.isMappableLocation(item.location)
      ? ""
      : '<p class="unmap">無法顯示在地圖上</p>';
    const arrive = arrival === "" ? "" : '<span class="arrive">' + escapeHtml(arrival) + " 抵達</span>";
    const offMeal = item.type === "restaurant" && arrival !== "" && PlannerFormat.mealSlot(arrivalMinutes) === "";
    const mealFlag = offMeal ? '<span class="meal-flag">不在用餐時段</span>' : "";
    const hoursFlag = item.hoursClosed ? '<span class="meal-flag">營業時間可能已過</span>' : "";
    const parts = arrival === "" ? { stay: item.durationMinutes, free: 0 } : dinnerWaitParts(item, arrivalMinutes);
    const free = parts.free > 0
      ? renderFreeTime(arrivalMinutes + parts.stay, parts.free)
      : "";
    return '<li class="stop" data-stop-id="' + escapeHtml(item.id) + '"><div class="stop-shell">' +
      '<button type="button" class="drag-handle" aria-label="拖曳調整「' + escapeHtml(item.name) +
      '」的順序"><span aria-hidden="true">⋮⋮</span></button>' +
      '<article class="stop-card" id="stop-' + escapeHtml(item.id) +
      '" data-stop-id="' + escapeHtml(item.id) + '" data-action="focus-stop" role="button" tabindex="0" aria-label="在地圖上顯示 ' +
      escapeHtml(item.name) + '">' +
      '<div class="stop-top"><span class="type-icon" aria-hidden="true">' + meta.icon + "</span>" +
      "<div><p class=\"type-label\">" + escapeHtml(meta.label) + " · 第 " + String(index + 1) + " 站</p>" +
      "<h3>" + escapeHtml(item.name) + "</h3></div>" +
      '<button type="button" class="text-btn" data-action="' + (held ? "delete-held" : "delete-item") + '" data-index="' + String(index) +
      '" aria-label="刪除 ' + escapeHtml(item.name) + '">刪除</button></div>' +
      '<p class="desc">' + escapeHtml(item.description) + "</p>" +
      '<p class="meta">' + arrive + mealFlag + hoursFlag + "<span>停留 " + escapeHtml(PlannerFormat.formatDuration(parts.stay)) + "</span>" +
      "<span>全團 " + escapeHtml(PlannerFormat.formatMoney(item.cost)) + "</span>" +
      "<span>每人 " + escapeHtml(PlannerFormat.formatMoney(share)) + "</span></p>" +
      unmapped + "</article></div>" +
      free +
      leg + "</li>";
  }

  function renderDaySummary(clock: DayClock, canUndo: boolean, canOptimize: boolean, transportNote: string, regenRunning: boolean, homeMinutes: number, canAdjust: boolean): string {
    const undoDisabled = canUndo ? "" : " disabled";
    const optimizeDisabled = canOptimize ? "" : " disabled";
    const regenDisabled = regenRunning ? " disabled" : "";
    const adjustDisabled = canAdjust && !regenRunning ? "" : " disabled";
    const extra = homeMinutes > 0 ? homeMinutes : 0;
    return '<div class="day-summary">' +
      '<p class="day-time"><span>當天總時間</span><strong>' + escapeHtml(PlannerFormat.formatDuration(clock.totalMinutes + extra)) +
      "</strong><span>預計 " + escapeHtml(PlannerFormat.formatMinuteClock(clock.endMinutes + extra)) + " 結束</span>" + transportNote + "</p>" +
      '<div class="day-actions">' +
      '<button type="button" class="btn ghost small" data-action="adjust-meals"' + adjustDisabled + ">調整用餐時間</button>" +
      '<button type="button" class="btn ghost small" data-action="optimize-day"' + optimizeDisabled + ">最佳化路線</button>" +
      '<button type="button" class="btn ghost small" data-action="regenerate-day"' + regenDisabled + ">重新產生這一天</button>" +
      '<button type="button" class="btn ghost small" data-action="undo-move"' + undoDisabled + ">復原</button></div></div>" +
      '<p class="hint">按住左側把手拖曳，可調整順序。「重新產生這一天」用 1 次額度，並帶入這天的住宿與大交通。</p>';
  }

  function renderAddForm(state: PlannerState, items: ItineraryItem[]): string {
    const types: PlaceType[] = ["attraction", "restaurant", "hotel", "shopping"];
    const typeOptions = types.map(function (type) {
      const selected = state.addType === type ? " selected" : "";
      return '<option value="' + type + '"' + selected + ">" + escapeHtml(PlannerFormat.placeMeta(type).label) + "</option>";
    }).join("");
    let position = "";
    let hint = "這天還沒有地點，會成為第 1 站。";
    if (items.length > 0) {
      const options = items.map(function (item, index) {
        const selected = index === state.addAfter ? " selected" : "";
        return '<option value="' + String(index) + '"' + selected + ">第 " + String(index + 1) + " 站 " +
          escapeHtml(item.name) + " 後面</option>";
      }).join("");
      position = '<label class="field" for="add-after"><span>插入位置</span>' +
        '<select id="add-after" data-field="add-after">' + options + "</select></label>";
      hint = "會插在你選的那一站後面。新接上的交通會先依距離估算，接著改用實際路線。";
    }
    return '<div class="add-panel">' +
      renderError(state.error) +
      '<label class="field" for="add-name"><span>地點名稱</span>' +
      '<input id="add-name" data-field="add-name" type="text" maxlength="40" value="' + escapeHtml(state.addName) + '" placeholder="例如：東京車站"></label>' +
      '<label class="field" for="add-type"><span>類型</span>' +
      '<select id="add-type" data-field="add-type">' + typeOptions + "</select></label>" +
      position +
      '<p class="hint">' + escapeHtml(hint) + "</p>" +
      '<div class="actions">' +
      '<button type="button" class="btn ghost" data-action="cancel-add">取消</button>' +
      '<button type="button" class="btn primary" data-action="confirm-add">加入這天</button>' +
      "</div></div>";
  }

  function demoNote(plan: TripPlan): string {
    const count = plan.days.length;
    let text = "目前是東京示範行程，還不會依照目的地或偏好重新產生。";
    if (count > 3) text += "多出來的天數先留白，可以用新增地點補上。";
    if (count < 3) text += "這趟不到 3 天，只先排出前面的示範行程。";
    return text;
  }

  const CHART_COLORS = ["#0e7c74", "#2f62b5", "#d4652f", "#3d7a4a", "#b8860b", "#6b5b95"];

  function formatRateInput(value: number): string {
    if (!Number.isFinite(value)) return "";
    return String(Math.round(value * 10000) / 10000);
  }

  function percentText(ratio: number): string {
    return String(Math.round(ratio * 1000) / 10) + "%";
  }

  function moneyPair(original: Money, homeAmount: Money): string {
    const homeText = PlannerFormat.formatMoney(homeAmount);
    if (original.currency === homeAmount.currency) return homeText;
    return PlannerFormat.formatMoney(original) + "（" + homeText + "）";
  }

  function sortedStays(plan: TripPlan): Accommodation[] {
    return plan.accommodations.slice().sort(function (a, b) {
      if (a.checkIn < b.checkIn) return -1;
      if (a.checkIn > b.checkIn) return 1;
      return 0;
    });
  }

  function sortedRides(plan: TripPlan): IntercityTransport[] {
    return plan.transports.slice().sort(function (a, b) {
      if (a.departAt < b.departAt) return -1;
      if (a.departAt > b.departAt) return 1;
      return 0;
    });
  }

  function renderStayForm(state: PlannerState, plan: TripPlan): string {
    const draft = state.stayDraft;
    return '<div class="add-panel">' +
      renderAlert("stay-error", state.stayError) +
      '<label class="field" for="stay-name"><span>名稱</span>' +
      '<input id="stay-name" data-field="stay-name" type="text" maxlength="40" value="' + escapeHtml(draft.name) + '" placeholder="例如：淺草豪景飯店"></label>' +
      '<div class="date-row">' +
        '<label class="field" for="stay-check-in"><span>入住日</span>' +
        '<input id="stay-check-in" data-field="stay-check-in" type="date" min="' + escapeHtml(plan.startDate) + '" max="' +
        escapeHtml(plan.endDate) + '" value="' + escapeHtml(draft.checkIn) + '"></label>' +
        '<label class="field" for="stay-check-out"><span>退房日</span>' +
        '<input id="stay-check-out" data-field="stay-check-out" type="date" min="' + escapeHtml(plan.startDate) + '" max="' +
        escapeHtml(plan.endDate) + '" value="' + escapeHtml(draft.checkOut) + '"></label>' +
      "</div>" +
      '<div class="budget-row">' +
        '<label class="field" for="stay-price"><span>每晚價格</span>' +
        '<input id="stay-price" data-field="stay-price" type="number" min="0" step="1" inputmode="numeric" value="' +
        escapeHtml(draft.price) + '"></label>' +
        '<label class="field" for="stay-currency"><span>幣別</span>' +
        '<select id="stay-currency" data-field="stay-currency">' + renderCurrencyOptions(draft.currency) + "</select></label>" +
      "</div>" +
      '<label class="field field-narrow" for="stay-rooms"><span>房間數</span>' +
      '<input id="stay-rooms" data-field="stay-rooms" type="number" min="1" max="20" step="1" inputmode="numeric" value="' +
      escapeHtml(draft.rooms) + '"></label>' +
      '<label class="field" for="stay-paste"><span>貼上 Google 地圖座標（選填）</span>' +
      '<input id="stay-paste" data-field="stay-paste" type="text" value="" placeholder="35.7125, 139.7945 或地圖網址"></label>' +
      '<div class="date-row">' +
        '<label class="field" for="stay-lat"><span>緯度（選填）</span>' +
        '<input id="stay-lat" data-field="stay-lat" type="text" inputmode="decimal" value="' + escapeHtml(draft.lat) + '" placeholder="例如：35.7125"></label>' +
        '<label class="field" for="stay-lng"><span>經度（選填）</span>' +
        '<input id="stay-lng" data-field="stay-lng" type="text" inputmode="decimal" value="' + escapeHtml(draft.lng) + '" placeholder="例如：139.7945"></label>' +
      "</div>" +
      '<p class="hint">貼上 Google 地圖的「緯度, 經度」或網址，會填進上面兩欄。兩欄留空時依名稱查詢；查不到就無法顯示在地圖上。</p>' +
      '<label class="field" for="stay-url"><span>訂房連結（選填）</span>' +
      '<input id="stay-url" data-field="stay-url" type="text" inputmode="url" value="' + escapeHtml(draft.bookingUrl) + '" placeholder="https://"></label>' +
      '<label class="field" for="stay-note"><span>備註（選填）</span>' +
      '<textarea id="stay-note" data-field="stay-note" maxlength="300">' + escapeHtml(draft.note) + "</textarea></label>" +
      '<div class="actions">' +
        '<button type="button" class="btn ghost" data-action="cancel-stay">取消</button>' +
        '<button type="button" class="btn primary" data-action="confirm-stay">儲存住宿</button>' +
      "</div></div>";
  }

  function renderStayCard(stay: Accommodation, plan: TripPlan, rates: ExchangeRates): string {
    const nights = PlannerFormat.nightCount(stay.checkIn, stay.checkOut);
    const original = PlannerBudget.stayOriginal(stay);
    const home = PlannerBudget.stayHome(stay, plan.budget.currency, rates);
    const mapped = PlannerFormat.isMappableLocation(stay.location);
    const unmapped = mapped ? "" : '<p class="unmap">無法顯示在地圖上</p>';
    const coordWarn = PlannerFormat.stayCoordFar(stay) ? '<p class="unmap">座標可能有誤</p>' : "";
    const focus = mapped
      ? ' data-action="focus-stay" data-stop-id="' + escapeHtml(stay.id) + '" role="button" tabindex="0"'
      : "";
    const link = stay.bookingUrl
      ? '<p><a class="stay-link" href="' + escapeHtml(stay.bookingUrl) + '" target="_blank" rel="noopener noreferrer">訂房連結</a></p>'
      : "";
    const note = stay.note ? '<p class="desc">' + escapeHtml(stay.note) + "</p>" : "";
    return '<article class="info-card"' + focus + ">" +
      '<div class="stop-top"><span class="type-icon" aria-hidden="true">🏨</span><div>' +
      "<h3>" + escapeHtml(stay.name) + "</h3>" +
      '<p class="meta"><span>' + escapeHtml(PlannerFormat.formatShortDate(stay.checkIn)) + " 入住</span>" +
      "<span>" + escapeHtml(PlannerFormat.formatShortDate(stay.checkOut)) + " 退房</span>" +
      "<span>" + String(nights) + " 晚</span><span>" + String(stay.rooms) + " 間</span></p>" +
      '<p class="meta"><span>每晚 ' + escapeHtml(PlannerFormat.formatMoney(stay.pricePerNight)) + "</span>" +
      "<span>總價 " + escapeHtml(moneyPair(original, home)) + "</span></p>" +
      unmapped + coordWarn + link + note +
      "</div>" +
      '<div class="card-actions">' +
      '<button type="button" class="text-btn edit" data-action="edit-stay" data-id="' + escapeHtml(stay.id) + '">編輯</button>' +
      '<button type="button" class="text-btn" data-action="delete-stay" data-id="' + escapeHtml(stay.id) +
      '" aria-label="刪除 ' + escapeHtml(stay.name) + '">刪除</button>' +
      "</div></div></article>";
  }

  function renderStaySection(state: PlannerState, plan: TripPlan): string {
    const cards = sortedStays(plan).map(function (stay) {
      return renderStayCard(stay, plan, state.rates);
    }).join("");
    const empty = cards === "" && !state.stayOpen ? '<p class="empty">還沒有住宿。</p>' : "";
    const form = state.stayOpen ? renderStayForm(state, plan) : "";
    const add = state.stayOpen ? "" : '<button type="button" class="add-toggle" data-action="open-stay">新增住宿</button>';
    return '<section class="extra-block" aria-label="住宿">' +
      '<div class="block-head"><h2>住宿</h2></div>' +
      empty + cards + form + add +
      "</section>";
  }

  function renderRideForm(state: PlannerState): string {
    const draft = state.rideDraft;
    const modes: IntercityMode[] = ["flight", "train", "bus", "car", "ferry", "other"];
    const options = modes.map(function (mode) {
      const selected = draft.mode === mode ? " selected" : "";
      return '<option value="' + mode + '"' + selected + ">" +
        escapeHtml(PlannerFormat.intercityIcon(mode) + " " + PlannerFormat.intercityModeLabel(mode)) + "</option>";
    }).join("");
    return '<div class="add-panel">' +
      renderAlert("ride-error", state.rideError) +
      '<label class="field" for="ride-mode"><span>方式</span>' +
      '<select id="ride-mode" data-field="ride-mode">' + options + "</select></label>" +
      '<div class="date-row">' +
        '<label class="field" for="ride-from"><span>出發地</span>' +
        '<input id="ride-from" data-field="ride-from" type="text" maxlength="40" value="' + escapeHtml(draft.from) + '"></label>' +
        '<label class="field" for="ride-to"><span>抵達地</span>' +
        '<input id="ride-to" data-field="ride-to" type="text" maxlength="40" value="' + escapeHtml(draft.to) + '"></label>' +
      "</div>" +
      '<div class="date-row">' +
        '<label class="field" for="ride-depart"><span>出發時間</span>' +
        '<input id="ride-depart" data-field="ride-depart" type="datetime-local" value="' + escapeHtml(draft.departAt) + '"></label>' +
        '<label class="field" for="ride-arrive"><span>抵達時間（選填）</span>' +
        '<input id="ride-arrive" data-field="ride-arrive" type="datetime-local" value="' + escapeHtml(draft.arriveAt) + '"></label>' +
      "</div>" +
      '<div class="budget-row">' +
        '<label class="field" for="ride-price"><span>費用</span>' +
        '<input id="ride-price" data-field="ride-price" type="number" min="0" step="1" inputmode="numeric" value="' +
        escapeHtml(draft.price) + '"></label>' +
        '<label class="field" for="ride-currency"><span>幣別</span>' +
        '<select id="ride-currency" data-field="ride-currency">' + renderCurrencyOptions(draft.currency) + "</select></label>" +
      "</div>" +
      '<label class="field" for="ride-ref"><span>訂位代號（選填）</span>' +
      '<input id="ride-ref" data-field="ride-ref" type="text" maxlength="40" value="' + escapeHtml(draft.bookingRef) + '"></label>' +
      '<label class="field" for="ride-note"><span>備註（選填）</span>' +
      '<textarea id="ride-note" data-field="ride-note" maxlength="300">' + escapeHtml(draft.note) + "</textarea></label>" +
      '<div class="actions">' +
        '<button type="button" class="btn ghost" data-action="cancel-ride">取消</button>' +
        '<button type="button" class="btn primary" data-action="confirm-ride">儲存交通</button>' +
      "</div></div>";
  }

  function renderRideCard(ride: IntercityTransport, home: string, rates: ExchangeRates): string {
    const converted = PlannerBudget.convert(ride.cost, home, rates);
    const depart = PlannerFormat.formatClock(ride.departAt);
    const arrive = ride.arriveAt ? PlannerFormat.formatClock(ride.arriveAt) : "";
    const when = depart + (arrive ? " → " + arrive : "");
    const date = PlannerFormat.formatShortDate(PlannerFormat.datePart(ride.departAt));
    const ref = ride.bookingRef ? "<span>訂位 " + escapeHtml(ride.bookingRef) + "</span>" : "";
    const note = ride.note ? '<p class="desc">' + escapeHtml(ride.note) + "</p>" : "";
    return '<article class="info-card"><div class="stop-top">' +
      '<span class="type-icon" aria-hidden="true">' + PlannerFormat.intercityIcon(ride.mode) + "</span><div>" +
      "<h3>" + escapeHtml(ride.from) + " → " + escapeHtml(ride.to) + "</h3>" +
      '<p class="meta"><span>' + escapeHtml(PlannerFormat.intercityModeLabel(ride.mode)) + "</span>" +
      "<span>" + escapeHtml(date + (when ? " " + when : "")) + "</span>" +
      "<span>" + escapeHtml(moneyPair(ride.cost, converted)) + "</span>" + ref + "</p>" +
      note + "</div>" +
      '<div class="card-actions">' +
      '<button type="button" class="text-btn edit" data-action="edit-ride" data-id="' + escapeHtml(ride.id) + '">編輯</button>' +
      '<button type="button" class="text-btn" data-action="delete-ride" data-id="' + escapeHtml(ride.id) +
      '" aria-label="刪除 ' + escapeHtml(ride.from) + " 到 " + escapeHtml(ride.to) + '">刪除</button>' +
      "</div></div></article>";
  }

  function renderRideSection(state: PlannerState, plan: TripPlan): string {
    const cards = sortedRides(plan).map(function (ride) {
      return renderRideCard(ride, plan.budget.currency, state.rates);
    }).join("");
    const empty = cards === "" && !state.rideOpen ? '<p class="empty">還沒有大交通。</p>' : "";
    const form = state.rideOpen ? renderRideForm(state) : "";
    const add = state.rideOpen ? "" : '<button type="button" class="add-toggle" data-action="open-ride">新增大交通</button>';
    return '<section class="extra-block" aria-label="交通">' +
      '<div class="block-head"><h2>交通</h2></div>' +
      '<p class="hint">這裡是機票、新幹線這類大交通，也會依出發時間排進當天的時間軸。站與站之間的移動，點時間軸上的交通標籤即可修改。</p>' +
      empty + cards + form + add +
      "</section>";
  }

  function renderTimelineRide(ride: IntercityTransport, home: string, rates: ExchangeRates, arrivalOnly: boolean): string {
    const converted = PlannerBudget.convert(ride.cost, home, rates);
    const depart = PlannerFormat.formatClock(ride.departAt);
    const arrive = ride.arriveAt ? PlannerFormat.formatClock(ride.arriveAt) : "";
    const departDate = PlannerFormat.datePart(ride.departAt);
    const arriveDate = ride.arriveAt ? PlannerFormat.datePart(ride.arriveAt) : "";
    const sameDay = arriveDate !== "" && arriveDate === departDate;
    const heading = arrivalOnly
      ? "抵達 " + ride.to
      : ride.from + " → " + ride.to;
    const when = arrivalOnly
      ? (arrive ? arrive + " 抵達" : "抵達")
      : (depart ? depart + " 出發" : "出發");
    const extra = !arrivalOnly && arrive
      ? "<span>" + escapeHtml((sameDay ? "" : "另一天 ") + arrive + " 抵達") + "</span>"
      : "";
    const ref = ride.bookingRef ? "<span>訂位 " + escapeHtml(ride.bookingRef) + "</span>" : "";
    return '<li class="timeline-ride"><article class="ride-inline">' +
      '<span class="type-icon" aria-hidden="true">' + PlannerFormat.intercityIcon(ride.mode) + "</span>" +
      "<div><p class=\"type-label\">大交通 · " + escapeHtml(when) + "</p>" +
      "<h3>" + escapeHtml(heading) + "</h3>" +
      '<p class="meta"><span>' + escapeHtml(PlannerFormat.intercityModeLabel(ride.mode)) + "</span>" +
      extra +
      "<span>" + escapeHtml(moneyPair(ride.cost, converted)) + "</span>" + ref + "</p></div>" +
      '<div class="card-actions">' +
      '<button type="button" class="text-btn edit" data-action="edit-ride" data-id="' + escapeHtml(ride.id) + '">編輯</button>' +
      '<button type="button" class="text-btn" data-action="delete-ride" data-id="' + escapeHtml(ride.id) +
      '" aria-label="刪除 ' + escapeHtml(ride.from) + " 到 " + escapeHtml(ride.to) + '">刪除</button>' +
      "</div></article></li>";
  }

  function departureWarning(opening: DayWindow, clock: DayClock, itemCount: number): string {
    if (itemCount === 0 || opening.endMinutes === null || clock.endMinutes <= opening.endMinutes) return "";
    const span = opening.deadlineKind === "flight" ? "3 小時" : "1 小時";
    const until = PlannerFormat.formatMinuteClock(Math.max(0, opening.endMinutes));
    const detail = opening.deadlineLabel === "" ? until : opening.deadlineLabel;
    return '<div class="flight-warn" role="alert"><p>' +
      escapeHtml("離出發時間不到 " + span + "（" + detail + "，請在 " + until + " 前結束）") +
      "</p></div>";
  }

  function mealWindowOf(slot: "lunch" | "dinner"): MealWindow | null {
    const windows = PlannerFormat.mealWindows();
    for (let index = 0; index < windows.length; index += 1) {
      const meal = windows[index];
      if (meal && meal.slot === slot) return meal;
    }
    return null;
  }

  function nearerMeal(clock: number, lunch: MealWindow, dinner: MealWindow): "lunch" | "dinner" {
    const minute = PlannerFormat.clockMinutes(clock);
    if (minute <= lunch.end) return "lunch";
    if (minute >= dinner.start) return "dinner";
    return minute - lunch.end <= dinner.start - minute ? "lunch" : "dinner";
  }

  function legMinutes(item: ItineraryItem, next: ItineraryItem): number {
    const leg = item.transportToNext;
    if (leg && Number.isFinite(leg.minutes) && leg.minutes > 0) return leg.minutes;
    if (!PlannerFormat.isMappableLocation(item.location) || !PlannerFormat.isMappableLocation(next.location)) return 0;
    const meters = PlannerFormat.straightKm(item.location, next.location) * 1000;
    return PlannerSchedule.travelMinutes("train", meters);
  }

  function longSplitIndex(items: ItineraryItem[]): number {
    const limit = PlannerSchedule.longLegMinutes();
    for (let index = 0; index < items.length - 1; index += 1) {
      const item = items[index];
      const next = items[index + 1];
      if (!item || !next) continue;
      if (legMinutes(item, next) > limit) return index + 1;
    }
    return -1;
  }

  function returnsAcrossLongLeg(items: ItineraryItem[]): boolean {
    const hops: { from: { lat: number; lng: number }; to: { lat: number; lng: number } }[] = [];
    const limit = PlannerSchedule.longLegMinutes();
    for (let index = 0; index < items.length - 1; index += 1) {
      const item = items[index];
      const next = items[index + 1];
      if (!item || !next) continue;
      if (legMinutes(item, next) <= limit) continue;
      if (!PlannerFormat.isMappableLocation(item.location) || !PlannerFormat.isMappableLocation(next.location)) continue;
      hops.push({
        from: { lat: item.location.lat, lng: item.location.lng },
        to: { lat: next.location.lat, lng: next.location.lng }
      });
    }
    for (let left = 0; left < hops.length; left += 1) {
      const earlier = hops[left];
      if (!earlier) continue;
      for (let right = left + 1; right < hops.length; right += 1) {
        const later = hops[right];
        if (!later) continue;
        const back = PlannerFormat.straightKm(later.to, earlier.from);
        const onward = PlannerFormat.straightKm(later.to, earlier.to);
        if (back + 1 < onward) return true;
      }
    }
    return false;
  }

  function renderReturnWarning(items: ItineraryItem[]): string {
    if (!returnsAcrossLongLeg(items)) return "";
    return '<div class="meal-warn" role="status"><p>' +
      escapeHtml("這天有來回長程（超過 40 分鐘）。換飯店日應先排前一間住宿的城市，移動一次，再排今晚的城市。") +
      '</p><button type="button" class="btn ghost small" data-action="adjust-meals">調整用餐時間</button></div>';
  }

  function renderMealGaps(items: ItineraryItem[], clock: DayClock, opening: DayWindow): string {
    const lunchWindow = mealWindowOf("lunch");
    const dinnerWindow = mealWindowOf("dinner");
    if (!lunchWindow || !dinnerWindow) return "";
    let lunch = false;
    let dinner = false;
    let dinnerAfter = false;
    const split = longSplitIndex(items);
    const pending: { arrival: string; at: number; role: "lunch" | "dinner" }[] = [];
    const found: { arrival: string; at: number; index: number }[] = [];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!item || item.type !== "restaurant") continue;
      found.push({ arrival: clock.arrivals[index] || "", at: clock.arrivalMinutes[index] || 0, index: index });
    }
    const byArrival = found.slice().sort(function (left, right) {
      if (left.at !== right.at) return left.at - right.at;
      return left.index - right.index;
    });
    for (let index = 0; index < found.length; index += 1) {
      const row = found[index];
      if (!row) continue;
      const slot = PlannerFormat.mealSlot(row.at);
      let role: "lunch" | "dinner";
      if (found.length === 2) role = row === byArrival[0] ? "lunch" : "dinner";
      else if (found.length === 1) role = nearerMeal(row.at, lunchWindow, dinnerWindow);
      else role = slot === "dinner" ? "dinner" : nearerMeal(row.at, lunchWindow, dinnerWindow);
      if (slot === role) {
        if (role === "lunch") lunch = true;
        else {
          dinner = true;
          if (split >= 0 && row.index >= split) dinnerAfter = true;
        }
      } else pending.push({ arrival: row.arrival, at: row.at, role: role });
    }
    const notes: string[] = [];
    let mentionedLunch = false;
    let mentionedDinner = false;
    for (let index = 0; index < pending.length; index += 1) {
      const row = pending[index];
      if (!row) continue;
      const intended = row.role;
      const window = intended === "lunch" ? lunchWindow : dinnerWindow;
      if (intended === "lunch") mentionedLunch = true;
      else mentionedDinner = true;
      const when = row.arrival === "" ? "" : row.arrival + " ";
      notes.push(
        (intended === "lunch" ? "午餐 " : "晚餐 ") + when + "不在用餐時段（" +
        PlannerFormat.formatMinuteClock(window.start) + "–" + PlannerFormat.formatMinuteClock(window.end) + "）"
      );
    }
    const canLunch = opening.late === "" && opening.startMinutes <= lunchWindow.end &&
      (opening.endMinutes === null || opening.endMinutes >= lunchWindow.start);
    const canDinner = opening.late !== "stay" && opening.startMinutes <= dinnerWindow.end &&
      (opening.endMinutes === null || opening.endMinutes >= dinnerWindow.start);
    const regionalGap = split >= 0 && (
      (canLunch && !lunch && !mentionedLunch) ||
      (canDinner && !dinnerAfter && clock.endMinutes >= dinnerWindow.start)
    );
    if (regionalGap) notes.push("這段時間附近沒有安排餐廳，建議重新產生這一天");
    if (!regionalGap && !lunch && !mentionedLunch && canLunch) notes.push("這天沒有安排午餐");
    if (!regionalGap && !dinner && !mentionedDinner && canDinner && clock.endMinutes >= dinnerWindow.start) {
      notes.push("這天沒有安排晚餐");
    }
    if (notes.length === 0) return "";
    const button = pending.length > 0
      ? '<button type="button" class="btn ghost small" data-action="adjust-meals">調整用餐時間</button>'
      : "";
    return '<div class="meal-warn" role="status">' + notes.map(function (note) {
      return "<p>" + escapeHtml(note) + "</p>";
    }).join("") + button + "</div>";
  }

  function renderRouteProgress(state: PlannerState): string {
    const progress = state.routeProgress;
    if (!progress || progress.total <= 0 || progress.done >= progress.total) return "";
    const done = Math.max(0, Math.min(progress.done, progress.total));
    return '<p id="route-progress" class="route-progress" role="status">正在計算路線 ' +
      String(done) + "／" + String(progress.total) + "…</p>";
  }

  function renderTimeline(items: ItineraryItem[], clock: DayClock, plan: TripPlan, state: PlannerState, opening: DayWindow, departHtml: string): string {
    const pieces: { at: number; order: number; html: string }[] = [];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!item) continue;
      pieces.push({
        at: clock.arrivalMinutes[index] || 0,
        order: 2,
        html: renderStop(item, index, plan.travelers, state, clock.arrivals[index] || "", clock.arrivalMinutes[index] || 0)
      });
    }
    if (opening.note !== "") {
      pieces.push({
        at: opening.startMinutes,
        order: 1,
        html: '<li class="timeline-note"><p class="arrival-start">' + escapeHtml(opening.note) + "</p></li>"
      });
    }
    const rides = sortedRides(plan);
    const date = plan.days[state.activeDay] ? plan.days[state.activeDay].date : "";
    if (date !== "" && !PlannerFormat.dayClosed(opening)) {
      const lodging = PlannerFormat.dayLodging(plan, date);
      const leaving = lodging.start && lodging.end && lodging.start.id !== lodging.end.id;
      if (lodging.start && (leaving || departHtml !== "")) {
        pieces.push({
          at: opening.startMinutes,
          order: 1,
          html: '<li class="timeline-note"><p class="arrival-start">' +
            escapeHtml("起點：" + lodging.start.name + "，" + PlannerFormat.formatMinuteClock(opening.startMinutes) + " 出發") +
            "</p>" + departHtml + "</li>"
        });
      }
    }
    for (let index = 0; index < rides.length; index += 1) {
      const ride = rides[index];
      if (!ride || date === "") continue;
      const departDate = PlannerFormat.datePart(ride.departAt);
      const arriveDate = ride.arriveAt ? PlannerFormat.datePart(ride.arriveAt) : "";
      if (departDate === date) {
        const at = PlannerFormat.minutesOfClock(ride.departAt);
        if (at !== null) {
          pieces.push({
            at: at,
            order: 0,
            html: renderTimelineRide(ride, plan.budget.currency, state.rates, false)
          });
        }
      }
      if (ride.arriveAt && arriveDate === date && arriveDate !== departDate) {
        const at = PlannerFormat.minutesOfClock(ride.arriveAt);
        if (at !== null) {
          pieces.push({
            at: at,
            order: 0,
            html: renderTimelineRide(ride, plan.budget.currency, state.rates, true)
          });
        }
      }
    }
    pieces.sort(function (a, b) {
      if (a.at !== b.at) return a.at - b.at;
      return a.order - b.order;
    });
    if (items.length === 0 && pieces.length === 0) {
      if (PlannerFormat.dayClosed(opening)) return "";
      return '<p class="empty">這天還沒有地點。按下面的按鈕加上第一站。</p>';
    }
    const list = pieces.length === 0
      ? ""
      : '<ol class="timeline">' + pieces.map(function (piece) {
        return piece.html;
      }).join("") + "</ol>";
    const emptyStops = items.length === 0 && !PlannerFormat.dayClosed(opening)
      ? '<p class="empty">這天還沒有地點。按下面的按鈕加上第一站。</p>'
      : "";
    return list + emptyStops;
  }

  function connector(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number }
  ): { minutes: number; html: string } | null {
    const km = PlannerFormat.straightKm(from, to);
    const mode: TransportMode = km <= 1.2 ? "walk" : "train";
    const shape = PlannerRoutes.preview(from, to, mode);
    const minutes = Math.max(0, Math.round(shape.durationMinutes));
    if (minutes <= 0) return null;
    const visible = PlannerFormat.transportModeLabel(mode) + " " +
      PlannerFormat.formatDuration(minutes) + "・" + PlannerFormat.formatDistance(shape.distanceMeters);
    const source = shape.network && mode === "walk" ? "" : '<span class="est">估算</span>';
    return {
      minutes: minutes,
      html: '<p class="leg home-leg"><span class="leg-pill">' + escapeHtml(visible) + "</span>" + source + "</p>"
    };
  }

  function homeLeg(from: ItineraryItem | undefined, stay: Accommodation): { minutes: number; html: string } | null {
    const point = PlannerFormat.stayPoint(stay);
    if (!from || !point || !PlannerFormat.isMappableLocation(from.location)) return null;
    return connector(from.location, point);
  }

  function departLeg(plan: TripPlan, date: string, first: ItineraryItem | undefined): { minutes: number; html: string } | null {
    if (!first || !PlannerFormat.isMappableLocation(first.location)) return null;
    const lodging = PlannerFormat.dayLodging(plan, date);
    if (!lodging.start) return null;
    const point = PlannerFormat.stayPoint(lodging.start);
    if (!point) return null;
    if (!(PlannerFormat.straightKm(point, first.location) >= 0.08)) return null;
    return connector(point, first.location);
  }

  function renderTonight(plan: TripPlan, date: string, arrival: string, legHtml: string): string {
    const stays = sortedStays(plan).filter(function (stay) {
      return PlannerBudget.coversNight(stay, date);
    });
    if (stays.length === 0) {
      return '<div class="tonight"><p>尚未安排住宿</p>' +
        '<button type="button" class="btn ghost small" data-action="open-stay-night" data-date="' + escapeHtml(date) +
        '">新增今晚住宿</button></div>';
    }
    const rows = stays.map(function (stay, index) {
      const mapped = PlannerFormat.isMappableLocation(stay.location);
      const unmapped = mapped ? "" : '<p class="unmap">無法顯示在地圖上</p>';
      const coordWarn = PlannerFormat.stayCoordFar(stay) ? '<p class="unmap">座標可能有誤</p>' : "";
      const action = mapped
        ? ' data-action="focus-stay" data-stop-id="' + escapeHtml(stay.id) + '" role="button" tabindex="0"'
        : "";
      const arrive = index === 0 && arrival !== ""
        ? '<p class="meta"><span class="arrive">' + escapeHtml(arrival) + " 抵達</span></p>"
        : "";
      return '<div class="tonight-stay" id="stay-' + escapeHtml(stay.id) + '"' + action + ">" +
        "<p>終點：" + escapeHtml(stay.name) + "</p>" + arrive + unmapped + coordWarn + "</div>";
    }).join("");
    return '<div class="tonight">' + legHtml + rows + "</div>";
  }

  function renderBudgetStatus(report: BudgetReport): string {
    const compare = "預算 " + PlannerFormat.formatMoney(report.budget) + "／預估 " + PlannerFormat.formatMoney(report.total);
    let detail = "還剩 " + PlannerFormat.formatMoney(report.remaining);
    let className = "budget-status";
    if (report.status === "over") {
      className += " is-over";
      detail = "超支 " + PlannerFormat.formatMoney({ amount: Math.abs(report.remaining.amount), currency: report.home });
    } else if (report.status === "warn") {
      className += " is-warn";
      detail += "（已達預算 90%）";
    }
    return '<p class="' + className + '"><span>' + escapeHtml(compare) + "</span><strong>" + escapeHtml(detail) + "</strong></p>";
  }

  function pieStyle(categories: BudgetCategory[]): string {
    let total = 0;
    for (let index = 0; index < categories.length; index += 1) {
      const item = categories[index];
      if (item) total += item.amount.amount;
    }
    if (total <= 0) return "background:#d5e4e1";
    let cursor = 0;
    const parts: string[] = [];
    for (let index = 0; index < categories.length; index += 1) {
      const item = categories[index];
      if (!item || item.amount.amount <= 0) continue;
      const next = cursor + (item.amount.amount / total) * 100;
      const color = CHART_COLORS[index] || "#0e7c74";
      parts.push(color + " " + cursor.toFixed(2) + "% " + next.toFixed(2) + "%");
      cursor = next;
    }
    return "background:conic-gradient(" + parts.join(",") + ")";
  }

  const ESTIMATE_NOTE = "依路線直線距離粗估，未含機場交通、JR Pass、計程車；實際以當地票價為準";

  function estimateMark(): string {
    return '<details class="estimate-note"><summary title="' + escapeHtml(ESTIMATE_NOTE) + '">（初估）</summary></details>';
  }

  function estimateHelp(item: BudgetCategory): string {
    if (item.key !== "transport" || !item.estimated) return "";
    return '<p class="estimate-help">' + escapeHtml(ESTIMATE_NOTE) + "</p>";
  }

  function categoryLabel(item: BudgetCategory): string {
    if (item.key === "transport" && item.estimated) return escapeHtml(item.label) + estimateMark();
    return escapeHtml(item.label);
  }

  function transportSplit(label: string, money: Money): string {
    if (money.amount === 0) return "";
    return '<p class="budget-split">' + label + " " + escapeHtml(PlannerFormat.formatMoney(money)) + "</p>";
  }

  function transportExtras(item: BudgetCategory): string {
    if (item.key !== "transport" || !item.intercity || !item.city) return "";
    const missing = item.missingSegments && item.missingSegments > 0
      ? '<p class="budget-split">有 ' + String(item.missingSegments) + " 段缺座標未計入</p>"
      : "";
    return transportSplit("跨城交通", item.intercity) +
      transportSplit("市內交通（初估）", item.city) +
      missing;
  }

  function dayTransportNote(plan: TripPlan, date: string, rates: ExchangeRates): string {
    const report = PlannerBudget.report(plan, rates);
    for (let index = 0; index < report.days.length; index += 1) {
      const row = report.days[index];
      if (!row || row.date !== date || !row.transportEstimate) continue;
      return "<span>交通約 " + escapeHtml(PlannerFormat.formatMoney(row.transportEstimate)) + "</span>";
    }
    return "";
  }

  function originalsText(list: Money[], home: string): string {
    const foreign: Money[] = [];
    for (let index = 0; index < list.length; index += 1) {
      const row = list[index];
      if (row && row.currency !== home && row.amount !== 0) foreign.push(row);
    }
    if (foreign.length === 0) return "";
    const text = foreign.map(function (row) {
      return PlannerFormat.formatMoney(row);
    }).join("、");
    return '<p class="hint">原幣 ' + escapeHtml(text) + "</p>";
  }

  function renderRates(state: PlannerState, home: string): string {
    const choices = PlannerFormat.currencyChoices();
    const fields = choices.map(function (choice) {
      if (choice.code === home) return "";
      const value = state.rates[choice.code];
      const shown = typeof value === "number" ? formatRateInput(value) : "";
      return '<label class="rate-field" for="rate-' + escapeHtml(choice.code) + '">1 ' + escapeHtml(choice.code) +
        ' = <input id="rate-' + escapeHtml(choice.code) + '" data-field="rate-' + escapeHtml(choice.code) +
        '" type="number" min="0" step="0.0001" value="' + escapeHtml(shown) + '"> ' + escapeHtml(home) + "</label>";
    }).join("");
    return '<div class="rate-box"><p class="group-label">匯率</p>' +
      '<div class="rate-grid">' + fields + "</div>" +
      '<p class="hint">預設值寫在設定檔。這裡改的數字只影響這份行程，不會連線查詢即時匯率。</p>' +
      renderAlert("rate-error", state.rateError) +
      "</div>";
  }

  function renderBudgetSection(state: PlannerState, report: BudgetReport): string {
    const bars = report.categories.map(function (item, index) {
      const color = CHART_COLORS[index] || "#0e7c74";
      const width = String(Math.max(0, Math.min(100, item.ratio * 100)));
      return '<div class="budget-line"><div class="budget-line-top">' +
        '<span class="swatch" style="background:' + color + '"></span>' +
        "<span>" + categoryLabel(item) + "</span>" +
        "<strong>" + escapeHtml(PlannerFormat.formatMoney(item.amount)) + "</strong>" +
        "<span>" + escapeHtml(percentText(item.ratio)) + "</span></div>" +
        estimateHelp(item) +
        '<div class="bar" aria-hidden="true"><span style="width:' + width + "%;background:" + color + '"></span></div>' +
        transportExtras(item) +
        originalsText(item.originals, report.home) +
        "</div>";
    }).join("");
    const body = report.days.map(function (day) {
      return "<tr><th scope=\"row\">" + escapeHtml(PlannerFormat.formatShortDate(day.date)) + "</th>" +
        "<td>" + escapeHtml(PlannerFormat.formatMoney(day.attraction)) + "</td>" +
        "<td>" + escapeHtml(PlannerFormat.formatMoney(day.food)) + "</td>" +
        "<td>" + escapeHtml(PlannerFormat.formatMoney(day.transport)) + "</td>" +
        "<td>" + escapeHtml(PlannerFormat.formatMoney(day.lodging)) + "</td>" +
        "<td>" + escapeHtml(PlannerFormat.formatMoney(day.shopping)) + "</td>" +
        "<td>" + escapeHtml(PlannerFormat.formatMoney(day.other)) + "</td>" +
        "<td>" + escapeHtml(PlannerFormat.formatMoney(day.total)) + "</td></tr>";
    }).join("");
    return '<section class="extra-block" aria-label="預算">' +
      '<div class="block-head"><h2>預算</h2></div>' +
      renderBudgetStatus(report) +
      '<div class="budget-totals"><span>全團總額</span><strong>' + escapeHtml(PlannerFormat.formatMoney(report.total)) +
      "</strong><span>每人平均</span><strong>" +
      escapeHtml(PlannerFormat.formatMoney(report.perPerson)) + "</strong></div>" +
      '<div class="budget-chart"><div class="pie" style="' + pieStyle(report.categories) + '" aria-hidden="true"></div>' +
      '<div class="bars">' + bars + "</div></div>" +
      renderRates(state, report.home) +
      '<h3 class="group-label">每天花費</h3>' +
      '<p class="hint">以下金額已換算成 ' + escapeHtml(report.home) + "。購物與其他會算進當日小計。</p>" +
      '<div class="table-wrap"><table class="spend-table"><thead><tr>' +
      "<th>日期</th><th>景點</th><th>餐飲</th><th>交通</th><th>住宿</th><th>購物</th><th>其他</th><th>當日小計</th>" +
      "</tr></thead><tbody>" + body + "</tbody>" +
      "<tfoot><tr><th scope=\"row\">合計</th><td colspan=\"6\"></td><td>" +
      escapeHtml(PlannerFormat.formatMoney(report.total)) + "</td></tr></tfoot></table></div>" +
      "</section>";
  }

  function renderMapSwitch(state: PlannerState): string {
    const street = state.mapKind !== "sketch";
    return '<div class="map-switch" role="group" aria-label="地圖種類">' +
      '<button type="button" data-action="set-map-kind" data-map-kind="street" aria-pressed="' +
      (street ? "true" : "false") + '">街道地圖</button>' +
      '<button type="button" data-action="set-map-kind" data-map-kind="sketch" aria-pressed="' +
      (street ? "false" : "true") + '">手繪地圖</button></div>';
  }

  function renderSketchControls(state: PlannerState, plan: TripPlan): string {
    const scope = state.sketchScope;
    const overviewOn = scope.kind === "overview";
    let days = '<button type="button" data-action="set-sketch-scope" data-sketch-kind="overview" aria-pressed="' +
      (overviewOn ? "true" : "false") + '">城市總覽</button>';
    for (let index = 0; index < plan.days.length; index += 1) {
      const day = plan.days[index];
      if (!day) continue;
      const on = scope.kind === "day" && scope.index === index;
      days += '<button type="button" data-action="set-sketch-scope" data-sketch-kind="day" data-sketch-day="' +
        String(index) + '" aria-pressed="' + (on ? "true" : "false") + '">Day ' + String(day.dayIndex) + "</button>";
    }
    const cities = PlannerSketch.cities(plan);
    let cityButtons = "";
    for (let index = 0; index < cities.length; index += 1) {
      const city = cities[index];
      if (!city) continue;
      const on = scope.kind === "city" && scope.city === city;
      cityButtons += '<button type="button" data-action="set-sketch-scope" data-sketch-kind="city" data-sketch-city="' +
        escapeHtml(city) + '" aria-pressed="' + (on ? "true" : "false") + '">' + escapeHtml(city) + "</button>";
    }
    const cityRow = cityButtons === "" ? "" :
      '<div class="sketch-days" role="group" aria-label="手繪地圖城市">' + cityButtons + "</div>";
    const placeholder = PlannerSketch.defaultTitle(plan);
    return '<div class="sketch-days" role="group" aria-label="手繪地圖範圍">' + days + "</div>" + cityRow +
      '<label class="sketch-title-field"><span>標題</span>' +
      '<input data-field="sketch-title" type="text" maxlength="60" autocomplete="off" placeholder="' +
      escapeHtml(placeholder) + '" value="' + escapeHtml(state.sketchTitle) + '"></label>' +
      '<button type="button" class="btn ghost small" data-action="download-sketch" disabled>下載 PNG</button>';
  }

  function renderMapPanel(state: PlannerState, plan: TripPlan): string {
    const sketch = state.mapKind === "sketch";
    const toolbar = '<div class="map-toolbar">' + renderMapSwitch(state) +
      (sketch ? renderSketchControls(state, plan) : "") + "</div>";
    if (!sketch) {
      const day = plan.days[state.activeDay];
      const items = day ? day.items : [];
      const lodging = day ? plan.accommodations.filter(function (stay) {
        return PlannerBudget.coversNight(stay, day.date) && PlannerFormat.isMappableLocation(stay.location);
      }) : [];
      const mapEmpty = items.length === 0 && lodging.length === 0 ? '<p class="map-empty">這天還沒有地點</p>' : "";
      return '<aside class="map-panel" aria-label="當天地圖">' + toolbar +
        '<div class="map-stage"><div id="day-map" class="day-map"></div>' + mapEmpty + "</div></aside>";
    }
    const title = state.sketchTitle.trim() !== "" ? state.sketchTitle.trim() : PlannerSketch.defaultTitle(plan);
    const drawn = PlannerSketch.render({ plan: plan, scope: state.sketchScope, title: title });
    const note = drawn.missing > 0
      ? '<p class="sketch-missing">有 ' + String(drawn.missing) + " 個地點沒有座標，未畫上地圖</p>"
      : "";
    return '<aside class="map-panel is-sketch" aria-label="手繪地圖">' + toolbar + note +
      '<div id="sketch-map" class="sketch-map">' + drawn.svg + "</div></aside>";
  }

  function renderResult(state: PlannerState): string {
    const plan = state.plan;
    if (!plan) return "<p>尚未產生行程。</p>";
    const report = PlannerBudget.report(plan, state.rates);
    const tabs = plan.days.map(function (item, index) {
      const selected = index === state.activeDay;
      const farMark = PlannerFormat.stopsFarFromStay(plan, item)
        ? '<span class="far-mark">遠</span>'
        : "";
      return '<button type="button" role="tab" id="day-tab-' + String(index) + '" aria-controls="day-panel" aria-selected="' +
        (selected ? "true" : "false") + '" tabindex="' + (selected ? "0" : "-1") + '" data-action="select-day" data-index="' +
        String(index) + '"><strong>Day ' + String(item.dayIndex) + farMark + "</strong><span>" +
        escapeHtml(PlannerFormat.formatShortDate(item.date)) + "</span></button>";
    }).join("");
    const interestLine = plan.interests.length > 0
      ? '<p class="summary-line">興趣：' + escapeHtml(plan.interests.join("、")) + "</p>"
      : "";
    const noteLine = plan.note
      ? '<p class="note"><span>想告訴 AI 的話</span>' + escapeHtml(plan.note) + "</p>"
      : "";
    const mock = state.planSource === "mock";
    const badge = mock ? '<span class="badge">示範資料</span>' : "";
    const demo = mock ? '<p class="demo-note">' + escapeHtml(demoNote(plan)) + "</p>" : "";
    const totalText = PlannerFormat.formatMoney(report.total) + "（每人 " + PlannerFormat.formatMoney(report.perPerson) + "）";
    const shownDays = state.progress ? state.progress.totalDays : plan.days.length;
    const regenAllDisabled = (state.progress !== null && state.progress.running) ||
      (state.regen !== null && state.regen.running) ? " disabled" : "";
    return '<header class="summary">' +
      '<div class="summary-title"><h1 id="trip-title" tabindex="-1">' + escapeHtml(plan.destination) + " " +
      String(shownDays) + ' 日遊</h1><div class="summary-actions">' + badge +
      '<button type="button" class="btn ghost small" data-action="export-trip">匯出行程</button>' +
      '<button type="button" class="btn ghost small" data-action="export-csv">匯出 CSV</button>' +
      '<button type="button" class="btn ghost small" data-action="regenerate-all"' + regenAllDisabled +
      ">依住宿與交通重新產生全部行程</button>" +
      '<button type="button" class="btn ghost small" data-action="restart">重新規劃</button></div></div>' +
      '<p class="hint">重新產生全部會先顯示預估額度。已填的住宿和大交通會保留，每天的景點會換掉。</p>' +
      '<p class="summary-line">' + escapeHtml(PlannerFormat.formatDateRange(plan.startDate, plan.endDate)) + " · " +
      String(plan.travelers) + " 人 · " + escapeHtml(PlannerFormat.formatPace(plan.pace)) + "</p>" +
      interestLine +
      '<p class="summary-cost"><span>預估總花費</span><strong>' + escapeHtml(totalText) + "</strong></p>" +
      renderBudgetStatus(report) +
      demo +
      noteLine +
      "</header>" +
      renderChunkStatus(state) +
      renderStaySection(state, plan) +
      renderRideSection(state, plan) +
      '<div class="result-body' + (state.mapKind === "sketch" ? " is-sketch" : "") + '">' +
      '<div class="day-tabs" role="tablist" aria-label="行程天數">' + tabs + "</div>" +
      renderMapPanel(state, plan) +
      '<div id="day-panel" role="tabpanel" aria-labelledby="day-tab-' + String(state.activeDay) + '">' +
      renderDayPanel(state) + "</div>" +
      "</div>" +
      renderHeld(state, plan) +
      renderBudgetSection(state, report);
  }

  function renderDayPanel(state: PlannerState): string {
    const plan = state.plan;
    if (!plan) return "";
    const day = plan.days[state.activeDay];
    const items = day ? day.items : [];
    const opening = day ? PlannerFormat.dayWindow(plan, day.date) : PlannerFormat.dayWindow(plan, plan.startDate);
    const first = items.length > 0 ? items[0] : undefined;
    const depart = day ? departLeg(plan, day.date, first) : null;
    const lead = depart ? depart.minutes : 0;
    const clock = PlannerFormat.dayClock(items, opening.startMinutes, opening.blocks, lead);
    const lodging = day ? PlannerFormat.dayLodging(plan, day.date) : null;
    const last = items.length > 0 ? items[items.length - 1] : undefined;
    const home = lodging && lodging.end ? homeLeg(last, lodging.end) : null;
    const homeMinutes = home ? home.minutes : 0;
    const endClock: DayClock = homeMinutes > 0 ? {
      arrivals: clock.arrivals,
      arrivalMinutes: clock.arrivalMinutes,
      totalMinutes: clock.totalMinutes + homeMinutes,
      endMinutes: clock.endMinutes + homeMinutes,
      endLabel: PlannerFormat.formatMinuteClock(clock.endMinutes + homeMinutes)
    } : clock;
    const timeline = day ? renderTimeline(items, clock, plan, state, opening, depart ? depart.html : "") : "";
    const mealAlert = renderReturnWarning(items) + renderMealGaps(items, clock, opening);
    const flightAlert = departureWarning(opening, endClock, items.length);
    const farBanner = day && PlannerFormat.stopsFarFromStay(plan, day)
      ? '<div class="flight-warn" role="status"><p>這天的景點離住宿很遠，建議重新產生這一天</p></div>'
      : "";
    const regenError = state.regen && day && state.regen.day === state.activeDay ? state.regen.error : "";
    const regenRunning = (state.regen !== null && state.regen.running) ||
      (state.progress !== null && state.progress.running);
    const tonight = day
      ? renderTonight(
        plan,
        day.date,
        home ? PlannerFormat.formatMinuteClock(clock.endMinutes + home.minutes) : "",
        home ? home.html : ""
      )
      : "";
    const placeHint = day ? '<p class="hint place-hint">' + escapeHtml(placeHintText(plan, day.date)) + "</p>" : "";
    const adder = state.addOpen ? renderAddForm(state, items) : renderError(state.error) +
      '<button type="button" class="add-toggle" data-action="open-add">新增地點</button>';
    const transportNote = day ? dayTransportNote(plan, day.date, state.rates) : "";
    const routeNote = state.routeNote && day && state.routeNote.date === day.date
      ? '<p class="route-note" role="status">' + escapeHtml(state.routeNote.text) + "</p>"
      : "";
    return farBanner +
      placeHint +
      renderAlert("regen-error", regenError) +
      mealAlert +
      renderDaySummary(clock, state.canUndoMove, items.length >= 2, transportNote, regenRunning, homeMinutes, items.length > 0) +
      routeNote +
      renderRouteProgress(state) +
      flightAlert + timeline + tonight + adder;
  }

  function placeHintText(plan: TripPlan, date: string): string {
    const places = PlannerFormat.dayPlaces(plan, date);
    if (places.closed) return "這天沒有可排時段，只顯示大交通與入住。";
    if (places.changeover) {
      const fromCities: string[] = [];
      const toCities: string[] = [];
      for (let index = 0; index < places.leaving.length; index += 1) {
        const place = places.leaving[index];
        if (!place) continue;
        for (let cityIndex = 0; cityIndex < place.cities.length; cityIndex += 1) {
          const city = place.cities[cityIndex];
          if (city && fromCities.indexOf(city) < 0) fromCities.push(city);
        }
      }
      for (let index = 0; index < places.tonight.length; index += 1) {
        const place = places.tonight[index];
        if (!place) continue;
        for (let cityIndex = 0; cityIndex < place.cities.length; cityIndex += 1) {
          const city = place.cities[cityIndex];
          if (city && toCities.indexOf(city) < 0) toCities.push(city);
        }
      }
      const fromText = fromCities.length > 0 ? fromCities.join("、") : "前一晚的城市";
      const toText = toCities.length > 0 ? toCities.join("、") : "今晚的城市";
      return "這天換飯店，先排" + fromText + "，移動一次，再排" + toText + "。";
    }
    if (places.cities.length > 0) return "這天可排：" + places.cities.join("、") + "。";
    if (places.tonight.length === 0 && places.leaving.length === 0) return "這天還沒有住宿，景點先留在附近即可。";
    return "這天的住宿沒有對出城市，景點請放在住宿附近。";
  }

  function renderHeld(state: PlannerState, plan: TripPlan): string {
    const items = plan.unscheduled || [];
    if (items.length === 0) return "";
    const cards = items.map(function (item, index) {
      return renderStop(item, index, plan.travelers, state, "", 0, "held");
    }).join("");
    return '<section class="held-block" aria-label="未排入的景點">' +
      "<h2>未排入的景點</h2>" +
      '<p class="hint">這些景點當天沒有可排的時段。可以拖到其他天，或刪除。灰色表示尚未排入行程。</p>' +
      '<ol class="held-list">' + cards + "</ol></section>";
  }

  function renderApp(state: PlannerState): string {
    if (state.step === 3) {
      const waiting = state.progress !== null && state.progress.running && state.error === "";
      const body = waiting ? renderGenerating(state) : renderPlanError(state);
      return '<div class="wrap">' + renderBrand(state) + "<main>" + body + "</main></div>";
    }
    if (state.step === 4) {
      return '<div class="wrap wrap-wide">' + renderBrand(state) + "<main>" + renderResult(state) + "</main></div>";
    }
    const current = state.step === 2 ? 2 : 1;
    const body = current === 2 ? renderPreferences(state) : renderDestination(state);
        return '<div class="wrap' + (current === 1 ? " wrap-hero" : "") + '">' +
            renderBrand(state) + renderProgress(current) + "<main>" + body + "</main></div>";
  }

  const api: PlannerViewApi = {
    renderApp: renderApp,
    renderDayPanel: renderDayPanel,
    interestOptions: interestOptions,
    nextInterests: nextInterests,
    quotaSentence: quotaSentence
  };

  (root as typeof globalThis & { PlannerView: PlannerViewApi }).PlannerView = api;
})(globalThis);
