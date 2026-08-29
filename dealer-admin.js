/*
 * dealer-admin.js - 대리점 계약문의 관리페이지.
 *
 * 접수된 문의 목록과, 접속/제출 두 전환 이벤트의 집계를 함께 보여준다.
 * 저장소는 dealer-common.js의 CONFIG.endpoint 설정을 따른다
 * (endpoint가 비어 있으면 같은 브라우저의 localStorage 기준).
 */
(function () {
  "use strict";

  const D = window.DealerCommon;
  const el = (id) => document.getElementById(id);

  const state = { inquiries: [], events: [], expanded: {} };

  const listBody = document.querySelector("#listTable tbody");
  const perfBody = document.querySelector("#perfTable tbody");
  const emptyMsg = el("emptyMsg");
  const listCount = el("listCount");
  const filterKeyword = el("filterKeyword");
  const filterStatus = el("filterStatus");
  const filterCampaign = el("filterCampaign");
  const filterFrom = el("filterFrom");
  const filterTo = el("filterTo");

  /* --------------------------------------------------------- 유입 표기 */
  function utmOf(item) {
    return (item && item.utm) || {};
  }

  function utmKey(utm) {
    const source = utm.utm_source || "";
    const medium = utm.utm_medium || "";
    const campaign = utm.utm_campaign || "";
    if (!source && !medium && !campaign) return "(직접유입)";
    return [source || "-", medium || "-", campaign || "-"].join(" / ");
  }

  /* ------------------------------------------------------------ 필터링 */
  function inRange(iso) {
    const time = new Date(iso).getTime();
    if (isNaN(time)) return false;
    if (filterFrom.value) {
      if (time < new Date(filterFrom.value + "T00:00:00").getTime()) return false;
    }
    if (filterTo.value) {
      if (time > new Date(filterTo.value + "T23:59:59").getTime()) return false;
    }
    return true;
  }

  function filteredInquiries() {
    const keyword = filterKeyword.value.trim().toLowerCase();
    return state.inquiries.filter(function (item) {
      if (!inRange(item.createdAt)) return false;
      if (filterStatus.value && (item.status || "new") !== filterStatus.value) return false;
      if (filterCampaign.value && utmKey(utmOf(item)) !== filterCampaign.value) return false;
      if (!keyword) return true;
      const haystack = [item.company, item.name, item.phone, item.email, item.region,
        item.items, item.message, item.memo].join(" ").toLowerCase();
      return haystack.indexOf(keyword) >= 0;
    }).sort(function (a, b) {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }

  function filteredEvents() {
    return state.events.filter(function (event) {
      if (!inRange(event.at)) return false;
      if (filterCampaign.value && utmKey(event.utm || {}) !== filterCampaign.value) return false;
      return true;
    });
  }

  /* -------------------------------------------------------------- 요약 */
  function renderSummary() {
    const events = filteredEvents();
    const views = events.filter(function (e) { return e.kind === "view"; }).length;
    // 제출 수는 전환 이벤트 로그를 우선 쓰되, 로그가 없으면(다른 브라우저에서 접수 등) 접수 건수로 대체한다.
    const submitEvents = events.filter(function (e) { return e.kind === "submit"; }).length;
    const list = filteredInquiries();
    const submits = submitEvents || list.length;

    el("statView").textContent = views.toLocaleString();
    el("statSubmit").textContent = submits.toLocaleString();
    el("statRate").textContent = views ? ((submits / views) * 100).toFixed(1) + "%" : "-";
    el("statNew").textContent = list.filter(function (item) {
      return (item.status || "new") === "new";
    }).length.toLocaleString();
  }

  /* ------------------------------------------------------ 캠페인별 성과 */
  function renderPerformance() {
    const rows = {};
    const add = function (key, field) {
      if (!rows[key]) rows[key] = { key: key, view: 0, submit: 0 };
      rows[key][field] += 1;
    };

    filteredEvents().forEach(function (event) {
      add(utmKey(event.utm || {}), event.kind === "view" ? "view" : "submit");
    });
    // 이벤트 로그가 없는 접수건(예: 서버에서 불러온 과거 데이터)도 제출로 잡아준다.
    if (!state.events.some(function (e) { return e.kind === "submit"; })) {
      filteredInquiries().forEach(function (item) { add(utmKey(utmOf(item)), "submit"); });
    }

    const list = Object.keys(rows).map(function (key) { return rows[key]; })
      .sort(function (a, b) { return b.submit - a.submit || b.view - a.view; });

    perfBody.innerHTML = "";
    if (!list.length) {
      perfBody.innerHTML = '<tr><td colspan="4" class="empty-cell">아직 집계된 접속·제출이 없습니다.</td></tr>';
      return;
    }
    list.forEach(function (row) {
      const tr = document.createElement("tr");
      const rate = row.view ? ((row.submit / row.view) * 100).toFixed(1) + "%" : "-";
      tr.innerHTML =
        "<td>" + escapeHtml(row.key) + "</td>" +
        '<td class="num">' + row.view + "</td>" +
        '<td class="num">' + row.submit + "</td>" +
        '<td class="num">' + rate + "</td>";
      perfBody.appendChild(tr);
    });
  }

  /* -------------------------------------------------------------- 목록 */
  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function statusOptions(selected) {
    return D.STATUSES.map(function (status) {
      return '<option value="' + status.id + '"' +
        (status.id === selected ? " selected" : "") + ">" + status.name + "</option>";
    }).join("");
  }

  function detailRow(item) {
    const utm = utmOf(item);
    const lines = [
      ["이메일", item.email],
      ["직함", item.position],
      ["사업자 형태", item.bizType],
      ["취급 품목", item.items],
      ["예상 월 거래", item.volume],
      ["문의 내용", item.message],
      ["랜딩", utm.landing],
      ["utm_content", utm.utm_content],
      ["utm_term", utm.utm_term],
      ["referrer", utm.referrer]
    ].filter(function (pair) { return pair[1]; })
      .map(function (pair) {
        return "<dt>" + escapeHtml(pair[0]) + "</dt><dd>" + escapeHtml(pair[1]) + "</dd>";
      }).join("");

    return '<tr class="detail-row"><td colspan="8">' +
      '<dl class="detail-list">' + lines + "</dl>" +
      '<div class="detail-memo">' +
      '<label for="memo-' + item.id + '">담당자 메모</label>' +
      '<textarea id="memo-' + item.id + '" rows="2" data-memo="' + item.id + '">' +
      escapeHtml(item.memo || "") + "</textarea>" +
      '<div class="detail-actions">' +
      '<button type="button" class="btn-secondary" data-save="' + item.id + '">메모 저장</button>' +
      '<button type="button" class="btn-danger" data-delete="' + item.id + '">이 문의 삭제</button>' +
      "</div></div></td></tr>";
  }

  function renderList() {
    const list = filteredInquiries();
    listBody.innerHTML = "";
    listCount.textContent = "총 " + list.length + "건" +
      (state.inquiries.length !== list.length ? " (전체 " + state.inquiries.length + "건 중)" : "");
    emptyMsg.classList.toggle("hidden", list.length > 0);

    list.forEach(function (item) {
      const tr = document.createElement("tr");
      tr.className = "row-main" + (state.expanded[item.id] ? " open" : "");
      tr.innerHTML =
        "<td>" + escapeHtml(D.formatDateTime(item.createdAt)) + "</td>" +
        "<td><strong>" + escapeHtml(item.company) + "</strong></td>" +
        "<td>" + escapeHtml(item.name) + (item.position ? " " + escapeHtml(item.position) : "") + "</td>" +
        '<td><a href="tel:' + escapeHtml(item.phone) + '">' + escapeHtml(item.phone) + "</a></td>" +
        "<td>" + escapeHtml(item.region) + "</td>" +
        '<td class="utm-cell">' + escapeHtml(utmKey(utmOf(item))) + "</td>" +
        '<td><select data-status="' + item.id + '" class="status-select status-' +
        escapeHtml(item.status || "new") + '">' + statusOptions(item.status || "new") + "</select></td>" +
        '<td><button type="button" class="btn-link" data-toggle="' + item.id + '">' +
        (state.expanded[item.id] ? "닫기" : "상세") + "</button></td>";
      listBody.appendChild(tr);
      if (state.expanded[item.id]) {
        listBody.insertAdjacentHTML("beforeend", detailRow(item));
      }
    });
  }

  /* ------------------------------------------------------- 필터 옵션 채우기 */
  function fillFilters() {
    const current = filterCampaign.value;
    const keys = {};
    state.inquiries.forEach(function (item) { keys[utmKey(utmOf(item))] = true; });
    state.events.forEach(function (event) { keys[utmKey(event.utm || {})] = true; });
    filterCampaign.innerHTML = '<option value="">전체</option>' +
      Object.keys(keys).sort().map(function (key) {
        return '<option value="' + escapeHtml(key) + '">' + escapeHtml(key) + "</option>";
      }).join("");
    filterCampaign.value = current;

    if (filterStatus.options.length <= 1) {
      filterStatus.innerHTML = '<option value="">전체</option>' +
        D.STATUSES.map(function (s) {
          return '<option value="' + s.id + '">' + s.name + "</option>";
        }).join("");
    }
  }

  function renderAll() {
    fillFilters();
    renderSummary();
    renderPerformance();
    renderList();
  }

  /* ------------------------------------------------------------ 이벤트 */
  [filterKeyword, filterStatus, filterCampaign, filterFrom, filterTo].forEach(function (input) {
    input.addEventListener("input", renderAll);
    input.addEventListener("change", renderAll);
  });

  listBody.addEventListener("click", function (event) {
    const target = event.target;
    const toggleId = target.getAttribute && target.getAttribute("data-toggle");
    if (toggleId) {
      state.expanded[toggleId] = !state.expanded[toggleId];
      renderList();
      return;
    }
    const saveId = target.getAttribute && target.getAttribute("data-save");
    if (saveId) {
      const box = document.querySelector('[data-memo="' + saveId + '"]');
      D.updateInquiry(saveId, { memo: box ? box.value : "" });
      state.inquiries = state.inquiries.map(function (item) {
        return item.id === saveId ? Object.assign({}, item, { memo: box ? box.value : "" }) : item;
      });
      target.textContent = "저장됨";
      setTimeout(function () { target.textContent = "메모 저장"; }, 1200);
      return;
    }
    const deleteId = target.getAttribute && target.getAttribute("data-delete");
    if (deleteId) {
      if (!window.confirm("이 문의를 삭제할까요? 되돌릴 수 없습니다.")) return;
      D.removeInquiry(deleteId);
      state.inquiries = state.inquiries.filter(function (item) { return item.id !== deleteId; });
      delete state.expanded[deleteId];
      renderAll();
    }
  });

  listBody.addEventListener("change", function (event) {
    const statusId = event.target.getAttribute && event.target.getAttribute("data-status");
    if (!statusId) return;
    const value = event.target.value;
    D.updateInquiry(statusId, { status: value });
    state.inquiries = state.inquiries.map(function (item) {
      return item.id === statusId ? Object.assign({}, item, { status: value }) : item;
    });
    renderAll();
  });

  el("exportBtn").addEventListener("click", function () {
    const rows = filteredInquiries();
    if (!rows.length) {
      window.alert("내보낼 문의가 없습니다.");
      return;
    }
    const columns = [
      { label: "접수일시", value: function (r) { return D.formatDateTime(r.createdAt); } },
      { label: "상태", value: function (r) { return D.statusName(r.status || "new"); } },
      { label: "회사명", value: function (r) { return r.company; } },
      { label: "담당자", value: function (r) { return r.name; } },
      { label: "직함", value: function (r) { return r.position; } },
      { label: "연락처", value: function (r) { return r.phone; } },
      { label: "이메일", value: function (r) { return r.email; } },
      { label: "지역", value: function (r) { return r.region; } },
      { label: "사업자 형태", value: function (r) { return r.bizType; } },
      { label: "취급 품목", value: function (r) { return r.items; } },
      { label: "예상 월 거래", value: function (r) { return r.volume; } },
      { label: "문의 내용", value: function (r) { return r.message; } },
      { label: "메모", value: function (r) { return r.memo; } },
      { label: "utm_source", value: function (r) { return utmOf(r).utm_source; } },
      { label: "utm_medium", value: function (r) { return utmOf(r).utm_medium; } },
      { label: "utm_campaign", value: function (r) { return utmOf(r).utm_campaign; } },
      { label: "utm_content", value: function (r) { return utmOf(r).utm_content; } },
      { label: "utm_term", value: function (r) { return utmOf(r).utm_term; } }
    ];
    const today = new Date().toISOString().slice(0, 10);
    D.downloadCsv("대리점계약문의_" + today + ".csv", D.toCsv(rows, columns));
  });

  el("clearBtn").addEventListener("click", function () {
    if (!window.confirm("이 브라우저에 저장된 문의와 전환 이벤트 로그를 모두 삭제할까요?")) return;
    D.clearAll();
    load();
  });

  el("reloadBtn").addEventListener("click", load);

  /* -------------------------------------------------------------- 로드 */
  function load() {
    el("perfNote").textContent = D.CONFIG.endpoint
      ? "문의는 서버(" + D.CONFIG.endpoint + ")에서, 접속 수는 이 브라우저의 이벤트 로그에서 가져옵니다."
      : "서버 저장소(endpoint)가 설정되지 않아 이 브라우저에 저장된 데이터만 표시합니다. 광고 전체 성과는 GA4에서 두 전환 이벤트로 확인하세요.";
    state.events = D.loadEvents();
    D.loadInquiries().then(function (list) {
      state.inquiries = Array.isArray(list) ? list : [];
      renderAll();
    });
  }

  load();
})();
