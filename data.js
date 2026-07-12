/*
 * UTM_DATA
 * 기원엠알오(kiwonmro.com) / 기원툴스(kiwontools.com) 기존 UTM 대장(엑셀)을 기반으로 만든 데이터.
 * - platform: 광고 플랫폼 단위 (구글/네이버/카카오/메타/오프라인). 채널을 고르기 전에 먼저 선택한다.
 * - channel: 플랫폼 안의 광고 종류 단위. utm_medium은 채널에 고정된다 (요구사항 2: 기존과 동일하게 유지).
 * - variant: 채널 안에서 목적/프로젝트 단위. utm_campaign은 variant에 따라 달라진다 (요구사항 2: 프로젝트에 따라 캠페인만 수정).
 *   variant.source가 없으면 channel의 defaultSource를 사용한다.
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
          variants: [
            { id: "selling", name: "구매된 키워드", campaign: "selling_group_kakey" },
            { id: "general", name: "일반 키워드", campaign: "general_group_kakey" },
            { id: "conversion", name: "전환된 키워드", campaign: "conversion_group_kakey" }
          ]
        },
        {
          id: "naver_powerlink",
          name: "네이버 검색광고 (파워링크)",
          platform: "naver",
          medium: "naver_keyword_ads",
          defaultSource: "ads",
          variants: [
            { id: "endmill", name: "엔드밀 그룹", campaign: "powerlink_endmill_group_nakey" },
            { id: "chuck", name: "척 그룹", campaign: "powerlink_chuck_group_nakey" }
          ]
        },
        {
          id: "naver_powercontents",
          name: "네이버 검색광고 (파워컨텐츠)",
          platform: "naver",
          medium: "naver_keyword_ads",
          defaultSource: "ads",
          fixedPagePerVariant: true,
          hasContentDate: true,
          variants: [
            { id: "gloves", name: "장갑류", campaign: "powercontents_gloves_group_nakey", page: "cat75", content: "20250907" },
            { id: "mask", name: "마스크류", campaign: "powecontents_mask_group_nakey", page: "cat76", content: "20250914" },
            { id: "glasses", name: "보안경류", campaign: "powecontents_glasses_group_nakey", page: "cat296", content: "20250910" },
            { id: "cleaning", name: "청소위생용품류", campaign: "powecontents_cleaningsupplies_group_nakey", page: "cat110", content: "20250918" },
            { id: "binding", name: "포장용품류", campaign: "powecontents_bindingproducts_group_nakey", page: "cat119", content: "20250918" },
            { id: "welding", name: "연마용접부품", campaign: "powecontents_weldingproducts_group_nakey", page: "cat128", content: "20250926" },
            { id: "antifriction", name: "방청윤활제", campaign: "powecontents_antifriction_group_nakey", page: "cat145", content: "20251002" }
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
          variants: [
            { id: "basic", name: "기본", campaign: "powerlink_group_nakey" },
            { id: "basic_remarketing", name: "기본 - 리마케팅", campaign: "powerlink_remarketing_nakey" },
            { id: "freesample", name: "무료샘플신청 프로모션", campaign: "free_sample_powerlink" },
            { id: "simtos", name: "심토스 전시회", source: "simtos", campaign: "powerlink_nav_key_simtos" }
          ]
        },
        {
          id: "naver_display",
          name: "네이버 디스플레이 (GFA)",
          platform: "naver",
          medium: "naver_gfa",
          defaultSource: "ads",
          variants: [
            { id: "new_audience", name: "기본 - 신규 - 오디언스", campaign: "audience_group_new_naperform" },
            { id: "new_advoost", name: "기본 - 신규 - 애드부스트오디언스", campaign: "advoostaudience_group_new_naperform" },
            { id: "remarket_audience", name: "기본 - 리마케팅 - 오디언스", campaign: "audience_group_remarketing_naperform" },
            { id: "remarket_advoost", name: "기본 - 리마케팅 - 애드부스트오디언스", campaign: "advoostaudience_group_remarketing_naperform" },
            { id: "freesample_new_audience", name: "무료샘플신청 - 신규 - 오디언스", campaign: "free_sample_audience" },
            { id: "freesample_new_advoost", name: "무료샘플신청 - 신규 - 애드부스트오디언스", campaign: "free_sample_advoost" },
            { id: "freesample_remarket_audience", name: "무료샘플신청 - 리마케팅 - 오디언스", campaign: "free_remarket_sample_audience" },
            { id: "freesample_remarket_advoost", name: "무료샘플신청 - 리마케팅 - 애드부스트오디언스", campaign: "free_remarket_sample_advoost" },
            { id: "simtos", name: "심토스 전시회", source: "simtos", campaign: "ADVoost_nav_GFA_simtos" }
          ]
        },
        {
          id: "kakao_moment",
          name: "카카오모먼트",
          platform: "kakao",
          medium: "kakao_moment_ads",
          defaultSource: "ads",
          variants: [
            { id: "new", name: "기본 - 신규", campaign: "display_group_newuser_kamom" },
            { id: "remarketing", name: "기본 - 리마케팅", campaign: "display_group_remarketing_kamom" },
            { id: "freesample_new", name: "무료샘플신청 - 신규", campaign: "free_sample_moment" },
            { id: "freesample_remarketing", name: "무료샘플신청 - 리마케팅", campaign: "free_remarket_sample_moment" },
            { id: "simtos_new", name: "심토스 - 신규", source: "simtos", campaign: "display_newuser_ka_mom_simtos" },
            { id: "simtos_remarketing", name: "심토스 - 리마케팅", source: "simtos", campaign: "display_remarket_ka_mom_simtos" },
            { id: "display_freesample", name: "디스플레이 배너 - 무료샘플신청", campaign: "free_sample_display" },
            { id: "bizboard_freesample", name: "비즈보드 - 무료샘플신청", campaign: "free_sample_bizboard" }
          ]
        },
        {
          id: "kakao_keyword",
          name: "카카오 키워드광고",
          platform: "kakao",
          medium: "kakao_keyword_ads",
          defaultSource: "ads",
          variants: [
            { id: "freesample", name: "무료샘플신청 프로모션", campaign: "free_sample_keyword" },
            { id: "simtos", name: "심토스 전시회", source: "simtos", campaign: "keyword_ka_key_simtos" }
          ]
        },
        {
          id: "google_ads",
          name: "구글 검색광고",
          platform: "google",
          medium: "google_ads",
          defaultSource: "ads",
          variants: [
            { id: "freesample", name: "무료샘플신청 프로모션", campaign: "free_sample_search" },
            { id: "simtos", name: "심토스 전시회", source: "simtos", campaign: "Assets_google_ads_simtos" }
          ]
        },
        {
          id: "meta_facebook",
          name: "메타 - 페이스북",
          platform: "meta",
          medium: "meta_facebook_ads",
          defaultSource: "ads",
          variants: [
            { id: "freesample", name: "무료샘플신청 프로모션", campaign: "free_sample_meta" },
            { id: "simtos", name: "심토스 전시회", source: "simtos", campaign: "post_meta_ads_simtos" }
          ]
        },
        {
          id: "meta_instagram",
          name: "메타 - 인스타그램",
          platform: "meta",
          medium: "meta_instagram_ads",
          defaultSource: "ads",
          variants: [
            { id: "freesample", name: "무료샘플신청 프로모션", campaign: "free_sample_meta" },
            { id: "simtos", name: "심토스 전시회", source: "simtos", campaign: "post_meta_ads_simtos" }
          ]
        },
        {
          id: "meta_auto",
          name: "메타 - 자동 배치 (여러 플랫폼)",
          platform: "meta",
          medium: "meta_ads",
          defaultSource: "ads",
          isMeta: true,
          variants: [
            { id: "freesample", name: "무료샘플신청 프로모션", campaign: "free_sample_meta" },
            { id: "simtos", name: "심토스 전시회", source: "simtos", campaign: "post_meta_ads_simtos" }
          ]
        },
        {
          id: "offline_qr",
          name: "오프라인 QR코드",
          platform: "offline",
          medium: "offline_qr",
          defaultSource: "kiwontools",
          variants: [
            { id: "main", name: "홈페이지 사은품 QR", campaign: "mainpage_qr", page: "root" },
            { id: "simtos_sample", name: "심토스 현장 샘플신청 QR", source: "simtos", campaign: "sample_order_qr", page: "sampleform_simtos" }
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
