// 用法：node fix_item_anomaly_src.js
// 作用：修正 items.js 里 obtain[].quest 中「怪异 N★ 怪异调查：XXX」的星级
// 依据：怪异材料表（目标怪 → 星级）
// 注意：只改「怪异 …★ 怪异调查：…」，大师等级的「怪异克服：…」不动

const fs = require('fs');
const BASE = '/storage/emulated/0/000/PWA/mhrise-skill';

global.window = {};
require(BASE + '/items.js');
require(BASE + '/anomaly_materials.js');
const ITEMS = window.item_data;
const AM = window.ANOMALY_MATERIALS;

const starByMon = {};
AM.rows.forEach(r => {
  (r.mons || []).forEach(name => {
    if (starByMon[name] === undefined) starByMon[name] = r.star;
  });
});
const ALIAS = {
  '神秘红光天彗龙': '怪异克服天彗龙',
  '天廻龙': '怪异克服天廻龙',
  '霞龙': '怪异克服霞龙',
  '钢龙': '怪异克服钢龙',
  '炎王龙': '怪异克服炎王龙',
};

let changed = 0, missed = [];
Object.keys(ITEMS).forEach(k => {
  const it = ITEMS[k];
  if (!it || !Array.isArray(it.obtain)) return;
  it.obtain.forEach(o => {
    if (!o || typeof o.quest !== 'string') return;
    // 只处理「怪异 N★ 怪异调查：XXX」
    const m = o.quest.match(/^(怪异)\s*(\d+)★\s*怪异调查[:：]\s*(.+)$/);
    if (!m) return;
    let tg = m[3].trim();
    tg = ALIAS[tg] || tg;
    const st = starByMon[tg];
    if (st === undefined) { missed.push(o.quest); return; }
    if (Number(m[2]) === st) return; // 已正确
    o.quest = m[1] + ' ' + st + '★ 怪异调查：' + m[3];
    changed++;
  });
});

console.log('已修正: ' + changed + ' 条');
if (missed.length) console.log('未命中: ' + [...new Set(missed)].join(' | '));

const out = 'window.item_data = ' + JSON.stringify(ITEMS) + ';\n';
fs.writeFileSync(BASE + '/items.js', out, 'utf8');
const size = fs.statSync(BASE + '/items.js').size;
console.log('items.js 已写回，大小 ' + (size/1024/1024).toFixed(2) + ' MB');