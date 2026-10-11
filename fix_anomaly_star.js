// 用法：node fix_anomaly_star.js
// 作用：把 quests.js 里「怪异任务」的 star 从统一的 6 改成「怪异等级」（1~9）
// 依据：anomaly_materials.js 里每只怪所属星级的系列（目标怪 → 星级）

const fs = require('fs');
const BASE = '/storage/emulated/0/000/PWA/mhrise-skill';

global.window = {};
require(BASE + '/quests.js');
require(BASE + '/anomaly_materials.js');
const Q = window.quest_data;
const AM = window.ANOMALY_MATERIALS;

// 怪名 → 星级
const starByMon = {};
AM.rows.forEach(r => {
  (r.mons || []).forEach(name => {
    if (starByMon[name] === undefined) starByMon[name] = r.star;
  });
});

// 别名（任务名里写法 → 材料表里写法）
const ALIAS = {
  '神秘红光天彗龙': '怪异克服天彗龙',
  '天廻龙': '怪异克服天廻龙',
  '霞龙': '怪异克服霞龙',
  '钢龙': '怪异克服钢龙',
  '炎王龙': '怪异克服炎王龙',
};

let changed = 0, missed = [];
Object.keys(Q).forEach(k => {
  const q = Q[k];
  if ((q.cat || '') !== '怪异任务') return;
  const m = String(q.name || '').match(/^怪异调查[:：]\s*(.+)$/);
  if (!m) { missed.push(q.name); return; }
  let tg = m[1].trim();
  tg = ALIAS[tg] || tg;
  const st = starByMon[tg];
  if (st === undefined) { missed.push(q.name); return; }
  q.star = st;
  // 同步修正 full（如「怪异 6★ 怪异调查：天廻龙」→「怪异 9★ ...」）
  if (q.full) q.full = String(q.full).replace(/(\d+)(?=★)/, st);
  changed++;
});

console.log('已修正: ' + changed + ' 条');
if (missed.length) console.log('未命中: ' + missed.join(', '));

// 写回 quests.js（保持 window.quest_data = {...} 格式）
const out = 'window.quest_data = ' + JSON.stringify(Q) + ';\n';
fs.writeFileSync(BASE + '/quests.js', out, 'utf8');
const size = fs.statSync(BASE + '/quests.js').size;
console.log('quests.js 已写回，大小 ' + (size/1024/1024).toFixed(2) + ' MB');