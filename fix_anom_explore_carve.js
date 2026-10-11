// 用法：node fix_anom_explore_carve.js
// 作用：给怪异怪的「中/高档素材」（硬骨/重骨等）补「怪异探究剥取」记录
//   规则：每只怪异怪的每档素材，加一条 {way:"剥取素材", part:"本体", anomLv:该档Lv, rank:"怪异", count:"x1", rate}
//   ⚠️ 中/高档不加 carveSrc（它们不通过怪异调查剥取）；基础档已有 carveSrc，保留
//   ⚠️ 基础档的「怪异探究」行也补上（如果缺）
//   同步写 monsters.js（怪物界面）和 items.js（材料界面）
// 幂等
const fs = require('fs');
const DIR = '/storage/emulated/0/000/PWA/mhrise-skill/';

function readData(file, marker) {
  const src = fs.readFileSync(DIR + file, 'utf8');
  const ai = src.indexOf(marker);
  const bs = src.indexOf('{', ai);
  let d = 0, e = -1, ins = false, esc = false;
  for (let i = bs; i < src.length; i++) {
    const c = src[i];
    if (ins) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') ins = false; continue; }
    if (c === '"') { ins = true; continue; }
    if (c === '{') d++; else if (c === '}') { d--; if (!d) { e = i; break; } }
  }
  return { head: src.slice(0, bs), tail: src.slice(e + 1), data: JSON.parse(src.slice(bs, e + 1)) };
}

// 读 anomaly_materials.js
const asrc = fs.readFileSync(DIR + 'anomaly_materials.js', 'utf8');
const ANOM = eval('(function(){var window={};' + asrc + ';return window.ANOMALY_MATERIALS;})()');

// 怪 → [{name, lv}]（该怪所属系列的全部档位）
const monTiers = {};
(ANOM.rows || []).forEach(function (row) {
  (row.mons || []).forEach(function (m) {
    if (!monTiers[m]) monTiers[m] = (row.tiers || []).filter(t => t && t.name);
  });
});

// ---------- ① monsters.js ----------
{
  const f = readData('monsters.js', 'var monster_data');
  const M = f.data;
  let added = 0, skip = 0;
  Object.keys(monTiers).forEach(function (nm) {
    if (!M[nm]) return;
    if (!M[nm].materials) M[nm].materials = [];
    // 该怪怪异剥取的 rate（沿用已有那条）
    const baseRate = (M[nm].materials.find(x => /^(怪异化的|破怪的)/.test(String(x.item||'')) && String(x.way||'')==='剥取素材') || {}).rate || '40%';
    monTiers[nm].forEach(function (t) {
      const dup = M[nm].materials.some(function (x) {
        return x.item === t.name && String(x.way||'') === '剥取素材' && x.anomLv === t.lv;
      });
      if (dup) { skip++; return; }
      M[nm].materials.push({
        count: 'x1',
        item: t.name,
        part: '本体',
        rank: '怪异',
        rate: baseRate,
        way: '剥取素材',
        anomLv: t.lv
      });
      added++;
    });
  });
  fs.writeFileSync(DIR + 'monsters.js', f.head + JSON.stringify(M) + f.tail);
  console.log('monsters.js 新增怪异探究剥取: ' + added + '（跳过 ' + skip + '）');
}

// ---------- ② items.js ----------
{
  const f = readData('items.js', 'window.item_data');
  const I = f.data;
  let added = 0, skip = 0;
  Object.keys(monTiers).forEach(function (nm) {
    monTiers[nm].forEach(function (t) {
      const it = I[t.name];
      if (!it) return;
      if (!it.obtain) it.obtain = [];
      const dup = it.obtain.some(function (o) {
        return o.quest === nm && o.carveSrc === '怪异探究' && o.anomLv === t.lv;
      });
      if (dup) { skip++; return; }
      it.obtain.push({
        count: 'x1',
        quest: nm,
        rank: '怪异',
        rate: '40%',
        type: '剥取素材',
        carveSrc: '怪异探究',
        anomLv: t.lv,
        part: '本体'
      });
      added++;
    });
  });
  fs.writeFileSync(DIR + 'items.js', f.head + JSON.stringify(I) + f.tail);
  console.log('items.js 新增怪异探究剥取: ' + added + '（跳过 ' + skip + '）');
}