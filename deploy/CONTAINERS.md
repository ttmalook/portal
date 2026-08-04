# 컨테이너 접속 가이드

포털·검증랩 각 컨테이너에 들어가거나 명령을 실행하는 방법. 운영 절차는 [RUNBOOK.md](RUNBOOK.md) 참조.

## 접속 기본

- **권장(프로젝트 접두사 무관)** — compose 파일 + 서비스명으로 접속:
  ```bash
  docker compose -f <compose파일> exec <서비스> sh      # 셸 진입
  docker compose -f <compose파일> exec <서비스> <명령>  # 단발 명령
  ```
- **대안** — 컨테이너 이름 직접:
  ```bash
  docker exec -it <컨테이너> sh
  ```
  > 컨테이너 이름 = `<compose 프로젝트>-<서비스>-N`. 프로젝트명은 **실행 디렉터리 이름**에 따라 달라집니다(로컬 예: `claude-*`·`lab-*`, VM-APP `deploy` 디렉터리 실행 시 `deploy-*`). 정확한 이름은 `docker ps`로 확인하세요.
- **셸**: 대부분 `sh`(alpine/busybox/nginx). `ollama`는 `bash`도 가능. **`coredns`(dns) 컨테이너는 distroless라 셸이 없습니다** → `exec` 불가(§맨 아래).

---

## 1. 포털 (VM-APP · `deploy/docker-compose.app.yml`, 로컬 `docker-compose.yml`)

| 서비스 | 역할 | 접속 명령 | 내부 포트 |
|---|---|---|---|
| `db` | PostgreSQL (운영 DB `ssc_portal`) | `docker compose exec db psql -U ssc -d ssc_portal` · 셸: `... exec db sh` | 5432 |
| `backend` | Express API | `docker compose exec backend sh` | 8787 |
| `web` | nginx + SPA(정적) · TLS 종단 | `docker compose exec web sh` | 80·443 |
| `ollama` | 로컬 LLM(가이드 쉬운말 해석) | `docker compose exec ollama bash` | 11434 |

> 예(VM-APP): `cd <repo>/deploy && docker compose -f docker-compose.app.yml exec backend sh`

---

## 2. 검증랩 (VM-LAB · `lab/docker-compose.yml`)

먼저 `cd <repo>/lab` 후 `docker compose exec <서비스> sh` (또는 `-f lab/docker-compose.yml` 지정).

| 서비스 | 역할 | 접속 | 내부 포트 |
|---|---|---|---|
| `postgres` | 랩 DB | `docker compose exec postgres psql -U ssc -d ssc_portal` | 5432 |
| `evidence-collector` | 증적 수집(Playwright) | `docker compose exec evidence-collector sh` | 8899 |
| `lab-http-vulnerable` · `lab-http-remediated` · `lab-http-generic` · `lab-hsts-remediated` | HTTP 헤더 타깃(nginx) | `docker compose exec <서비스> sh` | 80 |
| `lab-tls-vulnerable` · `lab-tls-remediated` · `lab-tls-revoked` | TLS 타깃 | `docker compose exec <서비스> sh` | 80 |
| `lab-net-vulnerable` · `lab-net-remediated` | 포트 노출 타깃(socat/busybox) | `docker compose exec <서비스> sh` | 다중 |
| `lab-ssh-vulnerable` · `lab-ssh-remediated` | SSH 타깃(openssh) | `docker compose exec <서비스> sh` | 22 |
| `lab-http-drill` · `lab-tls-drill` · `lab-dns-drill` · `lab-ssh-drill` · `lab-net-drill` | 가변(drill) 타깃 | `docker compose exec <서비스> sh` | 계열별 |
| `lab-dns-vulnerable` · `lab-dns-remediated` | DNS 타깃(**coredns · 셸 없음**) | §아래 참조 | 53 |

---

## 3. DB 접속 상세

```bash
# 컨테이너 내부에서 psql
docker compose exec db psql -U ssc -d ssc_portal          # 포털
docker compose -f lab/docker-compose.yml exec postgres psql -U ssc -d ssc_portal   # 랩

# 호스트에서 접속(포트 노출 시)
psql -h localhost -p 5432 -U ssc -d ssc_portal
```
- 사용자 `ssc` · DB `ssc_portal`. **비밀번호는 `.env`의 `PGPASSWORD`**(문서에 남기지 말 것).
- 운영에서 `5432`는 **VM-APP에서만** 접근 허용(방화벽) — [deploy/docker-compose.db.yml](docker-compose.db.yml) 주석 참조.

## 4. SSH 타깃

- `lab-ssh-*`는 컨테이너 내부 22 포트만 노출. 랩 네트워크 밖에서 직접 `ssh`하려면 포트 매핑이 필요하며, 보통은 `docker compose exec lab-ssh-vulnerable sh`로 내부 확인.

## 5. 셸 없는 컨테이너(coredns/dns)

distroless 이미지라 `exec sh`가 안 됩니다. 대신:
```bash
docker logs <dns 컨테이너>                                   # 로그 확인
docker run --rm -it --network container:<dns 컨테이너> nicolaka/netshoot   # 네트워크 진입
# 또는 호스트에서: sudo nsenter -t $(docker inspect -f '{{.State.Pid}}' <dns 컨테이너>) -n
```

---

> 컨테이너 목록·이름은 항상 `docker ps`로 최신 확인. 서비스명은 고정이지만 컨테이너 접두사는 실행 위치(compose 프로젝트)에 따라 달라집니다.
