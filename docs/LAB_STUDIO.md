# 랩 스튜디오 — SSC 기반 AI Lab Builder

새로운 SecurityScorecard(SSC) `issue_type`이 등장했을 때, 사람이 검증랩 5계층(템플릿·가이드·카탈로그·타깃·게이트)을 손으로 수정하지 않고 **재현 가능한 랩을 반자동으로 만들어내는** 관리자 전용 도구.

핵심 설계는 **신뢰 경계**다: LLM(Claude)은 **실행 코드가 아니라 스키마 고정 레시피(JSON 데이터)만** 생성하고, **결정적 렌더러**가 실제 환경을 구성하며, **검증 게이트** 통과 + **관리자 승인**을 거쳐야 채택된다. LLM이 만든 텍스트를 서버가 그대로 실행하는 경로는 없다.

> 이 문서는 랩 스튜디오(=AI Lab Builder)의 아키텍처·구성요소·경계를 정리한다. 검증랩 자체(50종)의 실행/증적은 [화면정의서](SCREENS.md)와 [ARCHITECTURE.md](ARCHITECTURE.md) §5, 운영/장애 대응은 [../deploy/RUNBOOK.md](../deploy/RUNBOOK.md)를 참조.

---

## 1. 파이프라인

```
SSC issue_type + 공식 recommendation
   │
   ▼  ① 분류(Classifier)               labClassifier.js · labCoverage.js
   판정: reuse | auto_build | extend | needs_infra | guide_only
   │
   ▼  ② 컴파일(AI Recipe Compiler)      labRecipeCompiler.js + claudeClient.js
   Claude + 표준 프롬프트 → LabRecipe(JSON) → 스키마 검증·정규화
   │
   ▼  ③ 렌더(결정적 렌더러)             labRenderer.js
   LabRecipe → collector 실행 "계획"(plan). LLM 텍스트를 실행하지 않음
   │
   ▼  ④ 게이트(Validation Gate)         labValidationGate.js
   실제 랩 실행 + assertion(취약↔조치 실차이 확인)
   │
   ▼  ⑤ 채택(Adopt)                     labRecipes.js
   관리자 승인 → 레지스트리에 immutable 버전(active)으로 등록
```

각 단계는 관리자 화면(**랩 스튜디오**)의 버튼과 1:1로 대응한다.

---

## 2. 구성요소 (backend/src)

| 파일 | 역할 |
|---|---|
| `labClassifier.js` | 라우팅 전용 분류기. 신규 issue_type → 재현 경로 **판정**. 이름 유사도가 아니라 **검증 의미(verificationSemantics)**로 비교 |
| `labCoverage.js` | 커버리지 산정 공유 모듈(CLI·admin API 공용). `buildCoverage()` → `{supported, toBuild:{http_header,tls,dns,network}, guideOnly}` |
| `labProfiles.js` | 기존 50종을 읽기 전용 **구조 서술자**로 표현(classifier 정답지). `collectorCapability`·`mutationType`·`autoBuildable` 필드 |
| `labRecipeCompiler.js` | AI Recipe Compiler. SSC 메타/권고 → **LabRecipe JSON**. 시스템 프롬프트 = `docs/SSC_VALIDATION_LAB_AUTHORING_STANDARD.md`(+폴백). 코드펜스 제거·JSON 추출·`validateRecipe`. 서버가 `issueType`을 신뢰된 SSC 키로 강제 |
| `claudeClient.js` | 얇은 Claude API 클라이언트. 키 우선순위 = 관리자 설정 > `.env ANTHROPIC_API_KEY`. 모델 기본 `claude-opus-4-8`(env `CLAUDE_MODEL`로 교체). 키를 로그에 남기지 않음 |
| `labRenderer.js` | 결정적 렌더러. LabRecipe → collector 실행 **계획**. 화이트리스트 아키타입만(`assertRenderable()` → `LAB_ARCHETYPE_UNSUPPORTED`) |
| `labValidationGate.js` | 검증 게이트. 실제 랩을 돌려 assertion(작성 표준 §6). `LAB_COLLECTOR=docker` + 랩 스택 필요 |
| `labRecipes.js` | LabRecipe 레지스트리("랩 정의 = 데이터"). Postgres `lab_recipes` 우선, 없으면 파일 폴백. **immutable 버전**(같은 issueType v1/v2/v3 보존, 채택본만 `active`) |

