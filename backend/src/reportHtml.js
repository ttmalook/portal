// 자립형(자산 임베드) 단일 HTML 리포트 생성기.
//  입력 데이터만으로 완전한 HTML 문자열을 만든다(백엔드 의존성 없음 · 순수 함수).
//  표지(등급 + 조치 우선순위 표) → 유형 클릭 시 해당 조치/증적 단일 뷰. 폰트·이미지는 라우트에서 data URI로 주입.

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const SEV_KO = { high: '높음', medium: '보통', low: '낮음', info: '정보', critical: '심각' }
const sevColor = (s) => ({ critical: '#b91c1c', high: '#dc2626', medium: '#f59e0b', low: '#64748b', info: '#94a3b8' }[String(s).toLowerCase()] || '#64748b')
const gradeColor = (score) => score == null ? '#64748b' : score >= 80 ? '#16a34a' : score >= 60 ? '#f59e0b' : '#dc2626'

function imgOrPlaceholder(dataUri, label, variant) {
  if (dataUri) return `<figure class="shot"><img src="${dataUri}" alt="${esc(label)}"/><figcaption>${esc(label)}</figcaption></figure>`
  return `<figure class="shot shot-ph shot-${variant}"><div class="ph">증적 캡처<br/><span>${esc(label)}</span></div></figure>`
}

function fmtImpact(v) {
  if (v == null) return null
  const n = Math.round(Math.abs(Number(v)) * 10) / 10
  return n < 0.1 ? '<0.1' : n.toFixed(1)
}

function diffTable(diff) {
  if (!Array.isArray(diff) || !diff.length) return ''
  const rows = diff.map((r) => `<tr class="${r.changed ? 'changed' : ''}"><td>${esc(r.key)}</td><td class="before">${esc(r.before)}</td><td class="after">${esc(r.after)}</td></tr>`).join('')
  return `<table class="diff"><thead><tr><th>관측 항목</th><th>조치 전</th><th>조치 후</th></tr></thead><tbody>${rows}</tbody></table>`
}

function sourceDiffHtml(sd) {
  if (!sd || !Array.isArray(sd.lines) || !sd.lines.length) return ''
  const rows = sd.lines.map((l) => {
    const cls = l.t === 'add' ? 'add' : l.t === 'del' ? 'del' : 'ctx'
    const pre = l.t === 'add' ? '+' : l.t === 'del' ? '−' : ' '
    return `<div class="dl ${cls}">${esc(pre + ' ' + l.s)}</div>`
  }).join('')
  return `<div class="srcdiff"><div class="srcdiff-h">${esc(sd.label || sd.file || '설정 변경')}${sd.file && sd.label ? ` · ${esc(sd.file)}` : ''}</div>${rows}</div>`
}

