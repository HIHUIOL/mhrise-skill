// 用法：node fix_monster_anomaly.js
// 作用：从 monsters.js 中删除「怪异探究专属」材料的掉落行
// 依据：这些材料只有剥取、无任务报酬 → 属于怪异探究任务（带等级），本次不展示。

const fs = require('fs');
const BASE = '/storage/emulated/0/000/PWA/mhrise-skill';

const DROP = [
  '怪异化的上等凶鳞', '怪异化的上等皮', '怪异化的上等鳞', '怪异化的净浓血',
  '怪异化的净血', '怪异化的凶刚爪', '怪异化的凶刚翼', '怪异化的凶刚角',
  '怪异化的凶厚鳞', '怪异化的凶坚壳', '怪异化的凶尖爪', '怪异化的凶尖角',
  '怪异化的凶牙', '怪异化的凶硬骨', '怪异化的凶翼膜', '怪异化的凶血',
  '怪异化的凶重壳', '怪异化的凶重牙', '怪异化的凶重骨', '怪异化的刚爪',
  '怪异化的厚皮', '怪异化的厚鳞', '怪异化的坚壳', '怪异化的坚龙骨',
  '怪异化的尖爪', '怪异化的硬骨', '怪异化的重壳', '怪异化的重牙',
  '怪异化的重骨', '怪异化的重龙骨', '怪异化的锐牙', '破怪的龙骨',
];

const raw = fs.readFileSync(BASE + '/monsters.js', 'utf8');
// 定位 var monster_data = { ... };  用括号配对（避免贪婪正则多吞）
const startIdx = raw.indexOf('{', raw.indexOf('var monster_data'));
if (startIdx < 0) { console.error('无法找到 data 起始'); process.exit(1); }
let depth = 0, endIdx = -1, inStr = false, esc = false;
for (let i = startIdx; i < raw.length; i++) {
  const ch = raw[i];
  if (inStr) {
    if (esc) { esc = false; }
    else if (ch === '\\') { esc = true; }
    else if (ch === '"') { inStr = false; }
    continue;
  }
  if (ch === '"') { inStr = true; continue; }
  if (ch === '{') depth++;
  else if (ch === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
}
if (endIdx < 0) { console.error('无法找到 data 结束'); process.exit(1); }
const data = JSON.parse(raw.slice(startIdx, endIdx + 1));

const dropSet = {};
DROP.forEach(n => { dropSet[n] = true; });

let removed = 0;
Object.keys(data).forEach(mk => {
  const mon = data[mk];
  if (!Array.isArray(mon.materials)) return;
  const before = mon.materials.length;
  mon.materials = mon.materials.filter(x => !dropSet[x.item]);
  removed += before - mon.materials.length;
});
console.log('已删除掉落行: ' + removed);

const HEADER = '// ============================================================\n' +
  '// 怪物数据（自动抓取自 Kiranico /zh/data/monsters）\n' +
  '// materials 素材表: [{item,rank,way,part,count,rate}]\n' +
  '//   rank = 下位/上位/大师等级   way = 剥取素材/目标报酬/…\n' +
  '// hitzones  部位肉质 | ailments 异常耐性 | quests 出现任务\n' +
  '// 注：怪异素材仅保留「怪异调查任务」（不带等级）相关掉落；\n' +
  '//     「怪异探究任务」（带等级）专属材料已移除。\n' +
  '// 共 112 只\n' +
  '// ============================================================\n';
fs.writeFileSync(BASE + '/monsters.js', HEADER + 'var monster_data = ' + JSON.stringify(data) + ';\n', 'utf8');
console.log('monsters.js 已写回');