프런트: `src/pages/LabStudio.jsx`(관리자 전용 화면) + `src/lib/adminLabApi.js`(API 클라이언트).

---

## 3. Classifier 판정 (5종)

`labClassifier.js`의 `classifyIssue()`가 반환하는 판정. **검증 의미가 다르면 자동 재사용을 차단**한다(예: HSTS의 "존재+max-age"와 CSP의 "directive 정책 분석"은 둘 다 헤더지만 의미가 달라 자동 재사용 금지).

| 판정 | 의미 | 후속 |
|---|---|---|
| `reuse` | 이미 지원되는 유형 | 기존 랩 사용 |
| `auto_build` | 제네릭 응답기가 레시피만으로 재현 가능(단순 헤더 presence/value, 포트 노출) | **Claude 컴파일** 대상 |
| `extend` | 같은 계열이나 검증 의미가 다름(CSP 정책·쿠키 속성·리다이렉트) | 사람 검토 필요 |
| `needs_infra` | 새 아키타입/수집기 필요(tls·dns·ssh 계열) | Phase 2/3 대상 |
| `guide_only` | 인프라 랩으로 재현 불가(평판·CVE·PII 노출 등) | 조치 가이드로만 제공 |

랩 스튜디오에서 `auto_build`/`extend`일 때만 "레시피 컴파일(Claude)" 버튼이 활성화된다.

---

## 4. LabRecipe 스키마

`labRecipes.js`의 `validateRecipe()`가 검증·정규화한다. **`verificationSemantics`가 1급 필드**로, classifier·게이트가 신뢰를 통제하는 근거다.

```jsonc
{
  "schemaVersion": 1,
  "issueType": "…",              // 서버가 신뢰된 SSC 키로 강제
  "archetype": "http_header" | "network",   // ARCHETYPES(Phase 1)
  "protocol": "…", "targetEngine": "…",
  "verificationSemantics": {     // ★ 1급 필드 — before ≠ after 강제
    // http_header: { kind, header, value, before, after }
    //   kind ∈ http_header_presence | http_header_value
    // network:     { kind: "network_port_exposed", port, service,
    //               before: "open", after: "closed" }   // port ∈ NET_BAKED_PORTS
  },
  "guide":   { "direction": "…", "steps": [ … ] },
  "catalog": { "display_name","koName","ssc_factor","severity","why",
               "whereToChange":[…], "verification":[…] },
  "sourceDiff": { "label","file","language","inline": { "before","after" } },
  "collectorAssertion": { … },
  "checklist": [ … ]             // 12개 이상 필수
}
```

- `ARCHETYPES = ['http_header','network']` (Phase 1 지원 아키타입)
- `VERIFICATION_KINDS = ['http_header_presence','http_header_value','network_port_exposed']`
- `NET_BAKED_PORTS` = 21,23,53,143,389,445,1723,3306,3389,5432,5900,5984,6379,8080,9042,9200,27017 — 랩이 미리 세워둔(baked) 포트만 재현 대상

---

## 5. Collector 모드 & 템플릿

수집기 모드는 환경변수 **`LAB_COLLECTOR`**로 결정(`lab.js`):

| 값 | 동작 |
|---|---|
| `simulated` (기본) | Docker 없이 결정적 시뮬레이션 증적 |
| `docker` | 실제 evidence-collector(`LAB_COLLECTOR_URL`, 기본 `http://localhost:8899`)에 `POST /collect`. 미지원 카테고리는 501 → simulated로 폴백 |

프로덕션 앱 티어(VM-APP)는 `LAB_COLLECTOR=docker` + `LAB_COLLECTOR_URL`을 요구한다.

