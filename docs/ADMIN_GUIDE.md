# 관리자 · 사용자 매뉴얼

SSC 파트너 포털을 **일상적으로 운영**하는 방법. 최초 온보딩 → SSC 토큰 → 고객/도메인 → 리스크 점검 → 검증랩 증적 → 고객 리포트 전달까지의 업무 흐름을 다룬다.

- 화면별 정의·필드·API는 [화면정의서](SCREENS.md), 시스템 설계는 [ARCHITECTURE.md](ARCHITECTURE.md).
- **배포·장애 대응·백업**은 이 문서 범위 밖 — [../deploy/README.md](../deploy/README.md)(배포), [../deploy/RUNBOOK.md](../deploy/RUNBOOK.md)(운영/에러), [../backend/DEPLOY_SECURITY.md](../backend/DEPLOY_SECURITY.md)(보안 게이트).
- 랩 스튜디오(AI Lab Builder) 관리는 [LAB_STUDIO.md](LAB_STUDIO.md).

---

## 1. 최초 로그인 · 관리자 계정

- 백엔드 최초 기동 시 **시드 관리자**가 1회 생성된다(`seedDefaultUser`, `backend/src/auth.js`).
  - 이메일: `SEED_ADMIN_EMAIL`(기본 `admin@ssc.local`)
  - 비밀번호: `SEED_ADMIN_PASSWORD`(기본값은 데모용) — 이미 존재하면 재생성하지 않음
- **프로덕션 안전장치**: `NODE_ENV=production`에서 `AUTH_ACCESS_SECRET` 또는 `SEED_ADMIN_PASSWORD`가 미설정/기본값이면 부팅을 거부한다(`process.exit(1)`). 배포 전 두 값을 강한 랜덤값으로 설정할 것.
- 최초 로그인 후 **상단바 자물쇠 → 계정 보안**에서 비밀번호를 즉시 변경하고, 실제 담당자 계정을 **사용자 관리**에서 추가하라.

> 데모/개발 빌드에서만 로그인 화면에 데모 계정 힌트가 노출된다(`import.meta.env.DEV`). 배포본에는 노출되지 않는다.

---

## 2. 역할 · 권한

역할은 3종(`backend/src/authz.js`). 미지정 사용자는 `partner`로 정규화된다.

| 리소스 | admin | partner | viewer |
|---|:--:|:--:|:--:|
| customers · domains · findings · labs · guides · evidence (**읽기**) | ✅ | ✅ | ✅ |
| customers · domains · findings · labs · guides · evidence (**쓰기**) | ✅ | ✅ | — |
| settings · users · **랩 스튜디오** (읽기/쓰기) | ✅ | — | — |

- `viewer`는 **읽기 전용**: 프런트에서 쓰기 버튼이 숨겨지고(`app.can(...)`), 백엔드도 `requirePerm`으로 **403**을 반환한다(이중 게이트).
- 권한 거부는 **감사 로그(security 종류)**에 기록된다.
- 비밀번호 정책: 8자 이상 + 대문자·소문자·숫자·특수문자 중 **3종류 이상**.

### 세션
- **Access 토큰**(HS256 JWT, 프런트 메모리 보관): 기본 수명 짧음(약 5분). **Refresh 쿠키**(`ssc_rt`, httpOnly·`SameSite=Strict`·프로덕션 `Secure`): 유휴 기본 10분, 회전 + **재사용 탐지**(탈취 의심 시 family 전체 폐기).
- HTTP로 접속하면 `Secure` 쿠키가 동작하지 않아 새로고침 시 로그아웃된다 → **반드시 HTTPS로 접속**.
- 계정 보안 화면에서 기기별 세션을 개별 폐기하거나 "다른 모든 세션 종료" 가능.

---

## 3. SSC API 토큰 설정 (관리자)

리스크 수집의 전제. **사용자 관리 / 설정** 화면 또는 API로 등록한다.

- `PUT /api/settings/ssc-token` (관리자) — 토큰은 **AES-256-GCM 암호화** 저장(`settingsStore.js`). 상태 조회는 `****last4` + 출처만 반환하며 **원문은 절대 반환하지 않는다**.
- 우선순위: **DB 설정값 > `.env`의 `SSC_API_TOKEN`**.
- 미설정 시 수집은 `SSC_TOKEN_MISSING`으로 실패한다.

> ⚠️ **운영 주의**: 실 운영 토큰을 로컬/데모 환경 `.env`에 넣으면 그 PC에 평문으로 존재하고 실 포트폴리오 읽기 권한을 갖는다. 데모/캡처 용도라면 작업 후 토큰을 제거하거나 데모 계정 토큰을 쓰라. `.env`는 git 무시 대상이다.

---

## 4. 고객사 · 도메인 등록

### 고객사
- **고객사** 화면 → "+ 고객사 등록"(`POST /api/portal/customers`, perm `customers:write`).
- **필수는 고객사명(`name`)뿐**. 산업군·계약 상태·담당자·이메일·메모는 선택.

### 도메인
- **도메인 등록** 화면 → "+ 도메인 등록"(`POST /api/portal/domains`, perm `domains:write`).
- 필수: **고객사(`customer`)** + **서비스 주소**(`serviceEndpoint` 또는 `primary` 중 하나).
- 선택: `sscLookupDomain`(SSC 조회 기준), `accessUrl`(접속 검증 URL), 점검 허용/차단 범위(`allow[]`/`deny[]`).

