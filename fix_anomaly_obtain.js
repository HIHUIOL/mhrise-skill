// 用法：node fix_anomaly_obtain.js
// 作用（怪异调查任务范围的数据修正）：
//   ① 去掉「只有剥取、无任务报酬」的材料条目（这些属于怪异探究任务，暂不展示）
//   ② 「破怪的浓龙血」补上剥取来源（怪异克服天彗龙 / 怪异克服天廻龙）
//
// 依据：有任务报酬的怪异素材 = 怪异调查任务的产物；
//       只有剥取无报酬的 = 怪异探究任务（带等级）的产物，本次不展示。

const fs = require('fs');
const BASE = '/storage/emulated/0/000/PWA/mhrise-skill';

global.window = {};
require(BASE + '/items.js');
const ITEMS = window.item_data;

// ① 找出「只有剥取、无任务报酬」的怪异素材，清空其 obtain
const anomItems = Object.keys(ITEMS).filter(k => /^(怪异化的|破怪的)/.test(k));
let cleared = [], kept = 0;
anomItems.forEach(n => {
  const ob = ITEMS[n].obtain || [];
  const hasAdd = ob.some(o => o.type === 'additional' || /任务|报酬/.test(o.type || ''));
  const hasCarve = ob.some(o => /剥取/.test(o.type || ''));
  if (hasCarve && !hasAdd) {
    ITEMS[n].obtain = [];
    cleared.push(n);
  } else if (hasCarve || hasAdd) {
    kept++;
  }
});
console.log('① 已清空（仅剥取/怪异探究专属）: ' + cleared.length + ' 个');
console.log('   ' + cleared.join(', '));
console.log('   保留有数据的怪异素材: ' + kept + ' 个');

// ② 「破怪的浓龙血」补剥取来源
const monBlood = ITEMS['破怪的浓龙血'];
if (monBlood) {
  const carveMons = ['怪异克服天彗龙', '怪异克服天廻龙'];
  const existCarve = (monBlood.obtain || []).some(o => /剥取/.test(o.type || ''));
  if (!existCarve) {
    carveMons.forEach(m => {
      monBlood.obtain.push({ count: 'x1', quest: m, rank: '怪异', rate: '40%', type: '剥取素材 本体' });
    });
    console.log('\n② 「破怪的浓龙血」已补剥取: ' + carveMons.join(', '));
  } else {
    console.log('\n② 「破怪的浓龙血」已有剥取，跳过');
  }
} else {
  console.log('\n② 未找到「破怪的浓龙血」');
}

// 写回
const out = 'window.item_data = ' + JSON.stringify(ITEMS) + ';\n';
const HEADER = '// ============================================================\n' +
  '// 道具数据（自动抓取自 Kiranico /zh/data/items）\n' +
  '// 字段: desc 说明 | obtain 获得途径[{quest,type,count,rate}]\n' +
  '// 注：怪异素材仅保留「怪异调查任务」（不带等级）相关条目；\n' +
  '//     「怪异探究任务」（带等级）专属材料暂不展示。\n' +
  '// ============================================================\n';
fs.writeFileSync(BASE + '/items.js', HEADER + out, 'utf8');
console.log('\nitems.js 已写回');