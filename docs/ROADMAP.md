# 로드맵 · 미완 · 기술부채 (ROADMAP)

후임이 **다음에 무엇을** 이어갈지 — 우선순위와 맥락. 진입점은 [HANDOVER](HANDOVER.md), 배경은 [DECISIONS](DECISIONS.md).

> 우선순위: **P1 운영 리스크(놓치면 사고)** · **P2 기능 확장** · **P3 구조·품질**. 각 항목에 배경·현재상태·다음단계·관련파일.

---

## P1 — 운영 리스크 (기한 있음 · 우선)

### P1-1 · TLS 인증서 갱신 ⚠️ 기한 있음
- **배경**: 운영 HTTPS 인증서 = Let's Encrypt **DNS-01 수동** 발급. **2026-10-21 만료**.
- **리스크**: 갱신 누락 시 `app.ztplay.cloud:7003` **서비스 중단**.
- **다음 단계**: (a) 만료 전 수동 갱신 절차 문서화·리마인더, (b) 가능하면 자동 갱신(DNS API 연동 certbot)으로 전환.
- **관련**: nginx 인증서 마운트(`docker/nginx/certs/` — gitignore), [backend/DEPLOY_SECURITY](../backend/DEPLOY_SECURITY.md).

### P1-2 · 백업·복구 리허설 사인오프
- **배경**: [RUNBOOK §7](../deploy/RUNBOOK.md)에 리허설 절차는 있으나 **운영에서 1회 검증(RTO 10분 성립)이 미완**.
- **다음 단계**: `db-backup.sh`→`restore-db.sh` 복구 리허설 1회, cron 자동 백업 확인, 소요시간 기록. [TEST_RESULTS](TEST_RESULTS.md)의 운영 항목과 연계.
- **관련**: `deploy/backup/`.

### P1-3 · 실 SSC 토큰 위생
- **배경**: 개발/데모에 실 운영 SSC 토큰이 들어간 이력 있음(`.env`는 gitignore지만 로컬 평문).
- **다음 단계**: 각 환경 `.env`의 토큰이 용도에 맞는지 점검(데모엔 데모 토큰), 인수인계 시 토큰 재발급 검토.

---

## P2 — 기능 확장

### P2-1 · AI Lab Builder Phase 2
- **현재**: Phase 1 = `http_header`·`network` 아키타입 엔드투엔드(컴파일→게이트→채택) 완료([LAB_STUDIO](LAB_STUDIO.md)).
- **다음 단계**: `tls`·`dns`·`ssh` 아키타입 프로파일·렌더러·collector 레시피 경로 확장 + http_header를 **임시 nginx config 렌더링**으로 강화(더 실제적).
- **관련**: `backend/src/labProfiles.js`·`labRenderer.js`·`labRecipes.js`(`ARCHETYPES` 확장), `lab/` 타깃.

### P2-2 · AI Lab Builder Phase 3
- **다음 단계**: 실패 재투입 **자동수정 루프**, 새 아키타입 사람 승인 워크플로, staging 격리, 키관리·감사 polish.

### P2-3 · 검증랩 커버리지 확대
- **현재**: 50종(http_header 10·tls 9·dns 9·network 20·ssh 2). 게이트 50/50.
- **다음 단계**: 신규 SSC 유형 커버리지 감사(`node backend/scripts/labCoverageAudit.mjs`) 주기화, 미지원 유형 우선순위화.

---

## P3 — 구조 · 품질

### P3-1 · 관계형 스키마 이행 (리포팅)
- **배경**: 런타임은 JSONB 문서 스토어, `db/schema.sql`은 리포팅 타깃으로만 보존([DECISIONS](DECISIONS.md) ADR-01).
- **다음 단계**: 집계·리포팅 요구가 커지면 정규화 스키마로 단계적 이행(FK 강제·인덱스). [DATABASE §4](DATABASE.md).

### P3-2 · API 명세 정적화
- **배경**: OpenAPI는 라이브 Swagger(`/api/admin/openapi.json`)만 존재.
- **다음 단계**: OpenAPI JSON을 파일로 export해 `docs/`에 정적 명세 산출물화(인수·연동용).

### P3-3 · dev 포트 불일치 정리
- **배경**: `vite.config.js` 기본 5173 vs README·`.claude/launch.json` 5180.
- **다음 단계**: `vite.config.js`의 `server.port`를 5180으로 통일하거나 문서를 5173에 맞춤(택1).

---

## 알려진 이슈 / 기술부채

| 항목 | 내용 | 조치 |
|---|---|---|
| 접근 토큰 TTL 문서-코드 불일치 | 일부 문서 "15분" vs 코드 기본 **5분**(`ACCESS_TTL_SEC`) | 문서·코드 중 하나로 통일 |
| evidence_packs 레거시 필드 | `publish`·`customerViewed`가 게시링크 폐지로 미사용 잔재 | 안전 시점에 쓰기/표시 제거 |
| 내부 노트 gitignore | `docs/SSC_*.md`(설계 근거)가 공개 repo 제외 | 필요분은 [DECISIONS](DECISIONS.md)로 정제 이관됨 |
| 문서 산출물 gitignore | 화면정의서 HTML/PDF·매뉴얼 PPT는 로컬/NAS만 | 재생성 스크립트는 세션 히스토리에 있음(제너레이터 커밋 검토) |
| SCREENS `lab/verify/MANUAL_GUIDE` 링크 | 참조 링크 일부 점검 필요 | 링크 점검 |

---

## 작업 착수 팁

- 회귀 기준: `node backend/scripts/labValidationGate.mjs --all`(50/50) + `node backend/scripts/labCoverageAudit.mjs` 동일 유지.
- 배포 반영 전 로컬 엔드투엔드(로그인→리스크점검→검증랩→리포트) 확인.
- 변경 근거는 [DECISIONS](DECISIONS.md)에 ADR로 추가(다음 인수인계를 위해).
