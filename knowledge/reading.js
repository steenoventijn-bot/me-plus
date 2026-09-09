export function articleWords(a){return ['intro','body','extra_fact','why_it_matters'].map(k=>String(a?.[k]||'').trim()).filter(Boolean).join(' ').split(/\s+/u).filter(Boolean).length}
// One estimate everywhere, at 200 words/minute. No arbitrary 30s minimum or 3min cap.
export function articleSeconds(a){return Math.max(1,Math.ceil(articleWords(a)*60/200))}
