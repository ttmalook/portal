# 관리자 · 사용자 매뉴얼 (화면별 진행 가이드)

SSC 파트너 포털을 실제 화면을 보며 **단계별로 진행**하는 방법. 최초 설정부터 고객 리포트 전달까지의 업무 흐름을 스크린샷과 함께 따라간다.

- 화면별 정의·API는 [화면정의서](SCREENS.md), 시스템 설계는 [ARCHITECTURE.md](ARCHITECTURE.md), AI Lab Builder는 [랩 스튜디오](LAB_STUDIO.md).
- **배포·장애 대응·백업**은 이 문서 밖 — [deploy/README.md](../deploy/README.md) · [deploy/RUNBOOK.md](../deploy/RUNBOOK.md) · [backend/DEPLOY_SECURITY.md](../backend/DEPLOY_SECURITY.md).

## 진행 순서 한눈에

```
[사전] 로그인 → SSC 토큰 설정 → 담당자 계정 추가
[본류] 고객사 등록 → 도메인·범위(apex) → 리스크 점검(SSC 수집)
       → 검증랩 조치 전·후 재현(증적) / 조치 가이드
       → 증적 팩 → 고객 전달 리포트(단일 HTML) → SSC 재스캔으로 공식 확인
```

---

## STEP 0. 로그인

![로그인 화면](screens/00_login.jpg)

1. 브라우저에서 포털 주소로 접속한다(**반드시 HTTPS** — HTTP로 접속하면 세션 쿠키가 동작하지 않아 새로고침 시 로그아웃된다).
2. 이메일·비밀번호를 입력하고 **로그인**.
3. 최초 관리자 계정은 백엔드 최초 기동 시 1회 생성된다(기본 이메일 `admin@ssc.local`). **최초 로그인 후 STEP 0-A에서 비밀번호를 즉시 변경**하라.

> 프로덕션은 `AUTH_ACCESS_SECRET`·`SEED_ADMIN_PASSWORD`가 미설정/기본값이면 부팅을 거부한다(안전장치). 배포 전 강한 값으로 설정할 것.

### STEP 0-A. 비밀번호 변경 (상단바 자물쇠 → 계정 보안)

![계정 보안](screens/12_account.jpg)

- 현재/새 비밀번호 입력 → **변경**. 정책: 8자 이상 + 대문자·소문자·숫자·특수문자 중 **3종류 이상**.
- 변경 시 **모든 기기 세션이 로그아웃**된다. 낯선 기기가 보이면 개별 폐기 또는 "다른 모든 세션 종료".

---

## STEP 1. 대시보드에서 현황 확인

![대시보드](screens/01_dashboard.jpg)

- 로그인 직후 진입 화면. 등록 고객사별 **보안등급(A~F)**, 이슈 위험도 분포, 증적 팩 현황, 최근 활동(실 감사 로그)을 요약한다.
- 상단 운영 프로세스 단계를 클릭하면 해당 화면으로 이동한다.

---

## 사전 설정 (관리자 1회)

### STEP A. SSC API 토큰 설정 — 리스크 수집의 전제

토큰이 없으면 리스크 수집이 `SSC_TOKEN_MISSING`으로 실패한다. **사용자 관리** 화면에서 설정한다.

![사용자 관리](screens/10_users.jpg)

1. **사용자 관리**(관리자 전용) → 관리자 계정 행 클릭 → 상세에서 **SSC API 토큰 카드**.
2. 토큰 입력 후 저장. 토큰은 **AES-256-GCM 암호화** 저장되며 **원문은 다시 표시되지 않는다**(상태는 `****last4` + 출처만 노출). 조직 공용값이다.
3. 우선순위: **DB 설정값 > `.env`의 `SSC_API_TOKEN`**.

> ⚠️ 실 운영 토큰을 로컬/데모 `.env`에 넣으면 그 PC에 평문으로 남고 실 포트폴리오 읽기 권한을 갖는다. 데모/캡처용이면 작업 후 제거하거나 데모 계정 토큰을 쓰라(`.env`는 git 무시 대상).

### STEP B. 담당자 계정 추가

