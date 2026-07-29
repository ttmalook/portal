// =====================================================================
// Portal Store API 클라이언트 (고객사/도메인 영구 저장)
//  - 우리 백엔드(/api/portal/*)만 호출. 성공 시 실제 파일 저장소에 영속.
//  - 백엔드 미실행 시 throw → App이 로컬(mock) 모드로 폴백.
// =====================================================================
import { call } from './apiCall.js'
import { getAccessToken } from './auth.js'

const jsonOpts = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined
})

export const fetchCustomers = () => call('/api/portal/customers').then((d) => d.customers)
export const fetchDomains = () => call('/api/portal/domains').then((d) => d.domains)

export const apiAddCustomer = (c) => call('/api/portal/customers', jsonOpts('POST', c)).then((d) => d.customer)
export const apiUpdateCustomer = (id, patch) => call(`/api/portal/customers/${encodeURIComponent(id)}`, jsonOpts('PUT', patch)).then((d) => d.customer)
export const apiDeleteCustomer = (id) => call(`/api/portal/customers/${encodeURIComponent(id)}`, jsonOpts('DELETE'))

export const apiAddDomain = (d) => call('/api/portal/domains', jsonOpts('POST', d)).then((r) => r.domain)
export const apiUpdateDomain = (id, patch) => call(`/api/portal/domains/${encodeURIComponent(id)}`, jsonOpts('PUT', patch)).then((r) => r.domain)
export const apiDeleteDomain = (id) => call(`/api/portal/domains/${encodeURIComponent(id)}`, jsonOpts('DELETE'))

export const fetchEvidencePacks = () => call('/api/portal/evidence-packs').then((d) => d.evidencePacks)
export const apiAddEvidencePack = (p) => call('/api/portal/evidence-packs', jsonOpts('POST', p)).then((d) => d.evidencePack)
export const apiUpdateEvidencePack = (id, patch) => call(`/api/portal/evidence-packs/${encodeURIComponent(id)}`, jsonOpts('PUT', patch)).then((d) => d.evidencePack)
export const apiDeleteEvidencePack = (id) => call(`/api/portal/evidence-packs/${encodeURIComponent(id)}`, jsonOpts('DELETE'))

// 리포트 HTML 내보내기(인증) — 자립형 단일 HTML 파일을 blob 으로 받아 다운로드.
//  names: issue_type→한글명(백엔드 이미지엔 프론트 카탈로그가 없어 프론트가 전달).
//  password(선택, 3자 이상): 제공 시 백엔드가 리포트 전체를 AES-GCM 암호화(열람 시 암호 입력).
export async function exportReportHtml(customer, names = {}, extras = {}, password = '') {
  const base = import.meta.env.VITE_BACKEND_URL || ''
  const t = getAccessToken()
  const resp = await fetch(`${base}/api/portal/report-export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
    body: JSON.stringify({ customer, names, extras, ...(String(password || '').trim().length >= 3 ? { password: String(password).trim() } : {}) })
  })
  if (!resp.ok) throw new Error(`export failed (HTTP ${resp.status})`)
  const blob = await resp.blob()
  const cd = resp.headers.get('Content-Disposition') || ''
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/.exec(cd)
  const filename = m ? decodeURIComponent(m[1]) : `SSC_리포트_${customer}.html`
  return { blob, filename }
}

// 감사 로그(관리자 전용) — kind: all|user|security|system
export const fetchAudit = (params = {}) => {
  const q = new URLSearchParams()
  if (params.kind && params.kind !== 'all') q.set('kind', params.kind)
  if (params.limit != null) q.set('limit', String(params.limit))
  if (params.offset != null) q.set('offset', String(params.offset))
  return call(`/api/audit${q.toString() ? `?${q}` : ''}`).then((d) => ({ items: d.items || [], total: d.total || 0 }))
}

// 조치 가이드 "해석"(쉬운말) — 로컬 LLM 생성/캐시. 실패·미지원 시 null(프론트가 기술 why로 폴백)
export const interpretGuide = (body) => call('/api/guides/interpret', jsonOpts('POST', body)).then((d) => d?.text || null).catch(() => null)

// 사용자 관리 (관리자 전용 — 서버가 403 처리)
export const fetchUsers = () => call('/api/auth/users').then((d) => d.users)
export const apiCreateUser = (body) => call('/api/auth/users', jsonOpts('POST', body)).then((d) => d.user)
export const apiSetUserRole = (id, role) => call(`/api/auth/users/${encodeURIComponent(id)}/role`, jsonOpts('PATCH', { role })).then((d) => d.user)
// 비밀번호 — 본인 변경(현재 비밀번호 필요) · 관리자 재설정
export const apiChangeMyPassword = (currentPassword, newPassword) =>
  call('/api/auth/me/password', jsonOpts('POST', { currentPassword, newPassword }))
// 세션(로그인 기기) 관리 — 본인 세션 목록/원격 폐기 (N-03)
export const fetchSessions = () => call('/api/auth/sessions').then((d) => d.sessions || [])
export const apiRevokeSession = (family) => call(`/api/auth/sessions/${encodeURIComponent(family)}`, jsonOpts('DELETE'))
export const apiRevokeOtherSessions = () => call('/api/auth/sessions/revoke-others', jsonOpts('POST'))
export const apiResetUserPassword = (id, newPassword) =>
  call(`/api/auth/users/${encodeURIComponent(id)}/password`, jsonOpts('PATCH', { newPassword }))
export const apiUpdateUser = (id, patch) => call(`/api/auth/users/${encodeURIComponent(id)}`, jsonOpts('PATCH', patch)).then((d) => d.user)
// SSC API 토큰 (관리자 전용) — 값은 반환되지 않음(상태만: configured/source/hint)
export const sscTokenStatus = () => call('/api/settings/ssc-token').then((d) => d.status)
export const sscTokenSet = (token) => call('/api/settings/ssc-token', jsonOpts('PUT', { token })).then((d) => d.status)
export const sscTokenClear = () => call('/api/settings/ssc-token', jsonOpts('DELETE')).then((d) => d.status)