### ★ apex 정규화 규칙 (중요 gotcha)
SSC 스코어카드는 **apex(최상위) 도메인 기준**으로 키가 잡힌다. 저장 시 `sscLookupDomain`이 **자동 정규화**된다(`cleanDomain`, `normSscLookup` in `server.js`):

- 스킴·사용자정보·경로·쿼리·포트·끝점(`.`) 제거
- **선행 `www.` 제거** → `www.posco.co.kr` → `posco.co.kr`

이 정규화는 **저장 시점과 조회 시점 모두** 적용되어 목록·리포트가 일관된다. 특정 도메인이 "조회 범위 밖(`SSC_SCOPE_DENIED`)"으로 나오면, 대상이 **apex 기준으로** SSC 포트폴리오/권한 범위에 있는지 확인하라(예: 포트폴리오에는 `posco.co.kr`로 편입돼 있는데 `www.posco.co.kr`로 조회하면 실패하던 문제가 이 규칙으로 해소됨).

---

## 5. 리스크 점검 (SSC 수집)

- **리스크 점검** 화면 → 도메인 행 클릭 → 드로어에서 "SSC 리스크 수집".
- SSC active-issues를 정규화해 **읽기 전용**으로 표시(자산 URL은 쿼리·자격증명 제거 후 위생 처리). API 조회 기준은 apex(`sscLookupDomain`).
- 결과는 점수/등급 + 조치 우선순위(점수 개선 여력 순)로 제공된다.
- 관련 오류코드(`SSC_UNAUTHORIZED`·`SSC_SCOPE_DENIED`·`SSC_RATE_LIMITED` 등)는 [RUNBOOK §3 SSC 연동](../deploy/RUNBOOK.md) 참조.

---

## 6. 검증랩 재현 → 증적

- **검증랩** 화면 → 도메인 클릭 → "이 대상의 리스크 항목 불러오기" → 재현할 항목 선택 → "검증랩에서 조치 전후 재현".
- Docker 격리 타깃에서 **같은 문제의 조치 전 → 조치 후**를 실제 명령으로 재현하고 증적을 캡처한다(5단계: 개요·조치 방법·조치 전/후·관측값·확인·마무리).
- 성공한 재현을 **대표 증적으로 지정**하면 증적 팩·리포트에 사용된다.
- **검증랩 미지원 유형**은 재현 대신 **조치 가이드**(개요·조치 방법·검증·마무리 4단계)로 제공된다.

> 검증랩 증적은 **참고 PoC**다 — 고객 운영환경의 실제 해소를 의미하지 않으며, 공식 확인은 **SSC 재스캔**으로 한다.

---

## 7. 증적 팩 · 고객 전달

### 증적 팩
- **증적 팩** 화면 → 고객사 클릭 → 검증랩 증적 + 조치 권고 + 리스크를 팩으로 묶음.

### 고객 전달 (리포트)
- **고객 전달 화면** → 고객사 "새 창으로 열기" → 2단계(리포트 검토 → 전달).
- **리포트 HTML 내보내기**(`POST /api/portal/report-export`): 등급·조치 우선순위·항목별 조치/증적을 **폰트·이미지까지 임베드한 자립형 단일 HTML 파일**로 생성한다(`backend/src/reportHtml.js`). 서버·로그인 없이 오프라인에서 열리며, **이 파일 하나를 고객에게 전달**(이메일 첨부 권장)한다. 앱이 직접 발송하지는 않는다.
- **개별 팩 공유 링크**(선택): 증적 1건만 공유. `PUT /api/portal/evidence-packs/:id`로 `shareToken` 발급 → 고객은 로그인 없이 `#share=<token>`으로 열람(`GET /api/public/shared/:token`, 레이트리밋 30/분, **30일 만료** 후 `LINK_EXPIRED`).

---

## 8. 사용자 관리 · 감사 로그

- **사용자 관리**(관리자 전용): 계정 생성·역할 변경·비밀번호 재설정. **마지막 관리자**는 강등/삭제가 차단된다(`LAST_ADMIN`).
- **감사 로그**: 사용자 행위 / 보안(인증·권한 거부) / 시스템(운영·DB) 이벤트를 실제 기록. `GET /api/audit?kind=user|security|system`.
  - 로그에는 **토큰·비밀번호가 남지 않는다**(상태·식별자만).
  - `system` 종류에서 `persistence: PostgreSQL`인지 확인 — `파일 폴백`이면 DB 연결 실패 상태(→ [RUNBOOK §2](../deploy/RUNBOOK.md)).

---

## 9. 일상 업무 흐름 요약

```
고객사 등록 → 도메인/스코프(apex 규칙) → SSC 리스크 수집
   → 검증랩 조치 전·후 재현(증적) 또는 조치 가이드
   → 증적 팩 → 고객 전달 리포트(단일 HTML/메일)
   → SSC 재스캔으로 공식 해소 확인
```

배포·백업·장애 대응은 [../deploy/RUNBOOK.md](../deploy/RUNBOOK.md)를 따르라.
