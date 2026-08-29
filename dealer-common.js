/*
 * dealer-common.js
 * 대리점 계약문의 입력페이지(dealerform.html)와 관리페이지(dealer-admin.html)가 함께 쓰는 공통 모듈.
 *
 * 담당 범위
 * 1) UTM 수집  - 광고에서 넘어온 utm_* 값을 URL에서 읽어 문의 데이터에 함께 저장한다.
 *                (첫 진입의 UTM을 세션에 보관해서, 폼을 다시 열어도 유입 경로가 유지된다.)
 * 2) 전환 이벤트 - "접속"과 "제출"을 서로 다른 이벤트로 각각 발송한다.
 *                  GA4(gtag) / GTM(dataLayer) / 메타 / 카카오 / 네이버에 동시에 흘려보내되,
 *                  해당 태그가 페이지에 없으면 조용히 건너뛴다.
 * 3) 저장      - DEALER_CONFIG.endpoint 가 설정돼 있으면 그쪽으로 POST/GET,
 *                  비어 있으면 localStorage(같은 브라우저 안에서만)에 저장한다.
 */
(function (global) {
  "use strict";

  /* ------------------------------------------------------------------ 설정 */
  // 실제 운영에 붙일 때 이 값들만 채우면 된다. 비워두면 그 채널로는 전환을 쏘지 않는다.
  const CONFIG = {
    // 문의 저장소. Google Apps Script 웹앱 / 자체 API 등 JSON을 받는 주소.
    // 비워두면 이 브라우저의 localStorage에만 저장된다(테스트/단독 사용).
    endpoint: "",

    // 전환 이벤트 이름 - "접속"과 "제출"을 각각 따로 둔다.
    events: {
      view: "dealer_inquiry_view",     // 접속 전환: 신청페이지에 들어온 순간
      submit: "dealer_inquiry_submit"  // 제출 전환: 신청서를 실제로 보낸 순간
    },

    // 구글애즈 전환 라벨 (예: "AW-123456789/AbCdEfGhIj"). 비우면 미발송.
    googleAds: { view: "", submit: "" },

    // 네이버 공통 스크립트(wcs) 전환 유형 - 1:회원가입 2:신청/상담 3:장바구니 4:구매 5:기타
    naver: { viewType: "", submitType: "2", submitValue: "0" },

    // 카카오 픽셀 전환. 픽셀 스크립트가 페이지에 있으면 자동으로 호출된다.
    kakao: { trackId: "" },

    // 메타 픽셀 커스텀 이벤트 이름
    meta: { view: "DealerInquiryView", submit: "Lead" }
  };

  const STORAGE_KEY = "dealerInquiries.v1";   // 접수된 문의
  const EVENT_KEY = "dealerEvents.v1";        // 접속/제출 전환 이벤트 로그
  const UTM_SESSION_KEY = "dealerUtm.v1";     // 첫 진입 UTM 보관
  const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

  const STATUSES = [
    { id: "new", name: "신규" },
    { id: "contacted", name: "연락완료" },
    { id: "holding", name: "보류" },
    { id: "contracted", name: "계약완료" },
    { id: "dropped", name: "실패/취소" }
  ];

  /* -------------------------------------------------------------- 유틸 */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function safeParse(raw, fallback) {
    try {
      const parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch (e) {
      return fallback;
    }
  }

  function readLocal(key, fallback) {
    try {
      return safeParse(global.localStorage.getItem(key), fallback);
    } catch (e) {
      return fallback; // 로컬스토리지가 막힌 환경(파일 직접 열기 등)
    }
  }

  function writeLocal(key, value) {
    try {
      global.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function formatDateTime(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
      " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  // 휴대폰(3-4-4)과 서울 지역번호(02-3/4-4)를 구분해서 하이픈을 넣는다.
  function formatPhone(raw) {
    const digits = String(raw || "").replace(/[^0-9]/g, "").slice(0, 11);
    if (digits.indexOf("02") === 0) {
      if (digits.length < 3) return digits;
      if (digits.length < 7) return digits.slice(0, 2) + "-" + digits.slice(2);
      if (digits.length < 10) return digits.slice(0, 2) + "-" + digits.slice(2, 5) + "-" + digits.slice(5, 9);
      return digits.slice(0, 2) + "-" + digits.slice(2, 6) + "-" + digits.slice(6, 10);
    }
    if (digits.length < 4) return digits;
    if (digits.length < 8) return digits.slice(0, 3) + "-" + digits.slice(3);
    if (digits.length < 11) return digits.slice(0, 3) + "-" + digits.slice(3, 6) + "-" + digits.slice(6, 10);
    return digits.slice(0, 3) + "-" + digits.slice(3, 7) + "-" + digits.slice(7, 11);
  }

  function statusName(id) {
    const found = STATUSES.filter((s) => s.id === id)[0];
    return found ? found.name : id;
  }

  /* --------------------------------------------------------- UTM 수집 */
  // 현재 URL의 utm_*을 읽는다. 없으면 세션에 보관해 둔 첫 진입 UTM을 쓴다.
  function collectUtm() {
    const params = new URLSearchParams(global.location.search);
    const fromUrl = {};
    let hasAny = false;
    UTM_KEYS.forEach(function (key) {
      const value = params.get(key);
      if (value) {
        fromUrl[key] = value;
        hasAny = true;
      }
    });

    if (hasAny) {
      const record = {
        utm_source: fromUrl.utm_source || "",
        utm_medium: fromUrl.utm_medium || "",
        utm_campaign: fromUrl.utm_campaign || "",
        utm_content: fromUrl.utm_content || "",
        utm_term: fromUrl.utm_term || "",
        landing: global.location.pathname + global.location.search,
        referrer: global.document.referrer || "",
        firstSeenAt: new Date().toISOString()
      };
      try {
        global.sessionStorage.setItem(UTM_SESSION_KEY, JSON.stringify(record));
      } catch (e) { /* 저장 실패해도 이번 페이지에서는 그대로 사용한다 */ }
      return record;
    }

    let stored = null;
    try {
      stored = safeParse(global.sessionStorage.getItem(UTM_SESSION_KEY), null);
    } catch (e) {
      stored = null;
    }
    if (stored) return stored;

    return {
      utm_source: "",
      utm_medium: "",
      utm_campaign: "",
      utm_content: "",
      utm_term: "",
      landing: global.location.pathname + global.location.search,
      referrer: global.document.referrer || "",
      firstSeenAt: new Date().toISOString()
    };
  }

  // UTM이 하나도 없으면 직접유입으로 본다.
  function utmLabel(utm) {
    if (!utm) return "(직접유입)";
    const source = utm.utm_source || "";
    const medium = utm.utm_medium || "";
    const campaign = utm.utm_campaign || "";
    if (!source && !medium && !campaign) return "(직접유입)";
    return [source || "-", medium || "-", campaign || "-"].join(" / ");
  }

  /* ------------------------------------------------- 전환 이벤트 발송 */
  // kind: "view"(접속) | "submit"(제출)
  // 같은 행동을 GA4/GTM/메타/카카오/네이버에 각각 한 번씩 흘려보낸다.
  function trackConversion(kind, utm, extra) {
    const eventName = CONFIG.events[kind];
    if (!eventName) return null;

    const payload = Object.assign({
      event_category: "dealer_inquiry",
      conversion_step: kind === "view" ? "access" : "submit",
      page_location: global.location.href,
      utm_source: (utm && utm.utm_source) || "",
      utm_medium: (utm && utm.utm_medium) || "",
      utm_campaign: (utm && utm.utm_campaign) || "",
      utm_content: (utm && utm.utm_content) || "",
      utm_term: (utm && utm.utm_term) || ""
    }, extra || {});

    // 1) GTM - dataLayer
    try {
      global.dataLayer = global.dataLayer || [];
      global.dataLayer.push(Object.assign({ event: eventName }, payload));
    } catch (e) { /* noop */ }

    // 2) GA4 - gtag
    try {
      if (typeof global.gtag === "function") {
        global.gtag("event", eventName, payload);
        const adsLabel = CONFIG.googleAds[kind];
        if (adsLabel) global.gtag("event", "conversion", { send_to: adsLabel });
      }
    } catch (e) { /* noop */ }

    // 3) 메타 픽셀
    try {
      if (typeof global.fbq === "function" && CONFIG.meta[kind]) {
        const standard = ["Lead", "CompleteRegistration", "Contact", "ViewContent"];
        const method = standard.indexOf(CONFIG.meta[kind]) >= 0 ? "track" : "trackCustom";
        global.fbq(method, CONFIG.meta[kind], {
          content_name: "대리점 계약문의",
          content_category: payload.utm_campaign || "direct"
        });
      }
    } catch (e) { /* noop */ }

    // 4) 카카오 픽셀
    try {
      if (typeof global.kakaoPixel === "function" && CONFIG.kakao.trackId) {
        const pixel = global.kakaoPixel(CONFIG.kakao.trackId);
        if (kind === "view" && pixel.pageView) pixel.pageView("dealer_inquiry");
        if (kind === "submit" && pixel.completeRegistration) pixel.completeRegistration("dealer_inquiry");
      }
    } catch (e) { /* noop */ }

    // 5) 네이버 공통 스크립트
    try {
      const naverType = kind === "view" ? CONFIG.naver.viewType : CONFIG.naver.submitType;
      if (naverType && typeof global.wcs !== "undefined" && typeof global.wcs_do === "function") {
        global._nasa = global._nasa || {};
        global._nasa.cnv = global.wcs.cnv(naverType, kind === "submit" ? CONFIG.naver.submitValue : "0");
        global.wcs_do(global._nasa);
      }
    } catch (e) { /* noop */ }

    // 6) 관리페이지에서 접속/제출을 비교할 수 있도록 로컬에도 남긴다.
    const logged = {
      id: uid(),
      kind: kind,
      event: eventName,
      at: new Date().toISOString(),
      utm: {
        utm_source: payload.utm_source,
        utm_medium: payload.utm_medium,
        utm_campaign: payload.utm_campaign,
        utm_content: payload.utm_content,
        utm_term: payload.utm_term
      }
    };
    const events = readLocal(EVENT_KEY, []);
    events.push(logged);
    // 로그가 무한정 커지지 않게 최근 2000건만 유지한다.
    writeLocal(EVENT_KEY, events.slice(-2000));
    return logged;
  }

  /* ------------------------------------------------------------ 저장소 */
  function localInquiries() {
    const list = readLocal(STORAGE_KEY, []);
    return Array.isArray(list) ? list : [];
  }

  function saveLocalInquiries(list) {
    return writeLocal(STORAGE_KEY, list);
  }

  // 문의 저장. endpoint가 있으면 서버로 보내고, 실패하거나 없으면 로컬에 남긴다.
  function saveInquiry(record) {
    const entry = Object.assign({
      id: uid(),
      createdAt: new Date().toISOString(),
      status: "new",
      memo: ""
    }, record);

    if (!CONFIG.endpoint) {
      const list = localInquiries();
      list.push(entry);
      const ok = saveLocalInquiries(list);
      return Promise.resolve({ saved: entry, storage: "local", ok: ok });
    }

    return fetch(CONFIG.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry)
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return { saved: entry, storage: "remote", ok: true };
    }).catch(function (err) {
      // 서버 저장이 실패해도 문의를 잃지 않도록 로컬에 백업한다.
      const list = localInquiries();
      list.push(Object.assign({}, entry, { syncError: String(err) }));
      saveLocalInquiries(list);
      return { saved: entry, storage: "local-fallback", ok: false, error: String(err) };
    });
  }

  function loadInquiries() {
    if (!CONFIG.endpoint) return Promise.resolve(localInquiries());
    return fetch(CONFIG.endpoint, { headers: { Accept: "application/json" } })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        return Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : []);
      })
      .catch(function () {
        return localInquiries(); // 서버가 안 되면 로컬 백업이라도 보여준다.
      });
  }

  function updateInquiry(id, patch) {
    const list = localInquiries();
    let updated = null;
    const next = list.map(function (item) {
      if (item.id !== id) return item;
      updated = Object.assign({}, item, patch, { updatedAt: new Date().toISOString() });
      return updated;
    });
    saveLocalInquiries(next);
    return updated;
  }

  function removeInquiry(id) {
    saveLocalInquiries(localInquiries().filter(function (item) { return item.id !== id; }));
  }

  function loadEvents() {
    const list = readLocal(EVENT_KEY, []);
    return Array.isArray(list) ? list : [];
  }

  function clearAll() {
    writeLocal(STORAGE_KEY, []);
    writeLocal(EVENT_KEY, []);
  }

  /* ---------------------------------------------------------- CSV 출력 */
  function toCsv(rows, columns) {
    const escape = function (value) {
      const text = value == null ? "" : String(value);
      return '"' + text.replace(/"/g, '""') + '"';
    };
    const head = columns.map(function (c) { return escape(c.label); }).join(",");
    const body = rows.map(function (row) {
      return columns.map(function (c) { return escape(c.value(row)); }).join(",");
    });
    // 엑셀에서 한글이 깨지지 않도록 BOM을 붙인다.
    return "﻿" + [head].concat(body).join("\r\n");
  }

  function downloadCsv(filename, csv) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  global.DealerCommon = {
    CONFIG: CONFIG,
    STATUSES: STATUSES,
    UTM_KEYS: UTM_KEYS,
    collectUtm: collectUtm,
    utmLabel: utmLabel,
    trackConversion: trackConversion,
    saveInquiry: saveInquiry,
    loadInquiries: loadInquiries,
    updateInquiry: updateInquiry,
    removeInquiry: removeInquiry,
    loadEvents: loadEvents,
    clearAll: clearAll,
    formatDateTime: formatDateTime,
    formatPhone: formatPhone,
    statusName: statusName,
    toCsv: toCsv,
    downloadCsv: downloadCsv
  };
})(window);
