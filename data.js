/*
 * UTM_DATA
 * 기원엠알오(kiwonmro.com) / 기원툴스(kiwontools.com) 기존 UTM 대장(엑셀)을 기반으로 만든 데이터.
 * - platform: 광고 플랫폼 단위 (구글/네이버/카카오/메타/오프라인). 채널을 고르기 전에 먼저 선택한다.
 * - channel: 플랫폼 안의 광고 종류 단위. utm_medium은 채널에 고정된다 (요구사항 2: 기존과 동일하게 유지).
 *   channel.code는 utm_campaign 끝에 항상 붙는 플랫폼+매체 코드(예: 네이버 키워드=nakey).
 *   기존 대장에서 "nakey" 같은 접미사가 이미 이런 용도로 쓰이고 있어, 모든 채널에 필수로 확장했다.
 * - channel은 둘 중 하나를 갖는다:
 *   - variants: 목적/프로젝트가 곧바로 선택지인 단일 목록 (짧을 때 사용).
 *   - campaigns: [{ id, name, groups: [...] }] 형태로 캠페인(목적)과 그룹(신규/리마케팅 등)을 두 단계로 나눈 목록
 *     (조합이 많아 목록이 길어지는 채널에 사용 — 예: 카카오모먼트). 각 group의 모양은 variant와 동일하다.
 *     새 캠페인/그룹을 추가하려면 이 배열에 객체 하나만 추가하면 된다.
 *   최종 선택 항목(variant 또는 group)의 campaign 필드는 "{프로모션}_{채널코드}" 형식으로 저장하고
 *   (예: freesample_nakey, simtos_new_kamom), app.js가 실제 utm_campaign을 만들 때 여기에
 *   "{현재 소스}_{현재 미디움}_"을 앞에 붙여 "{소스}_{미디움}_{프로모션}_{채널코드}"를 완성한다.
 *   최종 선택 항목에 source가 없으면 channel의 defaultSource를 사용한다 (4번 utm_source 단계에서 수동으로 바꿀 수도 있다).
 * - pages: 사이트별 랜딩 페이지 프리셋 (기존 대장에 실제 쓰인 경로들).
 */
