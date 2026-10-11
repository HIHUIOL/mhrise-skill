const fs = require('fs');
const BASE = '/storage/emulated/0/000/PWA/mhrise-skill';

// 1. 读现有数据库
global.window = {};
require(BASE + '/quests.js');
const DB = window.quest_data;

// 2. 读抓取结果
const scraped = require('/tmp/scraped.json').results;

// 3. 字段映射：网页 Details 英文名 → 我们的中文/短名
//    设计新字段（保持简洁，前端友好）
const MAP = {
  RemMoney: 'money',          // 报酬金额
  TimeLimit: 'timeLimit',     // 时间限制(分)
  QuestLife: 'questLife',     // 猫车次数
  MapNo: 'mapNo',             // 地图编号
  RemVillagePoint: 'points',  // 村庄点数
  QuestNo: 'questNo',         // 任务内部编号
  QuestType: 'questType',     // 任务类型码
  QuestLv: 'questLv',         // 任务等级
  EnemyLv: 'enemyLv',         // 怪物等级
  BaseTime: 'baseTime',
  TimeVariation: 'timeVariation',
  IsTutorial: 'isTutorial',
};

let stat = { total: 0, money: 0, reward: 0, time: 0, life: 0, map: 0, prevNext: 0 };
const fail = [];

Object.keys(DB).forEach(k => {
  const q = DB[k];
  const s = scraped[k];
  stat.total++;
  if (!s) { fail.push(k); return; }

  // ---- Details 数值字段 ----
  const d = s.details || {};
  Object.keys(MAP).forEach(wk => {
    if (d[wk] !== undefined && d[wk] !== '') {
      q[MAP[wk]] = d[wk];
    }
  });
  if (q.money && q.money !== '0') stat.money++;
  if (q.timeLimit && q.timeLimit !== '0') stat.time++;
  if (q.questLife) stat.life++;
  if (q.mapNo) stat.map++;

  // ---- 上一任务 / 下一任务（只存名字，去掉箭头）----
  function stripNav(t) {
    if (!t) return '';
    return t.replace(/^[←\s]+/, '').replace(/[→\s]+$/, '').trim();
  }
  const pv = stripNav(d.Previous);
  const nx = stripNav(d.Next);
  if (pv) q.prev = pv;
  if (nx) q.next = nx;
  if (pv || nx) stat.prevNext++;

  // ---- 报酬金余额表 ----
  // 行格式: [素材名, common/additional, x数量, 概率%]
  if (s.reward && s.reward.length) {
    const common = [];
    const additional = [];
    s.reward.forEach(row => {
      if (row.length < 4) return;
      const item = { name: row[0], count: row[2].replace(/^x/, ''), rate: row[3] };
      if (row[1] === 'additional') additional.push(item);
      else common.push(item);
    });
    if (common.length || additional.length) {
      const rw = {};
      if (common.length) rw.common = common;
      if (additional.length) rw.additional = additional;
      q.reward = rw;
      stat.reward++;
    }
  }
});

console.log('=== 合并统计 ===');
console.log('  总任务: ' + stat.total);
console.log('  新增 money(报酬金额): ' + stat.money);
console.log('  新增 timeLimit(时间限制): ' + stat.time);
console.log('  新增 questLife(猫车次数): ' + stat.life);
console.log('  新增 mapNo(地图): ' + stat.map);
console.log('  新增 reward(报酬表): ' + stat.reward);
console.log('  新增 prev/next: ' + stat.prevNext);
console.log('  未匹配到抓取结果: ' + fail.length + (fail.length ? ' → ' + fail.slice(0,5).join(',') : ''));

// 4. 写回 quests.js
const header = '// quest_data: { 任务id: {name,cat,star,full,desc,goal,fail,hrp,mrp,mons,supply,money,timeLimit,questLife,mapNo,points,questNo,questType,questLv,enemyLv,baseTime,timeVariation,isTutorial,prev,next,reward} }\n';
const out = header + 'window.quest_data = ' + JSON.stringify(DB) + ';';
fs.writeFileSync(BASE + '/quests.js', out, 'utf8');
console.log('\n✅ 已写入 quests.js (' + (out.length/1024/1024).toFixed(2) + ' MB)');

// 5. 备份样本
const sample = DB['1429046733'];
console.log('\n=== 样本任务 1429046733 ===');
console.log(JSON.stringify({
  name: sample.name, money: sample.money, timeLimit: sample.timeLimit,
  questLife: sample.questLife, mapNo: sample.mapNo, points: sample.points,
  prev: sample.prev, next: sample.next,
  reward_common: (sample.reward||{}).common,
  reward_additional: (sample.reward||{}).additional,
}, null, 1).slice(0, 1500));