/*
 * dealer-form.js - 대리점 계약문의 입력페이지 동작.
 *
 * 전환 이벤트는 두 개를 각각 발송한다.
 *   1) 접속 전환 dealer_inquiry_view   : 페이지가 열리는 시점에 1회
 *   2) 제출 전환 dealer_inquiry_submit : 유효성 검사를 통과해 저장이 끝난 시점에 1회
 * 새로고침으로 접속 전환이 중복 집계되지 않도록, 같은 세션에서는 한 번만 쏜다.
 */
(function () {
  "use strict";

  const D = window.DealerCommon;
  const form = document.getElementById("dealerForm");
  const doneBox = document.getElementById("doneBox");
  const doneUtm = document.getElementById("doneUtm");
  const errorBox = document.getElementById("formError");
  const submitBtn = document.getElementById("submitBtn");
  const utmBadge = document.getElementById("utmBadge");
  const VIEW_ONCE_KEY = "dealerViewSent.v1";

  const utm = D.collectUtm();

  /* ------------------------------------------------- 1) 접속 전환 이벤트 */
  (function fireViewConversion() {
    let already = false;
    try {
      already = window.sessionStorage.getItem(VIEW_ONCE_KEY) === "1";
    } catch (e) { /* 세션스토리지가 막힌 환경이면 매번 발송한다 */ }
    if (already) return;
    D.trackConversion("view", utm, { form_name: "dealer_inquiry" });
    try {
      window.sessionStorage.setItem(VIEW_ONCE_KEY, "1");
    } catch (e) { /* noop */ }
  })();

  /* --------------------------------------------------- UTM을 폼에 채우기 */
  D.UTM_KEYS.forEach(function (key) {
    const input = document.getElementById(key);
    if (input) input.value = utm[key] || "";
  });

  // 광고 URL로 들어온 경우에만 어떤 캠페인으로 집계되는지 작게 표시한다(운영자 확인용).
  if (utm.utm_source || utm.utm_campaign) {
    utmBadge.hidden = false;
    utmBadge.textContent = "유입 경로: " + D.utmLabel(utm);
  }

  /* ------------------------------------------------------ 입력 편의/검증 */
  const phone = document.getElementById("phone");
  phone.addEventListener("input", function () {
    phone.value = D.formatPhone(phone.value);
  });

  function validate(data) {
    if (!data.company) return "회사명을 입력해주세요.";
    if (!data.name) return "담당자명을 입력해주세요.";
    const digits = (data.phone || "").replace(/[^0-9]/g, "");
    if (digits.length < 9) return "연락처를 정확히 입력해주세요.";
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return "이메일 형식을 확인해주세요.";
    if (!data.region) return "희망 지역을 선택해주세요.";
    if (!data.agree) return "개인정보 수집·이용에 동의해주세요.";
    return "";
  }

  function readForm() {
    const value = function (id) {
      const el = document.getElementById(id);
      return el ? String(el.value || "").trim() : "";
    };
    return {
      company: value("company"),
      name: value("name"),
      position: value("position"),
      phone: value("phone"),
      email: value("email"),
      region: value("region"),
      bizType: value("bizType"),
      items: value("items"),
      volume: value("volume"),
      message: value("message"),
      agree: document.getElementById("agree").checked,
      utm: {
        utm_source: utm.utm_source || "",
        utm_medium: utm.utm_medium || "",
        utm_campaign: utm.utm_campaign || "",
        utm_content: utm.utm_content || "",
        utm_term: utm.utm_term || "",
        landing: utm.landing || "",
        referrer: utm.referrer || ""
      }
    };
  }

  /* -------------------------------------------- 2) 제출 전환 이벤트 + 저장 */
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    const data = readForm();
    const message = validate(data);
    if (message) {
      errorBox.textContent = message;
      errorBox.classList.add("show");
      return;
    }
    errorBox.textContent = "";
    errorBox.classList.remove("show");

    submitBtn.disabled = true;
    submitBtn.textContent = "전송 중…";

    D.saveInquiry(data).then(function (result) {
      // 저장이 끝난 뒤에 제출 전환을 쏜다 (중복 클릭으로 두 번 집계되지 않게 버튼은 이미 잠겨 있다).
      D.trackConversion("submit", utm, {
        form_name: "dealer_inquiry",
        region: data.region,
        biz_type: data.bizType || "",
        storage: result.storage
      });

      form.classList.add("hidden");
      doneBox.classList.remove("hidden");
      doneUtm.textContent = "접수번호 " + result.saved.id + " · 유입 경로 " + D.utmLabel(data.utm);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }).catch(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = "계약문의 신청하기";
      errorBox.textContent = "전송에 실패했습니다. 잠시 후 다시 시도해주세요.";
      errorBox.classList.add("show");
    });
  });

  document.getElementById("againBtn").addEventListener("click", function () {
    form.reset();
    D.UTM_KEYS.forEach(function (key) {
      const input = document.getElementById(key);
      if (input) input.value = utm[key] || "";
    });
    submitBtn.disabled = false;
    submitBtn.textContent = "계약문의 신청하기";
    doneBox.classList.add("hidden");
    form.classList.remove("hidden");
    // 같은 방문에서 다시 신청하는 것이므로 접속 전환은 다시 쏘지 않는다.
  });
})();
