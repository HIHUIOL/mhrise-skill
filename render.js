// mhrise-skill / render.js
// 渲染 + 搜索 + 武器差分全展示

(function () {
  // ========================================================
  // 武器ID → 名称映射（如与实际游戏不符，改这里即可）
  // ========================================================
  const WEAPON_NAMES = {
    0: '大剑',
    1: '太刀',
    2: '片手剑',
    3: '双剑',
    4: '大锤',
    5: '狩猎笛',
    6: '长枪',
    7: '铳枪',
    8: '斩斧',
    9: '盾斧',
    10: '操虫棍',
    11: '轻弩',
    12: '重弩',
    13: '弓'
  };

  // 远程武器 ID（用于 ranged / ranged_by_index 判断）
  const RANGED_IDS = [11, 12, 13];

  // ========================================================
  // 启动
  // ========================================================
  window.addEventListener('DOMContentLoaded', function () {
    if (!window.SKILL_DATA) {
      console.error('[mhrise-skill] 未找到 SKILL_DATA');
      document.getElementById('skillsContainer').innerHTML =
        '<div style="color:#f88;padding:1rem;">数据未加载，请检查 skillData.js</div>';
      document.getElementById('rampageContainer').innerHTML =
        '<div style="color:#f88;padding:1rem;">数据未加载，请检查 skillData.js</div>';
      return;
    }

    const data = window.SKILL_DATA;

    // ---------- 工具函数 ----------
    function formatText(text) {
      if (typeof text !== 'string') return '';
      return text
        .replace(/\\n/g, '\n')
        .replace(/<COLOR FFC000>/gi, '<span class="color-highlight">')
        .replace(/<\/COLOR>/gi, '</span>')
        .replace(/\n/g, '<br>');
    }

    function getLevelText(item) {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && item.text) return item.text;
      return '';
    }

    // 把武器ID数组转成"片手剑、双剑、盾斧、斩斧"形式
    function weaponLabel(ids) {
      return ids.map(id => WEAPON_NAMES[id] || `武器${id}`).join('、');
    }

    // ---------- 模板替换 ----------
    // 用 values 和可选的 weaponValues 覆盖 {xxx}
    function fillTemplate(tpl, values, weaponValues) {
      const merged = Object.assign({}, values, weaponValues || {});
      return tpl.replace(/\{(\w+)\}/g, (_, key) =>
        merged[key] !== undefined ? merged[key] : `{${key}}`
      );
    }

    // ---------- 收集默认等级文本 ----------
    function collectDefaultLevels(skill) {
      let levelTexts = [];

      if (Array.isArray(skill.levels)) {
        levelTexts = skill.levels.map(getLevelText);
      } else if (Array.isArray(skill.default)) {
        levelTexts = skill.default.map(getLevelText);
      } else if (skill.levels_by_index) {
        const maxIdx = Math.max(...Object.keys(skill.levels_by_index).map(Number));
        for (let i = 0; i <= maxIdx; i++) {
          levelTexts[i] = skill.levels_by_index[i] !== undefined
            ? getLevelText(skill.levels_by_index[i])
            : null;
        }
      } else if (Array.isArray(skill.template)) {
        const values = skill.values || {};
        levelTexts = skill.template.map(tpl => fillTemplate(tpl, values, null));
      }

      return levelTexts;
    }

    // ---------- 收集所有武器差分 ----------
    // 返回: { 等级索引: [ { weapons: [id...], text: "..." }, ... ] }
    function collectWeaponDiffs(skill) {
      const diffs = {}; // { levelIdx: Map<text, [weaponIds]> }

      function addDiff(levelIdx, text, weaponId) {
        if (!diffs[levelIdx]) diffs[levelIdx] = new Map();
        const map = diffs[levelIdx];
        if (!map.has(text)) map.set(text, []);
        map.get(text).push(weaponId);
      }

      // --- weapons: { weaponId: [level1Text, level2Text, ...] } ---
      if (skill.weapons) {
        Object.keys(skill.weapons).forEach(widStr => {
          const wid = Number(widStr);
          const arr = skill.weapons[widStr];
          if (Array.isArray(arr)) {
            arr.forEach((item, idx) => {
              const text = getLevelText(item);
              if (text) addDiff(idx, text, wid);
            });
          }
        });
      }

      // --- weapons_by_index: { weaponId: { levelIdx: text } } ---
      if (skill.weapons_by_index) {
        Object.keys(skill.weapons_by_index).forEach(widStr => {
          const wid = Number(widStr);
          const levelMap = skill.weapons_by_index[widStr];
          Object.keys(levelMap).forEach(idxStr => {
            const idx = Number(idxStr) - 1; // 数据里按 1-based 索引
            const text = getLevelText(levelMap[idxStr]);
            if (text) addDiff(idx, text, wid);
          });
        });
      }

      // --- weapon_values: { weaponId: { key: value } } （配合 template）---
      if (skill.template && skill.weapon_values) {
        const values = skill.values || {};
        Object.keys(skill.weapon_values).forEach(widStr => {
          const wid = Number(widStr);
          const wv = skill.weapon_values[widStr];
          skill.template.forEach((tpl, idx) => {
            const text = fillTemplate(tpl, values, wv);
            if (text) addDiff(idx, text, wid);
          });
        });
      }

      // --- ranged_by_index: { levelIdx: text } （按远程武器展开）---
      if (skill.ranged_by_index) {
        Object.keys(skill.ranged_by_index).forEach(idxStr => {
          const idx = Number(idxStr) - 1;
          const text = getLevelText(skill.ranged_by_index[idxStr]);
          if (text) {
            RANGED_IDS.forEach(wid => addDiff(idx, text, wid));
          }
        });
      }

      // --- ranged: [level1Text, ...] （整个数组对应远程）---
      if (Array.isArray(skill.ranged)) {
        skill.ranged.forEach((item, idx) => {
          const text = getLevelText(item);
          if (text) {
            RANGED_IDS.forEach(wid => addDiff(idx, text, wid));
          }
        });
      }

      return diffs;
    }

    // ---------- 渲染技能卡片 ----------
    function renderSkillCard(id, skill) {
      const name = skill.name || `技能 ${id}`;
      const description = skill.description || '';
      const levelTexts = collectDefaultLevels(skill);
      const diffs = collectWeaponDiffs(skill);

      const card = document.createElement('div');
      card.className = 'skill-card';

      // 标题
      const titleEl = document.createElement('div');
      titleEl.className = 'skill-name';
      titleEl.innerHTML = `<span>${name}</span><span class="skill-id">#${id}</span>`;
      card.appendChild(titleEl);

      // 描述
      if (description) {
        const descEl = document.createElement('div');
        descEl.className = 'skill-desc';
        descEl.innerHTML = formatText(description);
        card.appendChild(descEl);
      }

      // 等级列表
      const listEl = document.createElement('ul');
      listEl.className = 'levels-list';

      const maxIdx = Math.max(
        levelTexts.length - 1,
        ...Object.keys(diffs).map(Number),
        -1
      );

      for (let i = 0; i <= maxIdx; i++) {
        const mainText = levelTexts[i];
        const levelDiff = diffs[i];

        if (!mainText && !levelDiff) continue;

        const li = document.createElement('li');
        li.className = 'level-item';

        // 主文本
        let html = `<span class="level-tag">Lv${i + 1}</span>`;
        if (mainText) {
          html += formatText(mainText);
        } else {
          html += '<span style="color:#7d8f9f;">（默认无说明）</span>';
        }
        li.innerHTML = html;

        // 武器差分
        if (levelDiff && levelDiff.size) {
          const diffWrap = document.createElement('div');
          diffWrap.className = 'weapon-diffs';

          levelDiff.forEach((weaponIds, text) => {
            const row = document.createElement('div');
            row.className = 'weapon-diff-row';
            row.innerHTML =
              `<span class="weapon-tag">⚔ ${weaponLabel(weaponIds)}</span>` +
              formatText(text);
            diffWrap.appendChild(row);
          });

          li.appendChild(diffWrap);
        }

        listEl.appendChild(li);
      }

      if (!listEl.children.length) {
        const empty = document.createElement('div');
        empty.className = 'level-item';
        empty.textContent = '（暂无等级说明）';
        card.appendChild(empty);
      } else {
        card.appendChild(listEl);
      }

      return card;
    }

    // ---------- 渲染百龙技能卡片 ----------
    function renderRampageCard(id, skill) {
      const name = skill.name || `百龙技能 ${id}`;
      const text = skill.text || skill.description || '';

      const card = document.createElement('div');
      card.className = 'skill-card rampage-card';
      card.innerHTML = `
        <div class="skill-name">
          <span>${name}</span>
          <span class="skill-id">#${id}</span>
        </div>
        <div class="skill-desc">${formatText(text)}</div>
      `;
      return card;
    }

    // ---------- 搜索索引 ----------
    function buildSearchText(id, skill) {
      const parts = [String(id), skill.name || ''];
      if (skill.description) parts.push(skill.description);
      if (skill.text) parts.push(skill.text);
      if (skill.default) skill.default.forEach(t => parts.push(getLevelText(t)));
      if (skill.levels) skill.levels.forEach(t => parts.push(getLevelText(t)));
      if (skill.levels_by_index) {
        Object.values(skill.levels_by_index).forEach(t => parts.push(getLevelText(t)));
      }
      if (skill.template) skill.template.forEach(t => parts.push(t));
      if (skill.weapons) {
        Object.values(skill.weapons).forEach(arr => {
          if (Array.isArray(arr)) arr.forEach(t => parts.push(getLevelText(t)));
        });
      }
      if (skill.weapons_by_index) {
        Object.values(skill.weapons_by_index).forEach(m => {
          Object.values(m).forEach(t => parts.push(getLevelText(t)));
        });
      }
      if (skill.ranged_by_index) {
        Object.values(skill.ranged_by_index).forEach(t => parts.push(getLevelText(t)));
      }
      if (skill.ranged) skill.ranged.forEach(t => parts.push(getLevelText(t)));
      return parts.join(' ').toLowerCase();
    }

    // ---------- 准备数据 ----------
    const skills = data.skills || {};
    const rampage = data.rampage_skills || {};

    const skillIds = Object.keys(skills).sort((a, b) => Number(a) - Number(b));
    const rampageIds = Object.keys(rampage).sort((a, b) => Number(a) - Number(b));

    const allSkillCards = skillIds.map(id => ({
      id,
      el: renderSkillCard(id, skills[id]),
      search: buildSearchText(id, skills[id])
    }));

    const allRampageCards = rampageIds.map(id => ({
      id,
      el: renderRampageCard(id, rampage[id]),
      search: buildSearchText(id, rampage[id])
    }));

    const skillsContainer = document.getElementById('skillsContainer');
    const rampageContainer = document.getElementById('rampageContainer');
    allSkillCards.forEach(item => skillsContainer.appendChild(item.el));
    allRampageCards.forEach(item => rampageContainer.appendChild(item.el));

    // ---------- 搜索 ----------
    const searchInput = document.getElementById('searchInput');
    const searchCount = document.getElementById('searchCount');

    function applyFilter(keyword) {
      const kw = keyword.trim().toLowerCase();
      let skillHits = 0;
      let rampageHits = 0;

      allSkillCards.forEach(item => {
        const hit = !kw || item.search.includes(kw);
        item.el.style.display = hit ? '' : 'none';
        if (hit) skillHits++;
      });

      allRampageCards.forEach(item => {
        const hit = !kw || item.search.includes(kw);
        item.el.style.display = hit ? '' : 'none';
        if (hit) rampageHits++;
      });

      if (!kw) {
        searchCount.textContent = '';
      } else {
        searchCount.textContent = `普通 ${skillHits} · 百龙 ${rampageHits}`;
      }

      document.querySelectorAll('.skill-section').forEach(sec => {
        const hasVisible = sec.querySelector('.skill-card:not([style*="display: none"])');
        sec.style.display = hasVisible ? '' : 'none';
      });
    }

    if (searchInput) {
      searchInput.addEventListener('input', e => applyFilter(e.target.value));
    }

    console.log('[mhrise-skill] 渲染完成 | 普通技能:', skillIds.length, '| 百龙技能:', rampageIds.length);
  });
})();