**템플릿 5계열**(`lab.js`) — 각 `evidenceMode`·`tool`:

| 계열 | evidenceMode | tool | 지원 유형 수 |
|---|---|---|---|
| `http_header` | web_screenshot | playwright | 10 |
| `tls` | scan_report | openssl | 9 |
| `dns` | scan_report | dig | 9 |
| `network` | scan_report | nmap | 20 |
| `ssh` | scan_report | nmap | 2 |

**지원 랩 50종** = 위 `TEMPLATES.*.issueTypes` 하드코딩 배열의 합(10+9+9+20+2). `supportedKeySet()`(server.js) = 이 50종 ∪ 채택된 레시피의 issueType. SSC 전체 유형 카탈로그는 `getIssueTypeCatalog()`(securityScorecardIssueCollector.js, `/metadata/issue-types` 6h 캐시).

---

## 6. Phase 경계

권위 있는 서술은 [SCREENS.md](SCREENS.md) SCR-11, [ARCHITECTURE.md](ARCHITECTURE.md) §5.

| Phase | 범위 | 상태 |
|---|---|---|
| **Phase 1** | `http_header` + `network` 아키타입 레시피 · 컴파일→게이트→채택 엔드투엔드 | **완료** |
| **Phase 2** | 임시 nginx config 렌더링(더 실제적) + `tls`/`dns`/`ssh` 아키타입 확장 | 미완 |
| **Phase 3** | 실패 재투입 자동수정 루프 · 스테이징 격리 · 하드닝 | 미완 |

- 미지원 아키타입은 렌더러가 `LAB_ARCHETYPE_UNSUPPORTED`를 반환한다.
- **기존 50종 하드코딩 랩은 이 기능과 독립적으로 동작**한다(추가형 설계 → 회귀 최소화). 커버리지 게이트 50/50 유지.

---

## 7. 관리자 API (모두 `requireAdmin`)

`backend/src/server.js`:

| 메서드 · 경로 | 용도 |
|---|---|
| `GET/PUT/DELETE /api/settings/claude-key` | Recipe Compiler용 Claude 키 설정·상태·해제(AES-GCM, 원문 미노출) |
| `GET  /api/admin/lab-coverage` | 커버리지 버킷(supported/toBuild/guideOnly) |
| `POST /api/admin/lab-classify` | 단일 issue_type 판정 |
| `POST /api/admin/lab-recipes/compile` | 레시피 컴파일(Claude). 409=진행중 · 400 `NOT_COMPILABLE`=판정이 auto_build/extend 아님 |
| `POST /api/admin/lab-recipes/:id/gate` | 스테이징 지정 → `validateLab` → 게이트 기록 |
| `POST /api/admin/lab-recipes/:id/adopt` | 게이트 통과 시 채택(active) |
| `GET /api/admin/lab-recipes[/:id]` · `DELETE …/:id` | 레지스트리 조회·삭제 |

화면 동작: Claude 키 카드(설정/해제/상태) → 커버리지 표 → 행별 "판정"·"조치법" → "레시피 컴파일" → "게이트 실행" → "채택(active)" → 레지스트리 표(삭제).

---

## 8. 안전 · 신뢰 앵커

- Claude 출력 = **스키마 고정 레시피(데이터)만**. 실행 코드·Dockerfile·collector JS를 생성/실행하지 않음.
- 렌더러는 **화이트리스트 아키타입**만 처리하고 레시피 필드 enum·값을 검증. `verificationSemantics` 필수(before ≠ after 강제).
- 채택 전 **게이트 PASS + 관리자 승인**. 운영 소스 자동수정 없음(레지스트리 데이터만). 채택은 **immutable 버전**.
- Claude/SSC 키는 **AES-256-GCM 암호화** 저장, 원문 미노출. Claude 키는 KEK가 약하면(기본 `AUTH_ACCESS_SECRET`) DB 저장 차단(`WEAK_KEK`).
- 동일 issue_type 중복 생성 차단(409)·생성 중 잠금.
