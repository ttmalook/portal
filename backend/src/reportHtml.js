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
  const meta = `<div class="ov-meta"><span>위험도 <b style="color:${sevColor(sev)}">${esc(SEV_KO[sev] || it.severity || '-')}</b></span>${it.category ? `<span>분류 <b>${esc(it.category)}</b></span>` : ''}${it.scoreImpact != null ? `<span>점수 개선 <b style="color:#15803d">+${fmtImpact(it.scoreImpact)}</b></span>` : ''}</div>`
  return meta + (it.sscDesc ? `<p>${esc(it.sscDesc)}</p>` : '')
}

function fixBody(it) {
  const g = it.guide || {}
  const parts = []
  if (g.direction) parts.push(`<p>${esc(g.direction)}</p>`)
  const sl = stepsList(g.steps); if (sl) parts.push(sl)
  if (it.sourceDiff) parts.push(sourceDiffHtml(it.sourceDiff))
  if (g.sscRec) parts.push(`<div class="block"><div class="block-t">SecurityScorecard 공식 권고</div><p>${esc(g.sscRec)}</p></div>`)
  return parts.join('') || '<p class="muted">해당 유형의 표준 조치 방향을 준비 중입니다.</p>'
}

function labSection(it) {
  const ev = it.evidence || {}
  const ba = `<div class="ba">${imgOrPlaceholder(ev.beforeImg, ev.beforeLabel || '조치 전', 'before')}${imgOrPlaceholder(ev.afterImg, ev.afterLabel || '조치 후', 'after')}</div>`
  const observe = diffTable(ev.diff) + (ev.tool ? `<p class="tool">확인 도구: <code>${esc(ev.tool)}</code></p>` : '') + '<p class="muted">관측값은 파트너 검증랩 재현 결과입니다. 고객 운영환경의 실제 해소 여부는 <b>SecurityScorecard 재스캔</b>으로 확인합니다.</p>'
  return step('01', '개요', overviewBody(it))
    + step('02', '조치 방법', fixBody(it))
    + step('03', '조치 전 / 후', ba)
    + step('04', '관측값 · 확인', observe)
    + step('05', '마무리', '<p class="note">파트너 표준 검증랩에서 조치 전 → 조치 후를 재현한 참고 증적입니다. 귀사 운영환경의 조치 완료를 의미하지 않으며, 실제 Finding 해소 여부는 SecurityScorecard 재스캔 또는 공식 검증 절차로 확인해야 합니다.</p>')
}

function guideSection(it) {
  const g = it.guide || {}
  const verify = '<p>운영 반영 후 <b>SecurityScorecard 재스캔</b>으로 해당 Finding 해소를 확인합니다.</p>' + (g.sscDesc ? `<div class="block"><div class="block-t">SSC 설명</div><p class="muted">${esc(g.sscDesc)}</p></div>` : '')
  return step('01', '개요', overviewBody(it))
    + step('02', '조치 방법', fixBody(it))
    + step('03', '확인', verify)
    + step('04', '마무리', '<p class="note">일반 구성 기준 조치 방향입니다. 운영 반영 전 고객 내부 검토·테스트가 필요하며, 해소 여부는 SecurityScorecard 재스캔으로 확인합니다.</p>')
}

function navBar(i, arr) {
  const prev = i > 0 ? arr[i - 1].key : '__cover__'
  const next = i < arr.length - 1 ? arr[i + 1].key : '__cover__'
  const prevL = i > 0 ? '← 이전' : '← 목록'
  const nextL = i < arr.length - 1 ? '다음 →' : '목록 →'
  return `<div class="item-nav"><button data-goto="${esc(prev)}">${prevL}</button><button class="ghost" data-goto="__cover__">목록 · ${i + 1} / ${arr.length}</button><button class="nx" data-goto="${esc(next)}">${nextL}</button></div>`
}

