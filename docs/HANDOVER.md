# 인수인계서 (HANDOVER)

**후임 엔지니어를 위한 단일 진입점.** 이 문서 하나로 시작해서, 필요할 때 세부 문서로 내려가면 됩니다. 왜 이렇게 만들었는지는 [DECISIONS.md](DECISIONS.md), 다음에 할 일은 [ROADMAP.md](ROADMAP.md).

> **먼저 읽으세요**: [README](../README.md)(무엇을·왜) → 이 문서(어떻게 이어서) → [ARCHITECTURE](ARCHITECTURE.md)(시스템) → [DATABASE](DATABASE.md)(데이터).

---

## 1. 한 줄 요약

보안 파트너사가 고객 도메인의 **SecurityScorecard(외부 관측) 리스크**를 수집 → **검증랩(Docker)**에서 조치 전·후를 재현해 참고 증적 생성 → **고객 리포트**로 전달하는 풀스택 포털. React/Vite(:5180) + Express/ESM(:8787) + PostgreSQL + Docker 검증랩.

---

## 2. 첫 1주 로드맵

| 일 | 목표 |
|---|---|
| 1 | 이 문서 + README + ARCHITECTURE 통독. GitHub 클론, 로컬 실행(§3)까지 |
| 2 | 화면정의서([SCREENS](SCREENS.md)) 보며 UI 한 바퀴. admin 로그인 → 대시보드~고객전달까지 클릭 |
| 3 | [DATABASE](DATABASE.md)로 데이터 모델 이해. `db.js` 문서 스토어 구조 파악 |
| 4 | 리스크 점검 1건 실제 수행(SSC 토큰 필요) → 검증랩 재현 1건 → 리포트 내보내기까지 엔드투엔드 |
| 5 | [DECISIONS](DECISIONS.md) 통독(왜 이렇게). [ROADMAP](ROADMAP.md)에서 첫 작업 고르기 |

---

## 3. 개발 환경 셋업

```bash
# 0) 클론
git clone https://github.com/ttmalook/portal.git && cd portal   # (repo 루트 = 이 폴더)

# 1) 검증랩 스택(Docker) — 증적 재현에 필요
cd lab && docker compose up -d && cd ..

# 2) 백엔드 (:8787)
cd backend && npm install
cp .env.example .env        # PGPASSWORD·AUTH_ACCESS_SECRET·SEED_ADMIN_PASSWORD·SSC_API_TOKEN 채우기
npm run dev                 # node --watch src/server.js
cd ..

# 3) 프론트엔드 (:5180)
npm install
npm run dev -- --port 5180 --strictPort
```
- **로컬 기본 계정**: `admin@ssc.local` / `SEED_ADMIN_PASSWORD`(기본 `ssc-demo-1234`). 최초 로그인 후 변경.
- **DB**: 미연결 시 자동으로 `backend/data/*.json` 파일 폴백(앱 안 죽음). PostgreSQL 쓰려면 `.env`의 `PG*` 설정.
- **SSC 토큰**: 리스크 점검하려면 관리자 화면(사용자 관리 → 관리자 상세)에서 SSC API 토큰 설정, 또는 `.env`의 `SSC_API_TOKEN`.
- **주의(포트)**: `.claude/launch.json`·README는 5180을 쓰지만 `vite.config.js` 기본은 5173 → `--port 5180`로 명시 실행 권장([ROADMAP](ROADMAP.md) 참조).

---

## 4. 코드 지도

### 프론트엔드 `src/`
| 파일 | 역할 |
|---|---|
| `App.jsx` | 루트 · 인증 게이트 · 라우팅(`#report=`) · 네비 · `app` 컨텍스트(`app.can(...)`, 데이터) |
| `pages/Pages.jsx` | 대부분 화면(대시보드·고객사·도메인·리스크점검·조치가이드·증적팩·고객전달/리포트뷰어·감사로그·사용자관리) + 드로어 |
| `pages/LabStudio.jsx` | AI Lab Builder 관리자 UI |
| `pages/ApiDocs.jsx` | OpenAPI(Swagger) |
| `features/Lab.jsx` | 검증랩 실행 · 증적 5단계 스테퍼 |
| `features/SscApi.jsx` | SSC 수집 UI · 증적 팩 생성 |
| `features/Registration.jsx` | 고객사·도메인·계정 모달 |
| `lib/apiCall.js` | fetch 래퍼(access 토큰 부착 · 401 refresh 재시도) |
| `lib/portalApi.js` · `sscApi.js` · `sscFindings.js` · `labApi.js` · `adminLabApi.js` | API 클라이언트 |
| `data/` | `sandboxCatalog.js`·`remediationSteps.js`·`engineGuides.js`·`compliance.js`(유형 카탈로그·조치·엔진별·컴플라이언스) |