function stepsList(steps) {
  return Array.isArray(steps) && steps.length ? `<ol class="steps">${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''
}

function step(n, title, body) {
  return body ? `<div class="step"><div class="step-h"><span class="step-n">${n}</span>${esc(title)}</div><div class="step-b">${body}</div></div>` : ''
}

function overviewBody(it) {
  const sev = String(it.severity || '').toLowerCase()
  const ov = it.overview || {}
  const parts = []
  parts.push(`<div class="ov-meta"><span>Issue Type <b>${esc(ov.displayName || it.name)}</b></span><span>유형 키 <b>${esc(it.key)}</b></span></div>`)
  if (ov.aiSummary) parts.push(`<div class="ai-box"><div class="ai-t">쉬운 말 요약 · 자동 해석</div><p>${esc(ov.aiSummary)}</p></div>`)
  const chips = [`<span class="chip">항목: ${esc(it.name)}</span>`, `<span class="chip" style="background:${sevColor(sev)}1a;color:${sevColor(sev)}">위험도: ${esc(SEV_KO[sev] || it.severity || '-')}</span>`]
  if (it.category) chips.push(`<span class="chip">분류: ${esc(it.category)}</span>`)
  if (ov.difficulty) chips.push(`<span class="chip">조치 난이도: ${esc(ov.difficulty)}</span>`)
  if (ov.impact) chips.push(`<span class="chip">서비스 영향: ${esc(ov.impact)}</span>`)
  if (it.scoreImpact != null) chips.push(`<span class="chip">점수 개선: +${fmtImpact(it.scoreImpact)}</span>`)
  parts.push(`<div class="mini-t">무엇이 왜 문제인가요</div><div class="chips">${chips.join('')}</div>`)
  parts.push(`<p>${esc(ov.why || it.sscDesc || '해당 유형에 대한 설명을 준비 중입니다.')}</p>`)
  if (ov.why && it.sscDesc) parts.push(`<div class="block"><div class="block-t">SecurityScorecard 설명</div><p class="muted">${esc(it.sscDesc)}</p></div>`)
  const comp = ov.compliance
  if (comp && ((comp.areas && comp.areas.length) || (comp.frameworks && comp.frameworks.length))) {
    const fw = (comp.frameworks || []).map((f) => `<li><b>${esc(f.name)}</b>${f.clause ? ` · ${esc(f.clause)}` : ''}</li>`).join('')
    parts.push(`<div class="mini-t">관련 컴플라이언스 <span class="cnote">(참고 · 감사 판정 아님)</span></div>${comp.areas && comp.areas.length ? `<p class="muted">통제 영역: ${comp.areas.map(esc).join(' · ')}</p>` : ''}${fw ? `<ul class="fw">${fw}</ul>` : ''}`)
  }
  const as = ov.assets
  if (as && Array.isArray(as.list) && as.list.length) {
    const rows = as.list.map((a) => `<tr><td>${esc(a.asset || '-')}</td><td>${esc([a.port, a.protocol].filter(Boolean).join(' / ') || '-')}</td><td>${esc(a.lastSeen || '-')}</td></tr>`).join('')
    const more = as.total > as.list.length ? `<p class="assetmore">그 외 ${as.total - as.list.length}건 · 총 <b>${as.total}건</b> 관측</p>` : `<p class="assetmore">총 <b>${as.total}건</b> 관측</p>`
    parts.push(`<div class="mini-t">관측된 자산 <span class="cnote">(이 유형이 발견된 대상)</span></div><table class="asset"><thead><tr><th>대상</th><th>포트/서비스</th><th>Last Seen</th></tr></thead><tbody>${rows}</tbody></table>${more}`)
  }
  return parts.join('')
}

function fixBody(it) {
  const g = it.guide || {}
  const ap = it.apply || {}
  const parts = []
  if (g.direction) parts.push(`<p>${esc(g.direction)}</p>`)
  const sl = stepsList(g.steps); if (sl) parts.push(sl)
  if (Array.isArray(ap.whereToChange) && ap.whereToChange.length) {
    parts.push(`<div class="mini-t">어디를 고쳐야 하나요 (설정 위치)</div><p class="muted">아래 위치 <b>중 한 곳</b>에서 환경에 맞게 적용합니다(모두가 아니라 택1).</p><ul class="where">${ap.whereToChange.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>`)
  }
  if (it.sourceDiff) parts.push(`<div class="mini-t">실제 소스 변경 (검증랩 타깃의 취약 → 조치)</div>${sourceDiffHtml(it.sourceDiff)}`)
  else if (it.configDiff) parts.push(`<div class="mini-t">설정 변경 예시</div><p class="muted">아래는 실제 설정에서 추가(+)/삭제(−)할 부분의 예시입니다(환경마다 경로·형식은 다를 수 있습니다).</p>${sourceDiffHtml(it.configDiff)}`)
  if (Array.isArray(ap.engines) && ap.engines.length) {
    const eng = ap.engines.map((e) => `<div class="eng"><div class="eng-h">${esc(e.name)}${e.lang ? ` · ${esc(e.lang)}` : ''}</div><pre class="eng-c">${esc(e.snippet)}</pre></div>`).join('')
    parts.push(`<div class="mini-t">고객 환경 적용 방법 (엔진별)</div><p class="muted">고객 웹 엔진에 맞는 설정을 적용하세요.</p>${eng}${ap.versionNote ? `<p class="vnote">${esc(ap.versionNote)}</p>` : ''}`)
  }
  if (g.sscRec) parts.push(`<div class="block"><div class="block-t">SecurityScorecard 공식 권고</div><p>${esc(g.sscRec)}</p></div>`)
  return parts.join('') || '<p class="muted">해당 유형의 표준 조치 방향을 준비 중입니다.</p>'
}

// 마무리 — 고객 조치 체크리스트 + (랩) 실행 로그 + 면책.
function checklistHtml(it) {
  const w = (it.apply && it.apply.whereToChange) || []
  const lis = w.map((x) => `<li>${esc(x)}</li>`).join('') + '<li>조치 후 재확인 (검증 명령·재접속으로 반영 확인)</li><li>SecurityScorecard 재스캔으로 최종 해소 확인</li>'
  return `<div class="mini-t">고객 조치 체크리스트</div><ul class="check">${lis}</ul>`
}
function logsHtml(it) {
  const logs = Array.isArray(it.logs) ? it.logs : []
  if (!logs.length) return ''
  return `<div class="mini-t">실행 로그 (검증랩 내부 수행 기록)</div><pre class="log">${esc(logs.join('\n'))}</pre>`
}
function verifyCmdsHtml(it) {
  const cmds = (it.apply && it.apply.verification) || []
  if (!cmds.length) return ''
  return `<div class="mini-t">조치 여부 확인 방법 (검증 명령)</div><pre class="log">${esc(cmds.join('\n'))}</pre>`
}

function labSection(it) {
  const ev = it.evidence || {}
  const ba = `<div class="ba">${imgOrPlaceholder(ev.beforeImg, ev.beforeLabel || '조치 전', 'before')}${imgOrPlaceholder(ev.afterImg, ev.afterLabel || '조치 후', 'after')}</div>`
  const observe = diffTable(ev.diff) + (ev.tool ? `<p class="tool">확인 도구: <code>${esc(ev.tool)}</code></p>` : '') + verifyCmdsHtml(it) + '<p class="muted">관측값은 파트너 검증랩 재현 결과입니다. 고객 운영환경의 실제 해소 여부는 <b>SecurityScorecard 재스캔</b>으로 확인합니다.</p>'
  const wrap = checklistHtml(it) + logsHtml(it) + '<p class="note">파트너 표준 검증랩에서 조치 전 → 조치 후를 재현한 참고 증적입니다. 귀사 운영환경의 조치 완료를 의미하지 않으며, 실제 Finding 해소 여부는 SecurityScorecard 재스캔 또는 공식 검증 절차로 확인해야 합니다.</p>'
  return step('01', '개요', overviewBody(it))
    + step('02', '조치 방법', fixBody(it))
    + step('03', '조치 전 / 후', ba)
    + step('04', '관측값 · 확인', observe)
    + step('05', '마무리', wrap)
}

function guideSection(it) {
  const g = it.guide || {}
  const verify = verifyCmdsHtml(it) + '<p>운영 반영 후 <b>SecurityScorecard 재스캔</b>으로 해당 Finding 해소를 확인합니다.</p>'
  const wrap = checklistHtml(it) + '<p class="note">일반 구성 기준 조치 방향입니다. 운영 반영 전 고객 내부 검토·테스트가 필요하며, 해소 여부는 SecurityScorecard 재스캔으로 확인합니다.</p>'
  return step('01', '개요', overviewBody(it))
    + step('02', '조치 방법', fixBody(it))
    + step('03', '확인', verify)
    + step('04', '마무리', wrap)
}

function sectionHtml(it, nav) {
  const sev = String(it.severity || '').toLowerCase()
  const kindBadge = it.kind === 'lab' ? '<span class="badge badge-lab">조치 전후 증거</span>' : '<span class="badge badge-guide">조치 가이드</span>'
  return `<section class="item" data-key="${esc(it.key)}">
    ${nav}
    <div class="item-head">
      <h2>${esc(it.name)}</h2>
      <div class="item-meta">
        <span class="badge" style="background:${sevColor(sev)}1a;color:${sevColor(sev)}">위험도 ${esc(SEV_KO[sev] || it.severity || '-')}</span>
        ${it.scoreImpact != null ? `<span class="badge badge-score">점수 개선 +${fmtImpact(it.scoreImpact)}</span>` : ''}
        ${kindBadge}
      </div>
    </div>
    ${it.kind === 'lab' ? labSection(it) : guideSection(it)}
    ${nav}
  </section>`
}

function coverRows(items) {
  return items.map((it) => {
    const sev = String(it.severity || '').toLowerCase()
    const kind = it.kind === 'lab'
      ? '<span class="badge badge-lab">조치 전후 증거</span>'
      : '<span class="badge badge-guide">조치 가이드</span>'
    return `<tr data-goto="${esc(it.key)}">
      <td class="name">${esc(it.name)}</td>
      <td><span class="badge" style="background:${sevColor(sev)}1a;color:${sevColor(sev)}">${esc(SEV_KO[sev] || it.severity || '-')}</span></td>
      <td class="num">${it.scoreImpact != null ? '+' + fmtImpact(it.scoreImpact) : '-'}</td>
      <td>${kind}</td>
      <td class="go">보기 →</td>
    </tr>`
  }).join('')
}

// 표지 우측 그래픽 — 도트 월드(우측 집중, 좌측 페이드) + 골드 네트워크. 딥 네이비 위 프리미엄.
function buildGlobe() {
  let s = 20260724
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
  const W = 620, H = 760
  let dots = ''
  for (let i = 0; i < 1000; i++) {
    const x = rnd() * W, y = rnd() * H
    const pr = x / W
    if (rnd() > pr * 0.92 + 0.04) continue
    const gold = rnd() < 0.06
    const blue = !gold && rnd() < 0.05
    const op = (0.08 + rnd() * 0.32).toFixed(2)
    const col = gold ? `rgba(201,166,107,${op})` : blue ? `rgba(120,170,230,${(+op + 0.14).toFixed(2)})` : `rgba(150,178,214,${op})`
    const r = (gold ? 1.5 : blue ? 1.8 : 0.9 + rnd() * 0.7).toFixed(1)
    dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${col}"/>`
  }
  const pts = [[300, 120], [400, 78], [500, 158], [560, 120], [440, 220], [520, 285], [380, 300], [300, 235], [470, 360], [560, 420], [400, 435], [500, 520], [330, 470], [560, 560], [430, 610]]
  const edges = [[0, 1], [1, 2], [2, 3], [0, 4], [1, 4], [4, 5], [4, 6], [6, 7], [0, 7], [5, 8], [8, 9], [6, 10], [10, 8], [9, 11], [10, 12], [8, 11], [11, 13], [10, 14]]
  const net = edges.map(([a, b]) => `<line x1="${pts[a][0]}" y1="${pts[a][1]}" x2="${pts[b][0]}" y2="${pts[b][1]}"/>`).join('')
  const nodes = pts.map(([x, y], i) => { const big = i % 3 === 0; return `<circle cx="${x}" cy="${y}" r="${big ? 3.2 : 2}" fill="#d8b56a"/>` + (big ? `<circle cx="${x}" cy="${y}" r="7.5" fill="none" stroke="rgba(201,166,107,.3)" stroke-width="1"/>` : '') }).join('')
  return `<svg class="mast-globe" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${dots}<g stroke="rgba(201,166,107,.32)" stroke-width="1">${net}</g>${nodes}</svg>`
}
const GLOBE_SVG = buildGlobe()
const LOGO_SVG = '<svg viewBox="0 0 48 48" width="42" height="42" aria-hidden="true"><path d="M24 3 L41.3 13 L41.3 35 L24 45 L6.7 35 L6.7 13 Z" fill="none" stroke="#C9A66B" stroke-width="2.2"/><path d="M24 14 L33 19.2 L33 29.6 L24 34.8 L15 29.6 L15 19.2 Z" fill="#C9A66B"/><circle cx="24" cy="24.4" r="3" fill="#071A2F"/></svg>'
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
function fmtDateEn(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso) || ''); if (!m) return String(iso || ''); return `${+m[3]} ${MONTHS_EN[+m[2] - 1]} ${m[1]}` }