function sectionHtml(it, i, arr) {
  const sev = String(it.severity || '').toLowerCase()
  const kindBadge = it.kind === 'lab' ? '<span class="badge badge-lab">조치 전후 증거</span>' : '<span class="badge badge-guide">조치 가이드</span>'
  return `<section class="item" data-key="${esc(it.key)}">
    ${navBar(i, arr)}
    <div class="item-head">
      <h2>${esc(it.name)}</h2>
      <div class="item-meta">
        <span class="badge" style="background:${sevColor(sev)}1a;color:${sevColor(sev)}">위험도 ${esc(SEV_KO[sev] || it.severity || '-')}</span>
        ${it.scoreImpact != null ? `<span class="badge badge-score">점수 개선 +${fmtImpact(it.scoreImpact)}</span>` : ''}
        ${kindBadge}
      </div>
    </div>
    ${it.kind === 'lab' ? labSection(it) : guideSection(it)}
    ${navBar(i, arr)}
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

// 표지 배경 액센트 — 아주 약한 골드 폴리곤 라인(로고 헥사곤 모티프). 절제·정적.
const ACCENT_SVG = '<svg class="mast-accent" viewBox="0 0 460 620" preserveAspectRatio="xMidYMid meet" aria-hidden="true">'
  + '<g fill="none" stroke="#C9A66B">'
  + '<polygon points="230,70 395,165 395,355 230,450 65,355 65,165" stroke-opacity="0.16" stroke-width="1"/>'
  + '<polygon points="230,160 315,210 315,310 230,360 145,310 145,210" stroke-opacity="0.11" stroke-width="1"/>'
  + '<line x1="230" y1="70" x2="230" y2="160" stroke-opacity="0.09"/><line x1="395" y1="165" x2="315" y2="210" stroke-opacity="0.09"/>'
  + '<line x1="395" y1="355" x2="315" y2="310" stroke-opacity="0.09"/><line x1="65" y1="165" x2="145" y2="210" stroke-opacity="0.09"/>'
  + '</g><g fill="#C9A66B" fill-opacity="0.45">'
  + '<circle cx="230" cy="70" r="2.4"/><circle cx="395" cy="165" r="2.4"/><circle cx="395" cy="355" r="2.4"/><circle cx="230" cy="450" r="2.4"/><circle cx="65" cy="355" r="2.4"/><circle cx="65" cy="165" r="2.4"/>'
  + '</g></svg>'
const LOGO_SVG = '<svg viewBox="0 0 48 48" width="42" height="42" aria-hidden="true"><path d="M24 3 L41.3 13 L41.3 35 L24 45 L6.7 35 L6.7 13 Z" fill="none" stroke="#C9A66B" stroke-width="2.2"/><path d="M24 14 L33 19.2 L33 29.6 L24 34.8 L15 29.6 L15 19.2 Z" fill="#C9A66B"/><circle cx="24" cy="24.4" r="3" fill="#071A2F"/></svg>'
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
function fmtDateEn(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso) || ''); if (!m) return String(iso || ''); return `${+m[3]} ${MONTHS_EN[+m[2] - 1]} ${m[1]}` }

export function buildReportHtml(d) {
  const items = d.items || []
  const gc = gradeColor(d.score)
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
.mast-accent{position:absolute;top:12%;right:-4%;width:52%;height:76%;z-index:1;opacity:.9}
.mast-inner{position:relative;z-index:3;flex:1;display:flex;flex-direction:column;padding:9vh 9vw}
.mast-logo{display:flex;align-items:center;gap:13px}
.mast-logo .wm{display:flex;flex-direction:column;line-height:1.15}
.mast-logo .wm b{font-size:17px;letter-spacing:.14em;font-weight:700;color:#EAF0F7}
.mast-logo .wm span{font-size:12px;letter-spacing:.1em;color:#C9A66B}
.mast-center{margin-top:auto}
.mast-eyebrow{font-size:14px;letter-spacing:.34em;font-weight:600;color:#C9A66B;text-transform:uppercase}
.mast-title{font-size:52px;line-height:1.12;font-weight:800;letter-spacing:-.01em;color:#F4F7FB;margin:18px 0 0}
.mast-rule{width:64px;height:2px;background:#C9A66B;margin:26px 0 22px}
.mast-sub{font-size:18px;font-weight:500;letter-spacing:.02em;color:#9FB1C6}
.mast-meta{margin-top:52px;display:flex;flex-direction:column;gap:5px}
.mast-meta .mc{font-size:20px;font-weight:700;color:#F4F7FB;letter-spacing:.01em}
.mast-meta .md{font-size:15px;color:#C9A66B;letter-spacing:.02em}
.mast-meta .mt{font-size:14px;color:#8598AE;letter-spacing:.06em}
.mast-foot{margin-top:56px;padding-top:16px;border-top:1px solid rgba(201,166,107,.3);font-size:11px;letter-spacing:.22em;color:#7B8CA3;text-transform:uppercase}
@media(max-width:640px){.mast-title{font-size:38px}.mast-inner{padding:7vh 34px}.mast-accent{opacity:.5}}
.page{min-height:100vh;display:flex;flex-direction:column;justify-content:center;padding:6vh 0}
.page .exec{margin-top:0;width:100%}
.exec{margin-top:20px;background:#fff;border:1px solid #e6e9ef;border-radius:14px;padding:24px 26px}
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
.card h3{margin:0 0 4px;font-size:16px;color:#0F2038;font-weight:700;position:relative;padding-left:13px}
.card h3::before{content:'';position:absolute;left:0;top:3px;bottom:3px;width:3px;border-radius:2px;background:#C9A66B}
.card .sub{margin:0 0 14px;color:#64748b;font-size:13px;padding-left:13px}
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
.step-n{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:6px;background:#0f2038;color:#fff;font-size:12px;font-weight:700}
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
.note{font-size:12px;color:#64748b;border-left:3px solid #cbd5e1;padding:6px 12px;margin-top:14px;background:#f8fafc;border-radius:0 8px 8px 0}
.foot{margin-top:24px;font-size:11.5px;color:#94a3b8;text-align:center}
@media(max-width:640px){.ba{grid-template-columns:1fr}}
@media print{
  body{background:#fff}
  .wrap{max-width:100%;padding:0}
  #masthead{display:flex !important;min-height:auto;height:100vh;break-after:page;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  #masthead::before,#masthead::after,.mast-accent{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  #execpage,#notice{display:block !important}
  #execpage{min-height:auto;padding:0;break-after:page}
  #overview{display:block !important;break-after:page}
  table.pri td.go{display:none}
  .item{display:block !important;break-before:page}
  .item-nav{display:none}
  tr[data-goto]{cursor:default}
}
</style>
</head>
<body>
<section class="masthead" id="masthead">
  ${ACCENT_SVG}
  <div class="mast-inner">
    <div class="mast-logo">${LOGO_SVG}<div class="wm"><b>SECURITYSCORECARD</b><span>파트너</span></div></div>
    <div class="mast-center">
      <div class="mast-eyebrow">Security Risk Assessment</div>
      <h1 class="mast-title">보안 리스크<br/>평가 보고서</h1>
      <div class="mast-rule"></div>
      <div class="mast-sub">SecurityScorecard 기반 외부 보안 리스크 평가</div>
      <div class="mast-meta">
        <div class="mc">${esc(d.customer)}</div>
        <div class="md">${esc(d.shownDomain || d.domain)}</div>
        <div class="mt">${esc(fmtDateEn(d.generatedAt))}</div>
      </div>
    </div>
    <div class="mast-foot">Powering Security Ratings · Driving Risk Management</div>
  </div>
</section>
<div class="wrap">
  <section class="page" id="execpage"><div class="exec">
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
    <p class="exec-desc">${esc(d.customer)}(${esc(d.shownDomain || d.domain)})에 대한 SecurityScorecard 외부 보안 평가 결과 총 <b>${items.length}개 유형</b>의 리스크가 확인되었습니다. 아래 조치 우선순위는 <b>위험도와 점수 개선 효과</b> 순으로 정렬되어 있으며, 각 유형은 파트너 검증랩 재현 증적 또는 조치 가이드로 제공됩니다.</p>
  </div></section>

  <div class="notice" id="notice">파트너 표준 검증랩 증적은 귀사 운영환경의 조치 완료를 의미하지 않습니다. 실제 Finding 해소 여부는 SecurityScorecard 재스캔 또는 공식 검증 절차를 통해 확인해야 합니다.</div>

  <div id="overview" class="card">
    <h3>조치 우선순위</h3>
    <p class="sub">총 ${items.length}개 유형 · 위험도·점수 개선 순 · 유형을 클릭하면 조치/증적을 봅니다</p>
    ${items.length
      ? `<table class="pri"><thead><tr><th>문제 유형</th><th>위험도</th><th>점수 개선</th><th>전달 형태</th><th></th></tr></thead><tbody>${coverRows(items)}</tbody></table>`
      : '<p class="muted">수집된 SecurityScorecard 리스크가 없습니다.</p>'}
  </div>

  <div class="card" id="detail">
    ${items.map(sectionHtml).join('')}
  </div>

  <div class="foot">SecurityScorecard 기반 보안 리스크 리포트 · ${esc(d.customer)} · ${esc(d.generatedAt)}</div>
</div>
<script>
(function(){
  var ids=['masthead','execpage','notice','overview'];
  var summary=ids.map(function(id){return document.getElementById(id)}).filter(Boolean);
  var detail=document.getElementById('detail');
  var items=Array.prototype.slice.call(document.querySelectorAll('.item'));
  function show(key){
    if(key==='__cover__'){ summary.forEach(function(e){e.style.display=''}); detail.style.display='none'; items.forEach(function(s){s.classList.remove('active')}); window.scrollTo(0,0); return; }
    var found=false;
    items.forEach(function(s){ var on=s.getAttribute('data-key')===key; s.classList.toggle('active',on); if(on)found=true; });
    summary.forEach(function(e){e.style.display='none'}); detail.style.display=found?'':'none'; window.scrollTo(0,0);
  }
  document.querySelectorAll('[data-goto]').forEach(function(el){ el.addEventListener('click',function(){ show(el.getAttribute('data-goto')); }); });
  show('__cover__');
})();
</script>
</body>
</html>`
}