### 백엔드 `backend/src/`
| 파일 | 역할 |
|---|---|
| `server.js` | 모든 Express 라우트 + 기동(`start()`) |
| `db.js` | Postgres **문서 스토어**(10 테이블) + 파일 폴백 |
| `auth.js` · `authStore.js` · `authz.js` | 로그인/refresh/scrypt/시드관리자 · 사용자 저장 · **RBAC(`requirePerm`)** |
| `portalStore.js` · `auditStore.js` · `settingsStore.js` | 고객/도메인/증적팩 · 감사로그 · **암호화 설정(SSC·Claude 키)** |
| `securityScorecardIssueCollector.js` | **SSC API 클라이언트** · 이슈 수집 · 유형 카탈로그 |
| `lab.js` | 검증랩 오케스트레이터(TEMPLATES 50종 · collector 모드) |
| `labRecipes/Classifier/Profiles/Coverage/RecipeCompiler/Renderer/ValidationGate.js` | **AI Lab Builder**([LAB_STUDIO](LAB_STUDIO.md)) |
| `claudeClient.js` · `guideInterpret.js` | Claude API · 가이드 쉬운말 해석(ollama/캐시) |
| `reportHtml.js` | 리포트 HTML 생성 + `wrapEncrypted`(열람 암호) |
| `remediationGuides.js` | GUIDES — 조치 방향 SSOT(검증랩·리포트 공유) |
| `validate.js` | 입력 스키마(zod) |

### 데이터 흐름(핵심 3개)
- **리스크 점검**: 프론트 → `POST /api/integrations/securityscorecard/risk-findings/collect` → `securityScorecardIssueCollector` → SSC API → 정규화 → 프론트.
- **검증랩 재현**: `Lab.jsx` → `POST /api/lab/runs` → `lab.js` → collector(docker `evidence-collector` 또는 simulated) → 증적 저장.
- **리포트 전달**: `DeliveryReportViewer` → `POST /api/portal/report-export` → `server.js`가 항목 조립 → `reportHtml.buildReportHtml` → (암호 시 `wrapEncrypted`) → 파일 다운로드.

---

## 5. 확장 레시피 (자주 하는 작업)

### A. 새 SSC 이슈 유형 지원
1. **검증랩 재현 가능**(http_header·network 계열): **랩 스튜디오**에서 SSC 유형 선택 → 분류 → 레시피 컴파일(Claude) → 게이트 → 승인 → 자동 채택([LAB_STUDIO](LAB_STUDIO.md)).
2. **수동/그 외 계열**: `lab.js`의 `TEMPLATES`(재현 템플릿) · `remediationGuides.js`의 `GUIDES`(조치 방향) · `data/sandboxCatalog.js`(한글명·분류) · `data/engineGuides.js`(엔진별 조치) 순으로 추가. 커버리지 확인: `node backend/scripts/labCoverageAudit.mjs`.

### B. 새 화면 추가
`src/pages/Pages.jsx`에 컴포넌트 → `App.jsx`의 NAV/라우팅 등록(관리자 전용은 `adminOnly`) → 필요 시 `requirePerm`으로 백엔드 보호 → [SCREENS.md](SCREENS.md) 갱신.

### C. 검증랩 게이트 확인
`node backend/scripts/labValidationGate.mjs --all` → 50/50 PASS 유지가 회귀 기준.

---

## 6. 함정 · 암묵지 (모르면 헤맴)

