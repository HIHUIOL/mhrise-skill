// 用法：node fix_mon_anom_mats.js
// 作用：把「该怪的怪异 3 档素材」写进 monsters.js 的数据层
//   给每只怪异怪加字段 anomalyMaterials: ["怪异化的骨","怪异化的硬骨","怪异化的重骨"]
//   来源：anomaly_materials.js 的系列 tiers
// 逻辑层不再需要反查 ANOMALY_MATERIALS
// 幂等
const fs = require('fs');
const DIR = '/storage/emulated/0/000/PWA/mhrise-skill/';

// 读 anomaly_materials.js（带注释，用 eval 解析）
const asrc = fs.readFileSync(DIR + 'anomaly_materials.js', 'utf8');
const ANOM = eval('(function(){var window={};' + asrc + ';return window.ANOMALY_MATERIALS;})()');

// 系列名 → [3 档素材名]
const seriesTiers = {};
(ANOM.rows || []).forEach(function (row) {
  if (!seriesTiers[row.series]) {
    seriesTiers[row.series] = (row.tiers || []).map(function (t) { return t.name; }).filter(Boolean);
  }
});

// 怪 → 系列
const monSeries = {};
(ANOM.rows || []).forEach(function (row) {
  (row.mons || []).forEach(function (m) {
    if (!monSeries[m]) monSeries[m] = row.series;
  });
});

// 读 monsters.js
const src = fs.readFileSync(DIR + 'monsters.js', 'utf8');
const ai = src.indexOf('var monster_data');
const bs = src.indexOf('{', ai);
let d = 0, e = -1, ins = false, esc = false;
for (let i = bs; i < src.length; i++) {
  const c = src[i];
  if (ins) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') ins = false; continue; }
  if (c === '"') { ins = true; continue; }
  if (c === '{') d++; else if (c === '}') { d--; if (!d) { e = i; break; } }
}
const M = JSON.parse(src.slice(bs, e + 1));
const head = src.slice(0, bs);
const tail = src.slice(e + 1);

let hit = 0, skip = 0;
Object.keys(monSeries).forEach(function (monName) {
  const tiers = seriesTiers[monSeries[monName]] || [];
  if (!M[monName] || !tiers.length) { skip++; return; }
  const cur = M[monName].anomalyMaterials;
  if (cur && JSON.stringify(cur) === JSON.stringify(tiers)) { skip++; return; }
  M[monName].anomalyMaterials = tiers.slice();
  hit++;
});

fs.writeFileSync(DIR + 'monsters.js', head + JSON.stringify(M) + tail);
console.log('写入 anomalyMaterials: ' + hit + ' 只怪（跳过 ' + skip + '）');
console.log('样本:');
Object.keys(monSeries).slice(0, 4).forEach(function (m) {
  console.log('  ' + m + ' → ' + JSON.stringify(M[m] && M[m].anomalyMaterials));
});