- 같은 **사용자 관리** 화면 → "+ 사용자 추가" → 이메일·이름·역할 지정.
- 역할은 3종: **admin**(전체+설정·사용자·랩 스튜디오) · **partner**(읽기+쓰기) · **viewer**(읽기 전용). 자세한 매트릭스는 [문서 하단](#역할--권한-요약) 참조.

---

## STEP 2. 고객사 등록

![고객사 목록](screens/02_customers.jpg)

1. **고객사** 화면 → 우측 상단 **+ 고객사 등록**.

![신규 고객사 등록](screens/m01_customer_wizard.jpg)

2. **고객사명만 필수**. 산업군·계약 상태·담당자·이메일·메모는 선택.
3. **등록**. (권한: admin/partner. viewer는 버튼이 보이지 않는다.)

---

## STEP 3. 도메인 · 점검 범위 등록

![도메인 등록](screens/03_domains.jpg)

1. **도메인 등록** 화면 → **+ 도메인 등록**.

![도메인 등록 모달](screens/m02_domain_modal.jpg)

2. **고객사** 선택 + **서비스 주소**(도메인, 필수) 입력. 접속 검증 URL·점검 허용/차단 범위는 선택.
3. **도메인 등록**.

> ### ★ apex 정규화 규칙 (중요)
> SSC 스코어카드는 **apex(최상위) 도메인 기준**으로 키가 잡힌다. 저장 시 SSC 조회 기준(`sscLookupDomain`)이 자동 정규화된다 — 스킴·경로·포트·**선행 `www.`** 제거. 예: `www.posco.co.kr` → `posco.co.kr`.
>
> 특정 도메인이 **"조회 범위 밖(`SSC_SCOPE_DENIED`)"**으로 나오면, 대상이 **apex 기준으로** SSC 포트폴리오/권한 범위에 있는지 확인하라. (포트폴리오에 `posco.co.kr`로 편입돼 있는데 `www.posco.co.kr`로 조회하면 실패하던 문제가 이 규칙으로 해소된다.)

---

## STEP 4. 리스크 점검 (SSC 수집)

![리스크 점검](screens/04_findings.jpg)

1. **리스크 점검** 화면 → 대상 도메인 행 클릭.

![리스크 점검 드로어](screens/d01_risk_drawer.jpg)

2. 드로어에서 **SSC 리스크 수집**. SSC active-issues를 정규화해 **읽기 전용**으로 표시(자산 URL은 쿼리·자격증명 제거 후 위생 처리, 조회 기준은 apex).
3. 결과는 점수/등급 + **조치 우선순위(점수 개선 여력 순)**로 정리된다.

> 오류코드(`SSC_UNAUTHORIZED`·`SSC_SCOPE_DENIED`·`SSC_RATE_LIMITED` 등) 대응은 [RUNBOOK §3](../deploy/RUNBOOK.md) 참조.

---

## STEP 5. 검증랩 재현 → 조치 전·후 증적

![검증랩](screens/05_lab.jpg)

1. **검증랩** 화면 → 도메인 클릭 → 드로어.

![검증랩 드로어](screens/d03_lab_drawer.jpg)

2. **이 대상의 리스크 항목 불러오기** → **재현할 항목 선택** → **검증랩에서 조치 전후 재현**.
3. Docker 격리 타깃에서 같은 문제의 **조치 전 → 조치 후**를 실제 명령으로 재현하고 증적을 캡처한다. "증적 보기"로 5단계 증적을 확인한다:

| 1 개요 | 2 조치 방법 | 3 조치 전/후 | 4 관측값·확인 | 5 마무리 |
|:--:|:--:|:--:|:--:|:--:|
| ![](screens/e01_overview.jpg) | ![](screens/e02_fix.jpg) | ![](screens/e03_beforeafter.jpg) | ![](screens/e04_observe.jpg) | ![](screens/e05_wrap.jpg) |

4. 성공한 재현을 **대표 증적으로 지정**하면 증적 팩·리포트에 사용된다.

> 검증랩 증적은 **참고 PoC**다 — 고객 운영환경의 실제 해소를 의미하지 않으며, 공식 확인은 **SSC 재스캔**으로 한다.

### 검증랩 미지원 유형 → 조치 가이드

검증랩에서 재현 템플릿이 없는 유형은 **조치 가이드**로 제공된다. **조치 가이드** 화면 → 대상 클릭 → 유형 선택 → 4단계(개요·조치 방법·검증·마무리):

![조치 가이드 목록](screens/06_guides_page.jpg)
![조치 가이드 4단계 드로어](screens/06_guides.jpg)

---

## STEP 6. 증적 팩 구성

![증적 팩](screens/07_packs.jpg)

1. **증적 팩** 화면 → 고객사 클릭 → 드로어.

![증적 팩 드로어](screens/d02_pack_drawer.jpg)

2. 검증랩 증적 + 조치 권고 + 리스크를 고객사별 팩으로 묶는다.

---

## STEP 7. 고객 전달

![고객 전달 화면](screens/08_delivery.jpg)

1. **고객 전달 화면** → 고객사 **새 창으로 열기** → 2단계 뷰어.

![리포트 검토(1단계)](screens/r01_review.jpg)

2. **1단계 리포트 검토**: 등급·조치 우선순위를 확인한다. 항목 클릭 시 상세(개요·조치·증적) 드릴인:

![이슈 드릴인](screens/r02_drill.jpg)

3. **2단계 전달**: 전달 요약 확인 후 리포트를 내보내거나 이메일(mailto)로 전달한다.

![전달(2단계)](screens/r03_deliver.jpg)

### STEP 7-A. 리포트 HTML 내보내기 (권장)

**리포트 HTML 내보내기**를 누르면 등급·조치 우선순위·항목별 조치/증적을 **폰트·이미지까지 임베드한 자립형 단일 HTML 파일**로 저장한다. 서버·로그인 없이 오프라인에서 열리며, **이 파일 하나를 고객에게 전달**(이메일 첨부)한다. 앱이 직접 발송하지는 않는다.

| 표지 | 요약(Executive) | 항목 상세 |
|:--:|:--:|:--:|
| ![](screens/08b_report_cover.jpg) | ![](screens/08c_report_summary.jpg) | ![](screens/08d_report_detail.jpg) |

### STEP 7-B. 개별 팩 공유 링크 (선택)

증적 1건만 콕 집어 공유할 때: 전달 2단계 하단에서 **링크 복사**. 고객은 로그인 없이 `#share=<token>`으로 열람한다(레이트리밋 30/분, **30일 만료** 후 `LINK_EXPIRED`).

---

## 관리 화면

### 감사 로그

![감사 로그](screens/09_audit.jpg)

- 사용자 행위 / 보안(인증·권한 거부) / 시스템(운영·DB) 이벤트를 실제 기록(`GET /api/audit?kind=user|security|system`).
- **토큰·비밀번호는 로그에 남지 않는다**(상태·식별자만). `system` 종류에서 `persistence: PostgreSQL`인지 확인 — `파일 폴백`이면 DB 연결 실패 상태([RUNBOOK §2](../deploy/RUNBOOK.md)).

### 사용자 관리

![사용자 관리](screens/10_users.jpg)

- 계정 생성·역할 변경·비밀번호 재설정. **마지막 관리자**는 강등/삭제가 차단된다(`LAST_ADMIN`). SSC 토큰 카드도 여기(관리자 상세)에 있다(STEP A).

---

## 역할 · 권한 요약

| 리소스 | admin | partner | viewer |
|---|:--:|:--:|:--:|
| customers · domains · findings · labs · guides · evidence (**읽기**) | ✅ | ✅ | ✅ |
| customers · domains · findings · labs · guides · evidence (**쓰기**) | ✅ | ✅ | — |
| settings · users · **랩 스튜디오** | ✅ | — | — |

- `viewer`는 읽기 전용 — 프런트에서 쓰기 버튼이 숨겨지고(`app.can`) 백엔드도 `requirePerm`으로 **403**(이중 게이트). 권한 거부는 **감사 로그(security)**에 기록된다.
- 세션: Access 토큰(짧은 수명, 프런트 메모리) + Refresh 쿠키(`ssc_rt`, httpOnly·SameSite=Strict·프로덕션 Secure, 회전+재사용 탐지). **HTTPS 필수**.
