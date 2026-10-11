// 用法：node fix_po_blood.js
// 作用：给「怪异克服天彗龙」「怪异克服天廻龙」补上「破怪的浓龙血」剥取条目
//   （与 items.js 的修正保持一致：该素材来自这两只怪的怪异调查任务 + 剥取）

const fs = require('fs');
const BASE = '/storage/emulated/0/000/PWA/mhrise-skill';

const raw = fs.readFileSync(BASE + '/monsters.js', 'utf8');
const startIdx = raw.indexOf('{', raw.indexOf('var monster_data'));
let depth = 0, endIdx = -1, inStr = false, esc = false;
for (let i = startIdx; i < raw.length; i++) {
  const ch = raw[i];
  if (inStr) {
    if (esc) esc = false;
    else if (ch === '\\') esc = true;
    else if (ch === '"') inStr = false;
    continue;
  }
  if (ch === '"') { inStr = true; continue; }
  if (ch === '{') depth++;
  else if (ch === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
}
const data = JSON.parse(raw.slice(startIdx, endIdx + 1));

const TARGETS = ['怪异克服天彗龙', '怪异克服天廻龙'];
const ITEM = '破怪的浓龙血';
// 参考「破怪的硬龙骨」的格式： rank=大师等级 / way=剥取素材
// 但浓龙血属于「怪异」档（前面已用 normRank 归入怪异），这里 rank 仍按原始数据写「大师等级」保持一致
let added = 0;
TARGETS.forEach(mk => {
  const mon = data[mk];
  if (!mon) { console.log('未找到: ' + mk); return; }
  if (!Array.isArray(mon.materials)) mon.materials = [];
  const exists = mon.materials.some(x => x.item === ITEM);
  if (exists) { console.log(mk + ': 已有 ' + ITEM + '，跳过'); return; }
  // 本体剥取 40%（参考同档怪异素材）
  mon.materials.push({ count: 'x1', item: ITEM, part: '本体', rank: '大师等级', rate: '40%', way: '剥取素材' });
  added++;
  console.log(mk + ': 已添加 ' + ITEM + ' 剥取');
});
console.log('共添加 ' + added + ' 条');

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