const UTM_DATA = {
  sites: [
    {
      id: "kiwonmro",
      name: "기원엠알오",
      domain: "kiwonmro.com",
      platforms: [
        { id: "kakao", name: "카카오" },
        { id: "naver", name: "네이버" }
      ],
      pages: [
        { id: "root", name: "메인페이지", path: "/" },
        { id: "cat218", name: "강용엔드밀 카테고리", path: "/product/list.html", params: { cate_no: "218" } },
        { id: "cat219", name: "고경도용 카테고리", path: "/product/list.html", params: { cate_no: "219" } },
        { id: "cat220", name: "SUS용 카테고리", path: "/product/list.html", params: { cate_no: "220" } },
        { id: "prod130", name: "외날엔드밀 상세", path: "/product/detail.html", params: { product_no: "130" } },
        { id: "prod136", name: "라핑엔드밀 상세", path: "/product/detail.html", params: { product_no: "136" } },
        { id: "prod231", name: "센터링엔드밀 상세", path: "/product/detail.html", params: { product_no: "231" } },
        { id: "prod224", name: "NC드릴 상세", path: "/product/detail.html", params: { product_no: "224" } },
        { id: "join", name: "회원가입(할인쿠폰)", path: "/member/join.html" },
        { id: "cat75", name: "장갑류 카테고리", path: "/product/list.html", params: { cate_no: "75" } },
        { id: "cat76", name: "마스크류 카테고리", path: "/product/list.html", params: { cate_no: "76" } },
        { id: "cat296", name: "보안경류 카테고리", path: "/product/list.html", params: { cate_no: "296" } },
        { id: "cat110", name: "청소위생용품류 카테고리", path: "/product/list.html", params: { cate_no: "110" } },
        { id: "cat119", name: "포장용품류 카테고리", path: "/product/list.html", params: { cate_no: "119" } },
        { id: "cat128", name: "연마용접부품 카테고리", path: "/product/list.html", params: { cate_no: "128" } },
        { id: "cat145", name: "방청윤활제 카테고리", path: "/product/list.html", params: { cate_no: "145" } }
      ],
      channels: [
        {
          id: "kakao_keyword",
          name: "카카오 키워드광고",
          platform: "kakao",
          medium: "kakao_keyword",
          defaultSource: "ads",
          code: "kakey",
          variants: [
            { id: "selling", name: "구매된 키워드", campaign: "selling_kakey" },
            { id: "general", name: "일반 키워드", campaign: "general_kakey" },
            { id: "conversion", name: "전환된 키워드", campaign: "conversion_kakey" }
          ]
        },
        {
          id: "naver_powerlink",
          name: "네이버 검색광고 (파워링크)",
          platform: "naver",
          medium: "naver_keyword_ads",
          defaultSource: "ads",
          code: "nakey",
          variants: [
            { id: "endmill", name: "엔드밀 그룹", campaign: "endmill_nakey" },
            { id: "chuck", name: "척 그룹", campaign: "chuck_nakey" }
          ]
        },
        {
          id: "naver_powercontents",
          name: "네이버 검색광고 (파워컨텐츠)",
          platform: "naver",
          medium: "naver_keyword_ads",
          defaultSource: "ads",
          code: "napc",
          fixedPagePerVariant: true,
          hasContentDate: true,
          variants: [
            { id: "gloves", name: "장갑류", campaign: "gloves_napc", page: "cat75", content: "20250907" },
            { id: "mask", name: "마스크류", campaign: "mask_napc", page: "cat76", content: "20250914" },
            { id: "glasses", name: "보안경류", campaign: "glasses_napc", page: "cat296", content: "20250910" },
            { id: "cleaning", name: "청소위생용품류", campaign: "cleaning_napc", page: "cat110", content: "20250918" },
            { id: "binding", name: "포장용품류", campaign: "binding_napc", page: "cat119", content: "20250918" },
            { id: "welding", name: "연마용접부품", campaign: "welding_napc", page: "cat128", content: "20250926" },
            { id: "antifriction", name: "방청윤활제", campaign: "antifriction_napc", page: "cat145", content: "20251002" }
          ]
        }
      ]
    },
    {
      id: "kiwontools",
      name: "기원툴스",
      domain: "kiwontools.com",
      platforms: [
        { id: "naver", name: "네이버" },
        { id: "kakao", name: "카카오" },
        { id: "google", name: "구글" },
        { id: "meta", name: "메타" },
        { id: "youtube", name: "유튜브" },
        { id: "offline", name: "오프라인" }
      ],
      pages: [
        { id: "root", name: "메인페이지", path: "/" },
        { id: "sampleform", name: "무료샘플 신청페이지", path: "/sampleform.html" },
        { id: "sampleform_simtos", name: "심토스 현장 샘플신청", path: "/shopinfo/simtos_sample.html" },
        { id: "catalog", name: "카달로그 페이지", path: "/shopinfo/sub3/sub3-2.html" },
        { id: "intro", name: "제품소개 페이지", path: "/shopinfo/sub3/sub3-1.html" },
        { id: "greeting", name: "인사말 페이지", path: "/shopinfo/sub1/sub1-1.html" },
        { id: "location", name: "오시는길 페이지", path: "/shopinfo/sub1/sub1-3.html" },
        { id: "dealer", name: "대리점계약문의 게시판", path: "/board/urgency/urgency2.html" },
        { id: "dealer_info", name: "대리점안내 페이지", path: "/shopinfo/sub1-4.html" },
        { id: "notice716", name: "공지사항(#716)", path: "/shop2/front/php/b/board_read.php", params: { board_no: "8", no: "716" } },
        { id: "cat348", name: "엔드밀 페이지 카테고리", path: "/product/list.html", params: { cate_no: "348" } },
        { id: "cat404", name: "PCD인서트 페이지 카테고리", path: "/product/list.html", params: { cate_no: "404" } },
        { id: "cat349", name: "툴링 페이지 카테고리", path: "/product/list.html", params: { cate_no: "349" } }
      ],
      channels: [
        {
          id: "naver_search",
          name: "네이버 검색광고",
          platform: "naver",
          medium: "naver_keyword_ads",
          defaultSource: "ads",
          code: "nakey",
          variants: [
            { id: "basic", name: "기본", campaign: "basic_nakey" },
            { id: "basic_remarketing", name: "기본 - 리마케팅", campaign: "basic_remarketing_nakey" },
            { id: "freesample", name: "무료샘플신청 프로모션", campaign: "freesample_nakey" },
            { id: "simtos", name: "심토스 전시회", source: "simtos", campaign: "simtos_nakey" }
          ]
        },
        {
          id: "naver_display",
          name: "네이버 디스플레이",
          platform: "naver",
          medium: "naver_display",
          defaultSource: "ads",
          code: "nadis",
          variants: [
            { id: "new", name: "기본 - 신규 (애드부스트오디언스)", campaign: "basic_new_nadis" },
            { id: "remarketing", name: "기본 - 리마케팅 (오디언스)", campaign: "basic_remarketing_nadis" },
            { id: "freesample_new", name: "무료샘플신청 - 신규 (애드부스트오디언스)", campaign: "freesample_new_nadis" },
            { id: "freesample_remarketing", name: "무료샘플신청 - 리마케팅 (오디언스)", campaign: "freesample_remarketing_nadis" },
            { id: "simtos", name: "심토스 전시회", source: "simtos", campaign: "simtos_nadis" }
          ]
        },
        {
          id: "kakao_moment",
          name: "카카오모먼트",
          platform: "kakao",
          medium: "kakao_moment_ads",
          defaultSource: "ads",
          code: "kamom",
          // 목록이 길어지지 않도록 캠페인(목적)과 그룹(신규/리마케팅/배치 등) 두 단계로 나눈다.
          campaigns: [
            {
              id: "basic",
              name: "기본",
              groups: [
                { id: "new", name: "신규", campaign: "basic_new_kamom" },
                { id: "remarketing", name: "리마케팅", campaign: "basic_remarketing_kamom" }
              ]
            },
            {
              id: "freesample",
              name: "무료샘플신청",
              groups: [
                { id: "new", name: "신규", campaign: "freesample_new_kamom" },
                { id: "remarketing", name: "리마케팅", campaign: "freesample_remarketing_kamom" },
                { id: "display", name: "디스플레이 배너", campaign: "freesample_display_kamom" },
                { id: "bizboard", name: "비즈보드", campaign: "freesample_bizboard_kamom" }
              ]
            },
            {
              id: "simtos",
              name: "심토스 전시회",
              groups: [
                { id: "new", name: "신규", source: "simtos", campaign: "simtos_new_kamom" },
                { id: "remarketing", name: "리마케팅", source: "simtos", campaign: "simtos_remarketing_kamom" }
              ]
            }
          ]
        },
        {
          id: "kakao_keyword",
          name: "카카오 키워드광고",
          platform: "kakao",
          medium: "kakao_keyword_ads",
          defaultSource: "ads",
          code: "kakey",
          variants: [
            { id: "freesample", name: "무료샘플신청 프로모션", campaign: "freesample_kakey" },
            { id: "simtos", name: "심토스 전시회", source: "simtos", campaign: "simtos_kakey" }
          ]
        },
        {
          id: "google_ads",
          name: "구글 검색광고",
          platform: "google",
          medium: "google_ads",
          defaultSource: "ads",
          code: "gakey",
          variants: [
            { id: "freesample", name: "무료샘플신청 프로모션", campaign: "freesample_gakey" },
            { id: "simtos", name: "심토스 전시회", source: "simtos", campaign: "simtos_gakey" }
          ]
        },
        {
          id: "meta_facebook",
          name: "메타 - 페이스북",
          platform: "meta",
          medium: "meta_facebook_ads",
          defaultSource: "ads",
          code: "mefb",
          variants: [
            { id: "freesample", name: "무료샘플신청 프로모션", campaign: "freesample_mefb" },
            { id: "simtos", name: "심토스 전시회", source: "simtos", campaign: "simtos_mefb" }
          ]
        },
        {
          id: "meta_instagram",
          name: "메타 - 인스타그램",
          platform: "meta",
          medium: "meta_instagram_ads",
          defaultSource: "ads",
          code: "meig",
          variants: [
            { id: "freesample", name: "무료샘플신청 프로모션", campaign: "freesample_meig" },
            { id: "simtos", name: "심토스 전시회", source: "simtos", campaign: "simtos_meig" }
          ]
        },
        {
          id: "meta_auto",
          name: "메타 - 자동 배치 (여러 플랫폼)",
          platform: "meta",
          medium: "meta_ads",
          defaultSource: "ads",
          code: "meauto",
          isMeta: true,
          variants: [
            { id: "freesample", name: "무료샘플신청 프로모션", campaign: "freesample_meauto" },
            { id: "simtos", name: "심토스 전시회", source: "simtos", campaign: "simtos_meauto" }
          ]
        },
        {
          id: "offline_qr",
          name: "오프라인 QR코드",
          platform: "offline",
          medium: "offline_qr",
          defaultSource: "kiwontools",
          code: "ofqr",
          variants: [
            { id: "main", name: "홈페이지 사은품 QR", campaign: "mainpage_ofqr", page: "root" },
            { id: "simtos_sample", name: "심토스 현장 샘플신청 QR", source: "simtos", campaign: "simtos_ofqr", page: "sampleform_simtos" }
          ]
        },
        {
          id: "youtube_pinned_comment",
          name: "유튜브 고정댓글",
          platform: "youtube",
          medium: "pinned_comment",
          defaultSource: "youtube",
          code: "ytpc",
          variants: [
            { id: "general", name: "일반", campaign: "general_ytpc" }
          ]
        },
        {
          id: "youtube_video_description",
          name: "유튜브 영상설명란",
          platform: "youtube",
          medium: "video_description",
          defaultSource: "youtube",
          code: "ytdesc",
          variants: [
            { id: "general", name: "일반", campaign: "general_ytdesc" }
          ]
        },
        {
          id: "youtube_community",
          name: "유튜브 커뮤니티",
          platform: "youtube",
          medium: "community_post",
          defaultSource: "youtube",
          code: "ytcp",
          variants: [
            { id: "general", name: "일반", campaign: "general_ytcp" }
          ]
        }
      ]
    }
  ],
  // 메타(Facebook/Instagram) 게재위치 구분용 - Meta Ads Manager의 동적 URL 매개변수(매크로)
  // https://www.facebook.com/business/help (URL 매개변수 만들기) 참고
  metaPlacementOptions: [
    { id: "none", name: "구분 안 함 (기존 방식 유지)", content: "" },
    { id: "platform", name: "FB / IG만 구분 (권장)", content: "{{site_source_name}}", note: "실제 게재 시 fb 또는 ig 값으로 자동 치환됩니다." },
    { id: "placement", name: "세부 게재위치까지 구분", content: "{{site_source_name}}_{{placement}}", note: "예: fb_facebook_reels, ig_instagram_story 등으로 자동 치환됩니다." },
    { id: "custom", name: "직접 입력", content: "" }
  ]
};