export function buildReportHtml(d) {
  const items = d.items || []
  const gc = gradeColor(d.score)
  // 위험도 분포 막대
  const dist = d.dist || { high: 0, medium: 0, low: 0 }
  const distTotal = (dist.high + dist.medium + dist.low) || 1
  const distMeta = [['high', '높음', '#dc2626'], ['medium', '보통', '#f59e0b'], ['low', '낮음', '#64748b']]
  const distBars = distMeta.map(([k, lbl, col]) => `<div class="distrow"><span class="k">${lbl}</span><div class="bar"><i style="width:${Math.round((dist[k] / distTotal) * 100)}%;background:${col}"></i></div><span class="v">${dist[k] || 0}</span></div>`).join('')
  // 팩터별 점수 막대
  const factors = d.factors || []
  const factorRows = factors.map((f) => {
    const sc = f.score
    const col = sc == null ? '#64748b' : sc >= 80 ? '#16a34a' : sc >= 60 ? '#f59e0b' : '#dc2626'
    const w = sc == null ? 0 : Math.max(4, Math.min(100, sc))
    return `<div class="fac"><span class="n">${esc(f.name)}</span><div class="bar"><i style="width:${w}%;background:${col}"></i></div><span class="g" style="color:${col}">${f.grade ? esc(f.grade) + ' · ' : ''}${sc != null ? esc(sc) : '-'}</span></div>`
  }).join('')
  // 전역 페이지 순서(버튼 페이징) — 표지·요약·우선순위·각 항목.
  const order = ['__cover__', '__summary__', ...items.map((it) => it.key)]
  const orderJson = JSON.stringify(order)
  const pager = (key) => {
    const i = order.indexOf(key)
    const prev = i > 0 ? order[i - 1] : null
    const next = i < order.length - 1 ? order[i + 1] : null
    return `<div class="pager">${prev ? `<button data-goto="${esc(prev)}">← 이전</button>` : '<span class="pgx"></span>'}<span class="pager-mid">${i + 1} / ${order.length}</span>${next ? `<button class="nx" data-goto="${esc(next)}">다음 →</button>` : '<span class="pgx"></span>'}</div>`
  }
  const fontFace = d.fontDataUri
    ? `@font-face{font-family:'Pretendard';src:url('${d.fontDataUri}') format('woff2');font-weight:100 900;font-display:swap;}`
    : ''
  const fontStack = `${d.fontDataUri ? "'Pretendard'," : ''}-apple-system,BlinkMacSystemFont,'Segoe UI','Malgun Gothic',sans-serif`
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(d.customer)} · SecurityScorecard 보안 리스크 리포트</title>
<style>
${fontFace}
*{box-sizing:border-box}
body{margin:0;background:#f1f5f9;color:#0f172a;font-family:${fontStack};line-height:1.6;-webkit-font-smoothing:antialiased}
.wrap{max-width:960px;margin:0 auto;padding:24px 20px 64px}
/* ── 표지(마스트헤드) — Premium Enterprise (Navy #071A2F + Gold #C9A66B) ── */
.masthead{position:relative;overflow:hidden;background:#071A2F;min-height:100vh;display:flex;flex-direction:column;color:#EAF0F7}
.masthead::before{content:'';position:absolute;inset:0;background:radial-gradient(rgba(201,166,107,.06) 1px,transparent 1.5px) 0 0/30px 30px,linear-gradient(158deg,#0B2540 0%,#071A2F 55%,#04101E 100%);z-index:0}
.masthead::after{content:'';position:absolute;inset:26px;border:1px solid rgba(201,166,107,.26);pointer-events:none;z-index:2}
.mast-globe{position:absolute;top:0;right:0;width:62%;height:100%;z-index:1}
.mast-inner{position:relative;z-index:3;flex:1;display:flex;flex-direction:column;padding:9vh 9vw}
.mast-logo{display:flex;align-items:center;gap:13px}
.mast-logo .wm{display:flex;flex-direction:column;line-height:1.15}
.mast-logo .wm b{font-size:17px;letter-spacing:.14em;font-weight:700;color:#EAF0F7}
.mast-logo .wm span{font-size:12px;letter-spacing:.1em;color:#C9A66B}
.mast-center{margin-top:auto}
.mast-eyebrow{font-size:15px;letter-spacing:.32em;font-weight:600;color:#C9A66B;text-transform:uppercase;margin-top:16px}
.mast-title{font-size:54px;line-height:1.06;font-weight:800;letter-spacing:-.01em;color:#F4F7FB;margin:0}
.mast-rule{width:64px;height:2px;background:#C9A66B;margin:26px 0 22px}
.mast-sub{font-size:18px;font-weight:500;letter-spacing:.02em;color:#9FB1C6}
.mast-meta{margin-top:52px;display:flex;flex-direction:column;gap:5px}
.mast-meta .mc{font-size:20px;font-weight:700;color:#F4F7FB;letter-spacing:.01em}
.mast-meta .md{font-size:15px;color:#C9A66B;letter-spacing:.02em}
.mast-meta .mt{font-size:14px;color:#8598AE;letter-spacing:.06em}
.mast-foot{margin-top:56px;padding-top:16px;border-top:1px solid rgba(201,166,107,.3);font-size:11px;letter-spacing:.22em;color:#7B8CA3;text-transform:uppercase}
@media(max-width:640px){.mast-title{font-size:38px}.mast-inner{padding:7vh 34px}.mast-globe{opacity:.5}}
.pg{padding:22px 0}
.pager{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:24px 0 6px}
.pager .pgx{width:1px}
.pager button{background:#fff;border:1px solid #0F2038;color:#0F2038;font-size:13px;font-weight:600;padding:8px 16px;border-radius:8px;cursor:pointer}
.pager button:hover{background:#0F2038;color:#fff}
.pager button.nx{background:#0F2038;color:#fff}
.pager button.nx:hover{background:#1c3453}
.pager-mid{font-size:12.5px;color:#64748b;font-variant-numeric:tabular-nums}
.mast-cta{position:relative;z-index:3;margin-top:22px}
.mast-cta button{background:#C9A66B;border:none;color:#071A2F;font-size:14px;font-weight:700;padding:11px 22px;border-radius:8px;cursor:pointer;letter-spacing:.02em}
.mast-cta button:hover{background:#d8b87f}
.exec{margin-top:0;background:#fff;border:1px solid #e6e9ef;border-radius:14px;padding:24px 26px}
.exec-eyebrow{font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:#a8863f;font-weight:700}
.exec-eyebrow::after{content:'';display:block;width:38px;height:2px;background:#C9A66B;margin-top:9px}
.exec-grid{display:flex;align-items:center;gap:36px;flex-wrap:wrap;margin:20px 0 20px}
.exec-score{display:flex;align-items:center;gap:18px}
.exec-grade{width:94px;height:94px;border-radius:50%;border:5px solid;display:flex;align-items:center;justify-content:center;font-size:42px;font-weight:800;flex-shrink:0}
.exec-num{font-size:40px;font-weight:800;color:#0F2038;font-variant-numeric:tabular-nums;line-height:1}
.exec-num span{font-size:18px;color:#9aa6b6;font-weight:600}
.exec-lbl{font-size:13px;color:#64748b;margin-top:5px}
.exec-stats{display:flex;gap:12px;margin-left:auto}
.exec-stats div{display:flex;flex-direction:column;gap:3px;align-items:center;background:#f7f8fb;border:1px solid #eceff4;border-radius:10px;padding:12px 18px;min-width:88px}
.exec-stats b{font-size:26px;font-weight:800;color:#0F2038;font-variant-numeric:tabular-nums;line-height:1}
.exec-stats span{font-size:11.5px;color:#64748b;text-align:center}
.exec-desc{font-size:14px;color:#334155;line-height:1.75;margin:0;border-top:1px solid #eef1f6;padding-top:16px}
.exec-desc b{color:#0F2038}
.notice{background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:14px 16px;margin:18px 0;font-size:13px;color:#92400e}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:20px 22px;margin-top:16px}
.card h3{margin:0 0 4px;font-size:16px;color:#0F2038;font-weight:700}
.card .sub{margin:0 0 14px;color:#64748b;font-size:13px}
.scope{display:flex;flex-wrap:wrap;border:1px solid #e6e9ef;border-radius:12px;overflow:hidden;margin-bottom:16px;background:#fff}
.scope div{flex:1;min-width:150px;padding:12px 16px;border-right:1px solid #eef1f6}
.scope div:last-child{border-right:none}
.scope span{font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:#94a3b8;font-weight:700;display:block}
.scope b{font-size:14px;color:#0F2038}
.dist{margin:6px 0 2px}
.distrow{display:flex;align-items:center;gap:10px;margin:7px 0;font-size:13px}
.distrow .k{width:44px;color:#475569}
.distrow .bar{flex:1;height:9px;border-radius:5px;background:#eef1f6;overflow:hidden}
.distrow .bar i{display:block;height:100%;border-radius:5px}
.distrow .v{width:34px;text-align:right;font-variant-numeric:tabular-nums;color:#0F2038;font-weight:600}
.fac{display:flex;align-items:center;gap:12px;margin:9px 0}
.fac .n{width:190px;font-size:13px;color:#0F2038;font-weight:600}
.fac .bar{flex:1;height:9px;border-radius:5px;background:#eef1f6;overflow:hidden}
.fac .bar i{display:block;height:100%;border-radius:5px}
.fac .g{width:76px;text-align:right;font-size:13px;font-weight:700;font-variant-numeric:tabular-nums}
table.asset{width:100%;border-collapse:collapse;font-size:12.5px;margin:6px 0}
table.asset th{text-align:left;color:#64748b;font-weight:600;font-size:11.5px;padding:6px 8px;border-bottom:1px solid #e2e8f0}
table.asset td{padding:6px 8px;border-bottom:1px solid #f1f5f9;font-family:ui-monospace,Consolas,monospace;color:#334155;word-break:break-all}
.assetmore{font-size:12px;color:#64748b;margin:4px 0 0}
.check{list-style:none;margin:4px 0 6px;padding:0}
.check li{display:flex;gap:8px;align-items:flex-start;margin:6px 0;color:#334155;font-size:13.5px}
.check li::before{content:'';flex-shrink:0;width:15px;height:15px;margin-top:2px;border:1.5px solid #c4ccd8;border-radius:4px}
.log{margin:6px 0;padding:12px 14px;background:#0b1220;color:#9fb3cf;font-family:ui-monospace,Consolas,monospace;font-size:12px;line-height:1.7;border-radius:8px;white-space:pre-wrap;overflow-x:auto}
table.pri{width:100%;border-collapse:collapse;font-size:14px}
table.pri th{text-align:left;font-size:11.5px;letter-spacing:.04em;text-transform:uppercase;color:#0F2038;font-weight:700;padding:9px 10px;border-bottom:2px solid #C9A66B}
table.pri td{padding:11px 10px;border-bottom:1px solid #eef2f7;vertical-align:middle}
table.pri tr[data-goto]{cursor:pointer}
table.pri tr[data-goto]:hover{background:#f8fafc}
table.pri td.name{font-weight:600}
table.pri td.num{font-variant-numeric:tabular-nums;color:#16a34a;font-weight:600}
table.pri td.go{color:#0F2038;font-weight:700;white-space:nowrap;text-align:right}
table.pri tr[data-goto]:hover td.go{color:#a8863f}
.badge{display:inline-block;font-size:11.5px;font-weight:600;padding:3px 9px;border-radius:999px;white-space:nowrap}
.badge-lab{background:#eaeef4;color:#0F2038;border:1px solid #d7deea}
.badge-guide{background:#f7f4ec;color:#8a6d2f;border:1px solid #ece3cf}
.badge-score{background:#eef4ee;color:#3f7a4f;border:1px solid #d9e7dc}
.item{display:none}
.item.active{display:block}
.item-nav{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:2px 0 16px}
.item-nav button{background:#fff;border:1px solid #0F2038;color:#0F2038;font-size:13px;font-weight:600;padding:7px 15px;border-radius:8px;cursor:pointer}
.item-nav button:hover{background:#0F2038;color:#fff}
.item-nav button.ghost{border-color:transparent;color:#64748b;font-weight:500}
.item-nav button.ghost:hover{background:none;color:#0F2038}
.item-nav button.nx{background:#0F2038;color:#fff}
.item-nav button.nx:hover{background:#1c3453}
.item:last-of-type{margin-bottom:0}
.item .item-nav:last-child{margin:18px 0 0;border-top:1px solid #eef2f7;padding-top:16px}
.item-head{border-bottom:2px solid #C9A66B;padding-bottom:12px;margin-bottom:20px}
.item-head h2{margin:0 0 9px;font-size:21px;color:#0F2038;font-weight:800;letter-spacing:-.01em}
.item-meta{display:flex;gap:8px;flex-wrap:wrap}
.step{margin:0 0 20px}
.step-h{display:flex;align-items:center;gap:10px;font-size:15px;font-weight:700;color:#0f2038;margin-bottom:10px}
.step-n{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:6px;background:#C9A66B;color:#0F2038;font-size:12px;font-weight:800}
.step-b{padding-left:34px}
.step-b>p{margin:0 0 10px}
.ov-meta{display:flex;gap:20px;flex-wrap:wrap;margin-bottom:10px;font-size:13px;color:#64748b}
.ov-meta b{color:#0f2038}
.srcdiff{border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin:10px 0;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px}
.srcdiff-h{background:#f1f5f9;color:#475569;padding:6px 12px;font-family:inherit;font-size:12px;border-bottom:1px solid #e2e8f0}
.dl{padding:2px 12px;white-space:pre-wrap;word-break:break-all}
.dl.add{background:#f0fdf4;color:#15803d}
.dl.del{background:#fef2f2;color:#b91c1c}
.dl.ctx{color:#64748b}
.mini-t{font-size:13.5px;font-weight:700;color:#0F2038;margin:16px 0 6px}
.cnote{font-weight:400;font-size:11.5px;color:#94a3b8}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px}
.chip{font-size:12px;font-weight:600;padding:3px 10px;border-radius:999px;background:#f1f5f9;color:#334155;border:1px solid #e2e8f0}
.fw{margin:4px 0 6px;padding-left:20px}
.fw li{margin:3px 0;color:#334155;font-size:13px}
.fw li b{color:#0F2038}
.where{margin:4px 0 6px;padding-left:20px}
.where li{margin:3px 0;color:#334155}
.eng{border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin:8px 0}
.eng-h{background:#0F2038;color:#e8edf5;font-size:12px;font-weight:600;padding:7px 12px;letter-spacing:.02em}
.eng-c{margin:0;padding:12px 14px;background:#0b1220;color:#d6e2f2;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;white-space:pre-wrap;word-break:break-word;overflow-x:auto}
.vnote{font-size:12px;color:#64748b;margin:6px 0 0}
.ba{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:6px 0 16px}
.shot{margin:0;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#0b1220}
.shot img{display:block;width:100%;height:auto}
.shot figcaption{font-size:12px;color:#cbd5e1;padding:7px 10px;background:#0f172a}
.shot-ph .ph{color:#94a3b8;font-size:13px;text-align:center;padding:38px 12px;background:#f8fafc;border-radius:10px}
.shot-ph{background:#f8fafc}
.shot-ph .ph span{font-size:11px;color:#cbd5e1}
.shot-ph.shot-before .ph{border:1px dashed #fca5a5}
.shot-ph.shot-after .ph{border:1px dashed #86efac}
table.diff{width:100%;border-collapse:collapse;font-size:13px;margin:8px 0}
table.diff th{text-align:left;font-size:11.5px;color:#64748b;padding:7px 10px;border-bottom:2px solid #e2e8f0}
table.diff td{padding:8px 10px;border-bottom:1px solid #eef2f7;font-family:ui-monospace,Menlo,Consolas,monospace}
table.diff td.before{color:#b91c1c}
table.diff td.after{color:#15803d}
table.diff tr.changed{background:#fafcff}
.tool{font-size:12px;color:#64748b}
.tool code,table.diff td{word-break:break-all}
.block{margin:0 0 14px}
.block-t{font-size:12px;font-weight:700;color:#334155;margin-bottom:4px}
.block p{margin:0}
.steps{margin:6px 0 0;padding-left:20px}
.steps li{margin:4px 0}
.muted{color:#64748b}
.note{font-size:12.5px;color:#64748b;padding:11px 14px;margin-top:14px;background:#f8f9fb;border:1px solid #eceef2;border-radius:8px;line-height:1.65}
.foot{display:none}
.ai-box{background:#faf7f0;border:1px solid #efe7d5;border-radius:8px;padding:12px 16px;margin:12px 0}
.ai-t{font-size:12px;font-weight:700;color:#a8863f;margin-bottom:5px;letter-spacing:.02em}
.ai-box p{margin:0;color:#334155;line-height:1.7}
@media(max-width:640px){.ba{grid-template-columns:1fr}}
@media print{
  body{background:#fff}
  .wrap{max-width:100%;padding:0}
  #masthead{display:flex !important;min-height:auto;height:100vh;break-after:page;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  #masthead::before,#masthead::after,.mast-globe{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  #summary,#detail{display:block !important;padding:0}
  #summary{break-after:page}
  table.pri td.go{display:none}
  .item{display:block !important;break-before:page}
  .pager,.mast-cta{display:none}
  tr[data-goto]{cursor:default}
}
</style>
</head>
<body>
<section class="masthead" id="masthead">
  ${GLOBE_SVG}
  <div class="mast-inner">
    <div class="mast-logo">${LOGO_SVG}<div class="wm"><b>SECURITYSCORECARD</b><span>&amp; PINOLIKE</span></div></div>
    <div class="mast-center">
      <h1 class="mast-title">보안 리스크 리포트</h1>
      <div class="mast-eyebrow">Security Risk Report · ${esc(String(d.generatedAt).slice(0, 4))}</div>
      <div class="mast-rule"></div>
      <div class="mast-sub">기업의 사이버 보안 리스크를 종합적으로 분석한<br/>SecurityScorecard 평가 결과 보고서입니다.</div>
      <div class="mast-meta">
        <div class="mc">${esc(d.customer)}</div>
        <div class="md">${esc(d.shownDomain || d.domain)}</div>
        <div class="mt">${esc(fmtDateEn(d.generatedAt))}</div>
      </div>
    </div>
    <div class="mast-foot">Powering Security Ratings · Driving Risk Management</div>
    <div class="mast-cta"><button class="nx" data-goto="__summary__">리포트 시작 →</button></div>
  </div>
</section>
<div class="wrap">
  <section class="pg" id="summary">
    <div class="scope">
      <div><span>대상 도메인</span><b>${esc(d.shownDomain || d.domain)}</b></div>
      <div><span>평가 기준</span><b>SecurityScorecard 외부 관측</b></div>
      <div><span>등급 체계</span><b>A ~ F</b></div>
      <div><span>발행일</span><b>${esc(d.generatedAt)}</b></div>
    </div>
    <div class="exec">
      <div class="exec-eyebrow">Executive Summary · 요약</div>
      <div class="exec-grid">
        <div class="exec-score">
          <div class="exec-grade" style="color:${gc};border-color:${gc}">${d.grade ? esc(d.grade) : '—'}</div>
          <div class="exec-score-meta">
            <div class="exec-num">${d.score != null ? esc(d.score) : '—'}<span> / 100</span></div>
            <div class="exec-lbl">SecurityScorecard 보안등급</div>
          </div>
        </div>
        <div class="exec-stats">
          <div><b>${items.length}</b><span>조치 우선순위 (종)</span></div>
          <div><b>${items.filter((it) => it.kind === 'lab').length}</b><span>조치 전후 증거</span></div>
          <div><b>${items.filter((it) => it.kind === 'guide').length}</b><span>조치 가이드</span></div>
        </div>
      </div>
      <div class="mini-t">위험도 분포</div>
      <div class="dist">${distBars}</div>
      <p class="exec-desc">${esc(d.customer)}(${esc(d.shownDomain || d.domain)})에 대한 SecurityScorecard 외부 보안 평가 결과 총 <b>${items.length}개 유형</b>의 리스크가 확인되었으며 종합 등급은 <b>${d.grade ? esc(d.grade) : '—'}(${d.score != null ? esc(d.score) : '—'}점)</b>입니다. 아래 조치 우선순위는 <b>위험도와 점수 개선 효과</b> 순으로 정렬되어 있으며, 각 유형은 파트너 검증랩 재현 증적 또는 조치 가이드로 제공됩니다.</p>
    </div>
    ${factorRows ? `<div class="card"><h3>보안 팩터별 점수</h3><p class="sub">SecurityScorecard 팩터별 등급 — 종합 등급의 근거</p>${factorRows}</div>` : ''}
    <div class="notice">파트너 표준 검증랩 증적은 귀사 운영환경의 조치 완료를 의미하지 않습니다. 실제 Finding 해소 여부는 SecurityScorecard 재스캔 또는 공식 검증 절차를 통해 확인해야 합니다.</div>
    <div class="card">
      <h3>조치 우선순위</h3>
      <p class="sub">총 ${items.length}개 유형 · 위험도·점수 개선 순 · 유형을 클릭하면 해당 조치 페이지로 이동합니다</p>
      ${items.length
        ? `<table class="pri"><thead><tr><th>문제 유형</th><th>위험도</th><th>점수 개선</th><th>전달 형태</th><th></th></tr></thead><tbody>${coverRows(items)}</tbody></table>`
        : '<p class="muted">수집된 SecurityScorecard 리스크가 없습니다.</p>'}
    </div>
    ${pager('__summary__')}
  </section>

  <div id="detail">
    ${items.map((it) => sectionHtml(it, pager(it.key))).join('')}
  </div>

  <div class="foot">SecurityScorecard 기반 보안 리스크 리포트 · ${esc(d.customer)} · ${esc(d.generatedAt)}</div>
</div>
<script>
(function(){
  var order=${orderJson};
  var masthead=document.getElementById('masthead'), summary=document.getElementById('summary'), detail=document.getElementById('detail');
  var items=Array.prototype.slice.call(document.querySelectorAll('.item'));
  var cur='__cover__';
  function hideAll(){ [masthead,summary,detail].forEach(function(e){ if(e) e.style.display='none'; }); items.forEach(function(s){ s.classList.remove('active'); }); }
  function show(key){
    if(order.indexOf(key)<0) return;
    hideAll(); cur=key;
    if(key==='__cover__') masthead.style.display='';
    else if(key==='__summary__') summary.style.display='';
    else { detail.style.display=''; var it=null; items.forEach(function(s){ if(s.getAttribute('data-key')===key) it=s; }); if(it) it.classList.add('active'); }
    window.scrollTo(0,0);
  }
  document.querySelectorAll('[data-goto]').forEach(function(el){ el.addEventListener('click',function(){ show(el.getAttribute('data-goto')); }); });
  document.addEventListener('keydown',function(e){ var i=order.indexOf(cur); if(e.key==='ArrowRight'&&i<order.length-1)show(order[i+1]); if(e.key==='ArrowLeft'&&i>0)show(order[i-1]); });
  show('__cover__');
})();
</script>
</body>
</html>`
}