- **apex 정규화**: SSC는 apex 도메인 기준 → `cleanDomain`이 `www.` 등을 제거(`www.posco.co.kr`→`posco.co.kr`). "조회 범위 밖"이면 apex 기준 포트폴리오 확인([DECISIONS](DECISIONS.md) ADR-02).
- **dev 포트 5180 vs 5173**: launch.json/README=5180, vite.config=5173 → `--port 5180` 명시([ROADMAP](ROADMAP.md)).
- **검증랩은 Docker 필요**: `LAB_COLLECTOR=docker` + 랩 스택이 떠 있어야 실제 증적. 없으면 simulated 폴백.
- **실 SSC 토큰 취급**: 실 운영 토큰을 로컬 `.env`에 넣으면 그 PC에 평문 존재 + 실 포트폴리오 읽기 권한. 데모엔 데모 토큰 권장. `.env`는 gitignore.
- **증적랩 = 참고 PoC**: 고객 운영환경 실 해소 아님. 공식 확인은 SSC 재스캔([DECISIONS](DECISIONS.md) ADR-03).
- **프로덕션 부팅 안전장치**: `NODE_ENV=production`에서 `AUTH_ACCESS_SECRET`·`SEED_ADMIN_PASSWORD` 미설정/기본값이면 기동 거부(의도된 것).
- **레거시 필드**: `evidence_packs`의 `publish`·`customerViewed`는 게시링크 폐지로 미사용(잔재).

---

## 7. 외부 의존 · 시크릿 "위치" (값은 별도 위임)

| 항목 | 위치 | 비고 |
|---|---|---|
| SSC API 토큰 | 관리자 화면(암호화 DB) 또는 `backend/.env` `SSC_API_TOKEN` | **읽기 전용** 연동. SSC 계정 위임 필요 |
| Claude API 키 | 관리자 화면(암호화) 또는 `.env` `ANTHROPIC_API_KEY` | AI Lab Builder(선택) |
| ollama | `:11434` 컨테이너 | 가이드 쉬운말 해석(선택) |
| DB 비밀번호 | 각 VM `.env` `PGPASSWORD` | 계정 `ssc` / DB `ssc_portal` |
| JWT 시크릿·시드 비번 | `.env` `AUTH_ACCESS_SECRET`·`SEED_ADMIN_PASSWORD` | 강한 랜덤값 |
| **TLS 인증서** | Let's Encrypt DNS-01 **수동** | ⚠️ **2026-10-21 만료 — 갱신 안 하면 서비스 중단**([ROADMAP](ROADMAP.md) P1) |

> 실제 값은 문서·저장소에 남기지 말고 **후임에게 직접(비밀번호 관리자 등)** 위임하세요.

---

## 8. 문서 지도 (언제 무엇을)

| 상황 | 문서 |
|---|---|
| 시스템 이해 | [ARCHITECTURE](ARCHITECTURE.md) · [DATABASE](DATABASE.md) · [SCREENS](SCREENS.md) |
| 왜 이렇게 | **[DECISIONS](DECISIONS.md)** |
| 다음 할 일 | **[ROADMAP](ROADMAP.md)** |
| 요구사항·검증 | [REQUIREMENTS](REQUIREMENTS.md) · [TEST_RESULTS](TEST_RESULTS.md) |
| AI Lab Builder | [LAB_STUDIO](LAB_STUDIO.md) |
| 배포·장애 | [deploy/RUNBOOK](../deploy/RUNBOOK.md) · [deploy/CONTAINERS](../deploy/CONTAINERS.md) · [backend/DEPLOY_SECURITY](../backend/DEPLOY_SECURITY.md) |
| 운영 사용법 | [ADMIN_GUIDE](ADMIN_GUIDE.md) · 사용자매뉴얼 PPT |

> `docs/SSC_*.md`(gitignore)는 개발 중 **내부 설계 노트**입니다. 결정 근거의 원천이니 필요하면 로컬/NAS에서 참고하고, 정제된 결론은 [DECISIONS](DECISIONS.md)에 있습니다.

---

## 9. 배포 · 운영 (요약)

3-VM(APP/DB/LAB) Docker Compose. 반영: VM-APP에서
```bash
cd <repo>/deploy && docker compose -f docker-compose.app.yml build --no-cache backend web && \
docker compose -f docker-compose.app.yml --env-file .env up -d --force-recreate backend web
```
상세·장애 대응은 [deploy/RUNBOOK](../deploy/RUNBOOK.md), 컨테이너 접속은 [deploy/CONTAINERS](../deploy/CONTAINERS.md).
