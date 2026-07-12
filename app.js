(function () {
  "use strict";

  const state = {
    site: null,
    platform: null,
    channel: null,
    variant: null,
    customCampaign: "",
    metaPlacement: null,
    metaCustom: "",
    page: null,
    userPageId: null,
    customPath: "",
    content: ""
  };

  const el = (id) => document.getElementById(id);

  const siteSelect = el("siteSelect");
  const platformGroup = el("platformGroup");
  const channelSelect = el("channelSelect");
  const variantSelect = el("variantSelect");
  const customVariantBox = el("customVariantBox");
  const customBaseSelect = el("customBaseSelect");
  const customCampaignInput = el("customCampaignInput");
  const customCampaignHint = el("customCampaignHint");
  const lockedSource = el("lockedSource");
  const lockedMedium = el("lockedMedium");
  const stepMeta = el("step-meta");
  const metaPlacementSelect = el("metaPlacementSelect");
  const metaCustomBox = el("metaCustomBox");
  const metaCustomInput = el("metaCustomInput");
  const metaNote = el("metaNote");
  const pageSelect = el("pageSelect");
  const customPageBox = el("customPageBox");
  const customPathInput = el("customPathInput");
  const fixedPageNote = el("fixedPageNote");
  const contentInput = el("contentInput");
  const todayBtn = el("todayBtn");
  const resultUrl = el("resultUrl");
  const copyBtn = el("copyBtn");
  const addHistoryBtn = el("addHistoryBtn");
  const resultMsg = el("resultMsg");
  const historyList = el("historyList");
  const clearHistoryBtn = el("clearHistoryBtn");

  const stepPlatform = el("step-platform");
  const stepChannel = el("step-channel");
  const stepVariant = el("step-variant");
  const stepPage = el("step-page");
  const stepContent = el("step-content");

  const CUSTOM_VARIANT_ID = "__custom__";
  const CUSTOM_PAGE_ID = "__custom__";
  const HISTORY_KEY = "utm_history_v1";

  function qsEncode(value) {
    if (typeof value === "string" && value.indexOf("{{") !== -1) return value;
    return encodeURIComponent(value);
  }

  function buildQuery(pairs) {
    return pairs
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `${k}=${qsEncode(v)}`)
      .join("&");
  }

  function resolvePage(site, pageId) {
    return site.pages.find((p) => p.id === pageId) || null;
  }

  function populateSites() {
    UTM_DATA.sites.forEach((site) => {
      const opt = document.createElement("option");
      opt.value = site.id;
      opt.textContent = `${site.name} (${site.domain})`;
      siteSelect.appendChild(opt);
    });
  }

  function resetStep(stepEl, selectEl, placeholder) {
    stepEl.classList.add("disabled");
    if (selectEl) {
      selectEl.disabled = true;
      selectEl.innerHTML = `<option value="" selected disabled>${placeholder}</option>`;
    }
  }

  function onSiteChange() {
    state.site = UTM_DATA.sites.find((s) => s.id === siteSelect.value) || null;
    state.platform = null;
    state.channel = null;
    state.variant = null;
    state.page = null;

    resetStep(stepVariant, variantSelect, "먼저 광고 종류를 선택하세요");
    resetStep(stepChannel, channelSelect, "먼저 플랫폼을 선택하세요");
    stepContent.classList.add("disabled");
    stepMeta.style.display = "none";
    customVariantBox.classList.add("hidden");
    customPageBox.classList.add("hidden");
    fixedPageNote.classList.add("hidden");
    contentInput.value = "";
    state.content = "";
    clearResult();

    if (!state.site) {
      stepPlatform.classList.add("disabled");
      platformGroup.innerHTML = "";
      resetStep(stepPage, pageSelect, "먼저 사이트를 선택하세요");
      return;
    }

    stepPlatform.classList.remove("disabled");
    platformGroup.innerHTML = "";
    state.site.platforms.forEach((p) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "platform-btn";
      btn.dataset.platformId = p.id;
      btn.textContent = p.name;
      btn.addEventListener("click", () => onPlatformSelect(p.id));
      platformGroup.appendChild(btn);
    });

    stepPage.classList.remove("disabled");
    populatePageStep();
  }

  // 사이트의 전체 페이지 목록으로 2번(랜딩 페이지) 단계를 채운다. 채널/캠페인 선택과 무관하게 항상 전체 목록을 보여준다.
  function populatePageStep() {
    pageSelect.disabled = false;
    customPageBox.classList.add("hidden");
    fixedPageNote.classList.add("hidden");
    pageSelect.innerHTML = `<option value="" selected disabled>랜딩 페이지를 선택하세요</option>`;
    state.site.pages.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      pageSelect.appendChild(opt);
    });
    const customOpt = document.createElement("option");
    customOpt.value = CUSTOM_PAGE_ID;
    customOpt.textContent = "+ 경로 직접 입력";
    pageSelect.appendChild(customOpt);
    state.page = null;
    state.userPageId = null;
  }

  // 캠페인(프로젝트)이 랜딩 페이지를 강제로 고정하지 않는 한, 2번 단계를 사용자가 실제로 골랐던 값으로 되돌린다.
  function resetPageOverride() {
    pageSelect.disabled = false;
    fixedPageNote.classList.add("hidden");
    pageSelect.value = state.userPageId || "";
    customPageBox.classList.toggle("hidden", pageSelect.value !== CUSTOM_PAGE_ID);
    if (pageSelect.value === CUSTOM_PAGE_ID) {
      state.page = null;
    } else if (pageSelect.value) {
      state.page = resolvePage(state.site, pageSelect.value);
    } else {
      state.page = null;
    }
  }

  function onPlatformSelect(platformId) {
    state.platform = platformId;
    state.channel = null;
    state.variant = null;

    Array.from(platformGroup.children).forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.platformId === platformId);
    });

    resetStep(stepVariant, variantSelect, "먼저 광고 종류를 선택하세요");
    stepContent.classList.add("disabled");
    stepMeta.style.display = "none";
    customVariantBox.classList.add("hidden");
    contentInput.value = "";
    state.content = "";
    clearResult();
    resetPageOverride();

    stepChannel.classList.remove("disabled");
    channelSelect.disabled = false;
    channelSelect.innerHTML = `<option value="" selected disabled>광고 종류를 선택하세요</option>`;
    state.site.channels
      .filter((ch) => ch.platform === platformId)
      .forEach((ch) => {
        const opt = document.createElement("option");
        opt.value = ch.id;
        opt.textContent = ch.name;
        channelSelect.appendChild(opt);
      });
  }

  function onChannelChange() {
    state.channel = state.site.channels.find((c) => c.id === channelSelect.value) || null;
    state.variant = null;

    stepContent.classList.add("disabled");
    customVariantBox.classList.add("hidden");
    contentInput.value = "";
    state.content = "";
    clearResult();
    resetPageOverride();

    if (!state.channel) {
      stepVariant.classList.add("disabled");
      stepMeta.style.display = "none";
      return;
    }

    stepVariant.classList.remove("disabled");
    variantSelect.disabled = false;
    variantSelect.innerHTML = `<option value="" selected disabled>캠페인을 선택하세요</option>`;
    state.channel.variants.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = v.name;
      variantSelect.appendChild(opt);
    });
    const customOpt = document.createElement("option");
    customOpt.value = CUSTOM_VARIANT_ID;
    customOpt.textContent = "+ 새 프로젝트 (캠페인 값 직접 입력)";
    variantSelect.appendChild(customOpt);

    stepMeta.style.display = state.channel.isMeta ? "" : "none";
    if (state.channel.isMeta) {
      metaPlacementSelect.innerHTML = "";
      UTM_DATA.metaPlacementOptions.forEach((o) => {
        const opt = document.createElement("option");
        opt.value = o.id;
        opt.textContent = o.name;
        metaPlacementSelect.appendChild(opt);
      });
      metaPlacementSelect.value = "none";
      onMetaPlacementChange();
    }

    lockedSource.value = "";
    lockedMedium.value = "";
  }

  function onVariantChange() {
    const val = variantSelect.value;
    customVariantBox.classList.toggle("hidden", val !== CUSTOM_VARIANT_ID);

    if (val === CUSTOM_VARIANT_ID) {
      customBaseSelect.innerHTML = "";
      state.channel.variants.forEach((v) => {
        const source = v.source || state.channel.defaultSource || "";
        const medium = v.medium || state.channel.medium || "";
        const opt = document.createElement("option");
        opt.value = v.id;
        opt.textContent = `${v.name} (source=${source}, medium=${medium})`;
        customBaseSelect.appendChild(opt);
      });
      const baseVariant = state.channel.variants.find((v) => v.id === customBaseSelect.value) || state.channel.variants[0];
      state.variant = {
        id: CUSTOM_VARIANT_ID,
        name: "새 프로젝트",
        source: baseVariant.source,
        medium: baseVariant.medium,
        campaign: null
      };
      customCampaignHint.textContent = `참고 형식 (기존 캠페인 예시): ${baseVariant.campaign}`;
    } else {
      state.variant = state.channel.variants.find((v) => v.id === val) || null;
    }

    updateLockedFields();
    setupPageStep();
    clearResult();
  }

  function onCustomBaseChange() {
    if (!state.variant || state.variant.id !== CUSTOM_VARIANT_ID) return;
    const baseVariant = state.channel.variants.find((v) => v.id === customBaseSelect.value);
    if (!baseVariant) return;
    state.variant.source = baseVariant.source;
    state.variant.medium = baseVariant.medium;
    customCampaignHint.textContent = `참고 형식 (기존 캠페인 예시): ${baseVariant.campaign}`;
    updateLockedFields();
    setupPageStep();
    refreshResult();
  }

  function updateLockedFields() {
    if (!state.channel || !state.variant) return;
    const source = state.variant.source || state.channel.defaultSource || "";
    const medium = state.variant.medium || state.channel.medium || "";
    lockedSource.value = source;
    lockedMedium.value = medium;
  }

  function onMetaPlacementChange() {
    const opt = UTM_DATA.metaPlacementOptions.find((o) => o.id === metaPlacementSelect.value);
    state.metaPlacement = opt || null;
    metaCustomBox.classList.toggle("hidden", !opt || opt.id !== "custom");
    metaNote.textContent = opt && opt.note ? opt.note : "";
    clearResult();
  }

  function setupPageStep() {
    if (!state.variant || (variantSelect.value === CUSTOM_VARIANT_ID && !customCampaignInput.value.trim())) {
      stepContent.classList.add("disabled");
      return;
    }

    const channel = state.channel;

    // 캠페인(프로젝트)에 따라 페이지가 고정되는 경우 (예: 네이버 파워컨텐츠, 오프라인 QR) — 2번에서 고른 값을 덮어쓴다.
    const fixedPageId = state.variant.page;
    if (fixedPageId) {
      const page = resolvePage(state.site, fixedPageId);
      state.page = page;
      pageSelect.value = fixedPageId;
      pageSelect.disabled = true;
      customPageBox.classList.add("hidden");
      fixedPageNote.classList.remove("hidden");
      fixedPageNote.textContent = `이 캠페인은 랜딩 페이지가 "${page.name}"로 고정되어 있어, 2번에서 고르신 값 대신 이 페이지를 사용합니다.`;
    } else {
      resetPageOverride();
    }

    stepContent.classList.remove("disabled");

    // utm_content 채널이 날짜 기반으로 고정값을 갖는 경우 (네이버 파워컨텐츠) 프리필
    if (channel.hasContentDate && state.variant.content) {
      contentInput.value = state.variant.content;
      state.content = state.variant.content;
    }
  }

  function onPageChange() {
    const val = pageSelect.value;
    state.userPageId = val || null;
    customPageBox.classList.toggle("hidden", val !== CUSTOM_PAGE_ID);
    if (val === CUSTOM_PAGE_ID) {
      state.page = null;
    } else {
      state.page = resolvePage(state.site, val);
    }
    clearResult();
  }

  function getCampaignValue() {
    if (!state.variant) return "";
    if (state.variant.id === CUSTOM_VARIANT_ID) return customCampaignInput.value.trim();
    return state.variant.campaign;
  }

  function getContentValue() {
    if (state.channel && state.channel.isMeta && state.metaPlacement) {
      if (state.metaPlacement.id === "custom") return metaCustomInput.value.trim();
      if (state.metaPlacement.content) return state.metaPlacement.content;
    }
    return contentInput.value.trim();
  }

  function getPathAndParams() {
    if (state.variant && state.variant.page) {
      const page = resolvePage(state.site, state.variant.page);
      return { path: page.path, params: page.params || {} };
    }
    if (pageSelect && pageSelect.value === CUSTOM_PAGE_ID) {
      const raw = customPathInput.value.trim();
      const [path, query] = raw.split("?");
      const params = {};
      if (query) {
        new URLSearchParams(query).forEach((v, k) => (params[k] = v));
      }
      return { path: path || "/", params };
    }
    if (state.page) {
      return { path: state.page.path, params: state.page.params || {} };
    }
    return null;
  }

  function buildUrl() {
    if (!state.site || !state.channel || !state.variant) return null;
    const campaign = getCampaignValue();
    if (!campaign) return null;

    const pathInfo = getPathAndParams();
    if (!pathInfo) return null;

    const source = state.variant.source || state.channel.defaultSource || "";
    const medium = state.variant.medium || state.channel.medium || "";
    if (!source || !medium) return null;

    const pairs = Object.entries(pathInfo.params || {});
    pairs.push(["utm_source", source]);
    pairs.push(["utm_medium", medium]);
    pairs.push(["utm_campaign", campaign]);
    const content = getContentValue();
    if (content) pairs.push(["utm_content", content]);

    const query = buildQuery(pairs);
    return `https://www.${state.site.domain}${pathInfo.path}${query ? "?" + query : ""}`;
  }

  function clearResult() {
    resultUrl.value = "";
    copyBtn.disabled = true;
    addHistoryBtn.disabled = true;
    resultMsg.textContent = "";
  }

  function refreshResult() {
    const url = buildUrl();
    if (url) {
      resultUrl.value = url;
      copyBtn.disabled = false;
      addHistoryBtn.disabled = false;
    } else {
      clearResult();
    }
  }

  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }

  function saveHistory(items) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
  }

  function renderHistory() {
    const items = loadHistory();
    historyList.innerHTML = "";
    if (items.length === 0) {
      historyList.innerHTML = `<li class="history-empty">아직 생성한 URL이 없습니다.</li>`;
      return;
    }
    items
      .slice()
      .reverse()
      .forEach((item) => {
        const li = document.createElement("li");
        const time = new Date(item.ts).toLocaleString("ko-KR");
        li.innerHTML = `
          <span class="h-url">${escapeHtml(item.url)}</span>
          <span class="h-meta">${escapeHtml(item.label || "")} · ${time}</span>
          <button type="button" data-action="copy">복사</button>
          <button type="button" data-action="delete">삭제</button>
        `;
        li.querySelector('[data-action="copy"]').addEventListener("click", () => copyText(item.url));
        li.querySelector('[data-action="delete"]').addEventListener("click", () => {
          const remaining = loadHistory().filter((x) => x.id !== item.id);
          saveHistory(remaining);
          renderHistory();
        });
        historyList.appendChild(li);
      });
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => flashMsg("복사되었습니다."));
    } else {
      resultUrl.select();
      document.execCommand("copy");
      flashMsg("복사되었습니다.");
    }
  }

  function flashMsg(msg) {
    resultMsg.textContent = msg;
    setTimeout(() => {
      if (resultMsg.textContent === msg) resultMsg.textContent = "";
    }, 2000);
  }

  // ---- 이벤트 바인딩 ----
  siteSelect.addEventListener("change", onSiteChange);
  channelSelect.addEventListener("change", onChannelChange);
  variantSelect.addEventListener("change", onVariantChange);
  customBaseSelect.addEventListener("change", onCustomBaseChange);
  customCampaignInput.addEventListener("input", () => {
    setupPageStep();
    refreshResult();
  });
  metaPlacementSelect.addEventListener("change", () => {
    onMetaPlacementChange();
    refreshResult();
  });
  metaCustomInput.addEventListener("input", refreshResult);
  pageSelect.addEventListener("change", () => {
    onPageChange();
    refreshResult();
  });
  customPathInput.addEventListener("input", refreshResult);
  contentInput.addEventListener("input", refreshResult);
  todayBtn.addEventListener("click", () => {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    contentInput.value = ymd;
    refreshResult();
  });

  copyBtn.addEventListener("click", () => copyText(resultUrl.value));
  addHistoryBtn.addEventListener("click", () => {
    const url = resultUrl.value;
    if (!url) return;
    const label = `${state.site.name} · ${state.channel.name} · ${
      state.variant.id === CUSTOM_VARIANT_ID ? "새 프로젝트" : state.variant.name
    }`;
    const items = loadHistory();
    items.push({ id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, url, label, ts: Date.now() });
    saveHistory(items);
    renderHistory();
    flashMsg("기록에 추가되었습니다.");
  });
  clearHistoryBtn.addEventListener("click", () => {
    if (confirm("생성 기록을 모두 삭제할까요?")) {
      saveHistory([]);
      renderHistory();
    }
  });

  // 결과 재계산이 필요한 모든 변경 지점을 하나로 모음
  ["change"].forEach((evt) => {
    variantSelect.addEventListener(evt, refreshResult);
    pageSelect.addEventListener(evt, refreshResult);
  });

  // ---- 탭 전환 ----
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      el(`tab-${btn.dataset.tab}`).classList.add("active");
    });
  });

  // ---- 초기화 ----
  populateSites();
  renderHistory();
})();
