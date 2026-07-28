/* 建筑安装工程工期定额（2016）查询系统 */
(function () {
  'use strict';
  const D = window.QDATA;
  const pagesById = {};
  D.pages.forEach(p => pagesById[p.id] = p);

  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])).replace(/m3/g, 'm<sup>3</sup>')

  /* ---------- 工期列识别 ---------- */
  const isDayCol = h => /^[ⅠⅡⅢⅣ、]+类土?$/.test(h) || h.startsWith('工期') || h.includes('加工期');
  function dayCols(page) {
    const idx = [];
    page.headers.forEach((h, i) => { if (isDayCol(h)) idx.push(i); });
    return idx;
  }

  /* 统计某节点（含其下所有页面）的定额条目总数 */
  function countItems(node) {
    if (node.type === 'page') {
      const p = pagesById[node.pageId];
      return p ? p.items.length : 0;
    }
    if (node.type === 'dir') {
      return (node.children || []).reduce((s, c) => s + countItems(c), 0);
    }
    return 0;
  }

  /* ================= 左上：定额列表树 ================= */
  const treeEl = $('#tree');
  let activeLabel = null;

  function buildTree(nodes, container, depth, partName) {
    nodes.forEach(node => {
      const wrap = document.createElement('div');
      wrap.className = 'tnode';
      const label = document.createElement('div');
      label.className = 'tlabel';
      const part = depth === 0 ? node.name : partName;

      if (node.type === 'dir') {
        const cnt = countItems(node);
        label.innerHTML = `<span class="caret">▶</span><span class="ico">📁</span><span>${esc(node.name)}</span><span class="tcount">（${cnt}）</span>`;
        const kids = document.createElement('div');
        kids.className = 'tchildren';
        wrap.appendChild(label);
        wrap.appendChild(kids);
        buildTree(node.children, kids, depth + 1, part);
        label.onclick = () => {
          label.classList.toggle('open');
          kids.classList.toggle('show');
        };
      } else if (node.type === 'page') {
        label.classList.add('leaf');
        const cnt = countItems(node);
        label.innerHTML = `<span class="caret"></span><span class="ico">📑</span><span>${esc(node.name)}</span><span class="tcount">（${cnt}）</span>`;
        label.onclick = () => {
          setActive(label);
          renderPage(node.pageId);
        };
        wrap.appendChild(label);
      } else { // note
        label.classList.add('leaf');
        label.innerHTML = `<span class="caret"></span><span class="ico">📄</span><span>${esc(node.name)}</span>`;
        label.onclick = () => { setActive(label); openNoteModal(node.noteKey); };
        wrap.appendChild(label);
      }
      container.appendChild(wrap);
    });
  }
  function setActive(el) {
    if (activeLabel) activeLabel.classList.remove('active');
    activeLabel = el; el.classList.add('active');
  }
  buildTree(D.tree, treeEl, 0, '');
  const totalItems = D.pages.reduce((s, p) => s + p.items.length, 0);
  $('#treeCount').textContent = D.pages.length + ' 个定额表 / ' + totalItems + ' 条定额';
  const bannerTotal = document.querySelector('#bannerTotal');
  if (bannerTotal) bannerTotal.textContent = totalItems;
  // 默认展开第一部分
  const first = treeEl.querySelector('.tlabel');
  if (first) first.click();

  /* ================= 左下：相关说明（列表 + 弹窗） ================= */
  const noteListEl = $('#noteList');
  const modalMask = $('#noteModal');
  const modalDoc = $('#modalDoc');
  const modalTitle = $('#modalTitle');
  const noteOrder = ['notice', 'root'].concat(Object.keys(D.notes).filter(k => k !== 'root' && k !== 'notice'));
  const itemName = k => k === 'root' ? '总说明'
    : k === 'notice' ? '住房城乡建设部关于印发《建筑安装工程工期定额》的通知'
    : k.replace(/第(.)部分\s*/, '第$1部分·').replace(/\s+/g, '') + '说明';

  noteOrder.forEach(k => {
    if (!D.notes[k]) return;
    const li = document.createElement('li');
    li.innerHTML = `<span class="dot"></span><span>${esc(itemName(k))}</span><span class="go">查看 ›</span>`;
    li.onclick = () => openNoteModal(k);
    noteListEl.appendChild(li);
  });
  function openNoteModal(key) {
    if (!D.notes[key]) return;
    modalTitle.textContent = itemName(key);
    modalDoc.innerHTML = D.notes[key].html;
    modalDoc.parentElement.scrollTop = 0;
    modalMask.hidden = false;
  }
  function closeNoteModal() { modalMask.hidden = true; }
  modalMask.addEventListener('click', e => { if (e.target === modalMask) closeNoteModal(); });
  $('#modalX').onclick = closeNoteModal;
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeNoteModal(); });

  /* ================= 右上：查询组件 ================= */
  const partSel = $('#fPart');
  D.tree.forEach(n => {
    const o = document.createElement('option');
    o.value = n.name; o.textContent = n.name.replace(/\s+/g, ' ');
    partSel.appendChild(o);
  });
  $('#btnSearch').onclick = doSearch;
  $('#q').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
  $('#q').addEventListener('input', debounce(doSearch, 300));
  partSel.onchange = doSearch;
  $('#btnReset').onclick = () => { $('#q').value = ''; partSel.value = ''; $('#results').innerHTML = '<div class="empty">输入关键词查询，或从左侧<b>定额列表</b>选择章节浏览完整定额表</div>'; $('#resInfo').textContent = ''; };

  function debounce(fn, ms) { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; }

  const MAX_ROWS = 500;
  function doSearch() {
    const q = $('#q').value.trim();
    const part = partSel.value;
    if (!q) {
      // 搜索框为空时不列出任何部分/全库定额，避免刷出整张定额表
      $('#results').innerHTML = '<div class="empty">输入关键词查询，或从左侧<b>定额列表</b>选择章节浏览完整定额表</div>';
      $('#resInfo').textContent = '';
      return;
    }
    const terms = q.split(/\s+/).filter(Boolean).map(t => t.toLowerCase());
    const isCode = terms.length === 1 && /^\d+-\d+$/.test(terms[0]);
    const groups = [];
    let total = 0, shown = 0;

    for (const p of D.pages) {
      if (part && p.path[0] !== part) continue;
      const pageText = (p.path.join('/') + '/' + p.title).toLowerCase();
      const hits = [];
      for (let i = 0; i < p.items.length; i++) {
        const it = p.items[i];
        let ok;
        if (isCode) {
          ok = it[0] === terms[0];
        } else if (terms.length === 0) {
          ok = true; // 仅按部分筛选
        } else {
          const rowText = it.join('|').toLowerCase();
          ok = terms.every(t => rowText.includes(t) || pageText.includes(t));
        }
        if (ok) { total++; if (shown < MAX_ROWS) { hits.push(i); shown++; } }
      }
      if (hits.length) groups.push({ page: p, idxs: hits });
    }
    renderGroups(groups, terms.filter(t => !/^\d+-\d+$/.test(t) || true));
    $('#resInfo').textContent = total ? `命中 ${total} 条${total > MAX_ROWS ? '，仅显示前 ' + MAX_ROWS + ' 条' : ''}` : '无结果';
  }

  /* ================= 右中：查询内容 ================= */
  const resultsEl = $('#results');

  function hl(text, terms) {
    let s = esc(text);
    if (!terms || !terms.length) return s;
    terms.forEach(t => {
      if (!t) return;
      try {
        const re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
        s = s.replace(re, '<mark>$1</mark>');
      } catch (e) { /* ignore */ }
    });
    return s;
  }

  function tableHtml(page, idxs, terms) {
    const dcs = dayCols(page);
    let h = `<table class="qt"><thead><tr>`;
    page.headers.forEach(hd => h += `<th>${esc(hd)}</th>`);
    h += `<th style="width:34px">统计</th></tr></thead><tbody>`;
    idxs.forEach(i => {
      const it = page.items[i];
      h += '<tr>';
      it.forEach((v, ci) => {
        const cls = ci === 0 ? 'code' : (dcs.includes(ci) ? 'day' : '');
        h += `<td class="${cls}">${hl(v, terms)}</td>`;
      });
      const added = stats.some(s => s.pid === page.id && s.idx === i);
      h += `<td><button class="addbtn${added ? ' added' : ''}" data-pid="${page.id}" data-idx="${i}" title="加入统计列表">${added ? '✓' : '＋'}</button></td></tr>`;
    });
    h += '</tbody>';
    if (page.note) {
      h += `<tfoot><tr class="qt-note"><td colspan="${page.headers.length + 1}">📌 ${esc(page.note)}</td></tr></tfoot>`;
    }
    h += '</table>';
    return h;
  }

  function renderGroups(groups, terms) {
    if (!groups.length) {
      resultsEl.innerHTML = '<div class="empty">未找到匹配的定额条目，请调整关键词</div>';
      return;
    }
    let h = '';
    groups.forEach(g => {
      const crumb = g.page.path.slice(0, -1).join(' › ');
      h += `<div class="group"><div class="group-title">${esc(g.page.title)} <span class="crumb">（${esc(crumb)}）</span></div>${tableHtml(g.page, g.idxs, terms)}</div>`;
    });
    resultsEl.innerHTML = h;
    resultsEl.parentElement.scrollTop = 0;
  }

  function renderPage(pid) {
    const p = pagesById[pid];
    if (!p) return;
    const idxs = p.items.map((_, i) => i);
    const crumb = p.path.slice(0, -1).join(' › ');
    resultsEl.innerHTML = `<div class="group"><div class="group-title">${esc(p.title)} <span class="crumb">（${esc(crumb)}）</span></div>${tableHtml(p, idxs, [])}</div>`;
    $('#resInfo').textContent = `浏览整表：${p.items.length} 条`;
    resultsEl.parentElement.scrollTop = 0;
  }

  resultsEl.addEventListener('click', e => {
    const b = e.target.closest('.addbtn');
    if (!b || b.classList.contains('added')) return;
    addStat(b.dataset.pid, parseInt(b.dataset.idx, 10));
    b.classList.add('added'); b.textContent = '✓';
  });

  /* ================= 右下：统计列表 ================= */
  let stats = [];
  try { stats = JSON.parse(localStorage.getItem('gq_stats') || '[]'); } catch (e) { stats = []; }
  stats = stats.filter(s => pagesById[s.pid] && pagesById[s.pid].items[s.idx]);

  function saveStats() { localStorage.setItem('gq_stats', JSON.stringify(stats)); }

  function addStat(pid, idx) {
    if (stats.some(s => s.pid === pid && s.idx === idx)) return;
    const p = pagesById[pid];
    const dcs = dayCols(p);
    // 默认选第一个有数值的工期列
    let sel = dcs.length ? dcs[0] : -1;
    for (const c of dcs) {
      const v = parseFloat(p.items[idx][c]);
      if (!isNaN(v)) { sel = c; break; }
    }
    stats.push({ pid, idx, sel });
    saveStats(); renderStats();
  }

  function paramSummary(p, it) {
    const dcs = dayCols(p);
    const parts = [];
    p.headers.forEach((h, i) => {
      if (i === 0 || dcs.includes(i) || h === '备注') return;
      if (it[i] && it[i] !== '—') parts.push(h + '：' + it[i]);
    });
    return parts.join('；');
  }

  /* 统计列表「规格/参数」列显示用：标题加粗 */
  function paramSummaryHtml(p, it) {
    const dcs = dayCols(p);
    const parts = [];
    p.headers.forEach((h, i) => {
      if (i === 0 || dcs.includes(i) || h === '备注') return;
      if (it[i] && it[i] !== '—') parts.push(`<b>${esc(h)}</b>：${esc(it[i])}`);
    });
    return parts.join('；');
  }

  function renderStats() {
    const body = $('#statsBody');
    if (!stats.length) {
      body.innerHTML = '<div class="empty" style="padding:20px">暂无统计条目——在上方查询结果中点击 <b style="color:#0b7a3b">＋</b> 添加</div>';
      $('#stInfo').textContent = '';
      $('#totalDays').textContent = '0';
      return;
    }
    let h = `<table class="st"><thead><tr><th style="width:70px">编号</th><th>定额项目</th><th>规格/参数</th><th style="width:150px">类别选择</th><th style="width:70px">工期(天)</th><th style="width:48px;white-space:nowrap">删除</th></tr></thead><tbody>`;
    let total = 0;
    stats.forEach((s, si) => {
      const p = pagesById[s.pid];
      const it = p.items[s.idx];
      const dcs = dayCols(p);
      const val = s.sel >= 0 ? parseFloat(it[s.sel]) : NaN;
      if (!isNaN(val)) total += val;
      let selHtml = '<span style="color:#999">—</span>';
      if (dcs.length) {
        selHtml = `<select data-si="${si}">`;
        dcs.forEach(c => {
          selHtml += `<option value="${c}"${c === s.sel ? ' selected' : ''}>${esc(p.headers[c])}（${esc(it[c])}）</option>`;
        });
        selHtml += '</select>';
      }
      h += `<tr>
        <td class="code">${esc(it[0])}</td>
        <td style="text-align:left">${esc(p.title)}<span style="color:#9aa6b5;font-size:11px">｜${esc(p.path.slice(0,-1).join(' › ').replace(/\s+/g,' '))}</span></td>
        <td style="text-align:left">${paramSummaryHtml(p, it)}</td>
        <td>${selHtml}</td>
        <td class="days">${isNaN(val) ? esc(it[s.sel] || '—') : val}</td>
        <td><button class="st-del" data-si="${si}" title="移除">✕</button></td>
      </tr>`;
    });
    h += '</tbody></table>';
    body.innerHTML = h;
    $('#stInfo').textContent = stats.length + ' 条';
    $('#totalDays').textContent = total;
  }

  $('#statsBody').addEventListener('change', e => {
    const sel = e.target.closest('select[data-si]');
    if (!sel) return;
    stats[parseInt(sel.dataset.si, 10)].sel = parseInt(sel.value, 10);
    saveStats(); renderStats();
  });
  $('#statsBody').addEventListener('click', e => {
    const del = e.target.closest('.st-del');
    if (!del) return;
    stats.splice(parseInt(del.dataset.si, 10), 1);
    saveStats(); renderStats();
    // 同步刷新结果区按钮状态
    resultsEl.querySelectorAll('.addbtn.added').forEach(b => {
      if (!stats.some(s => s.pid === b.dataset.pid && s.idx === parseInt(b.dataset.idx, 10))) {
        b.classList.remove('added'); b.textContent = '＋';
      }
    });
  });
  // 自定义确认弹窗，避免移动端 WebView/浏览器屏蔽原生 confirm()
  function showConfirm(msg, onYes) {
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML =
      '<div class="modal" style="width:min(360px,92vw)">' +
        '<div class="modal-bd" style="padding:18px 16px;font-size:14px;line-height:1.7;color:#33414f">' + msg + '</div>' +
        '<div style="display:flex;gap:10px;justify-content:flex-end;padding:12px 16px;border-top:1px solid var(--bd)">' +
          '<button class="btn sm ghost" data-act="no">取消</button>' +
          '<button class="btn sm danger" data-act="yes">确定</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(mask);
    mask.addEventListener('click', e => {
      const act = e.target.getAttribute('data-act');
      if (e.target === mask || act === 'no') { mask.remove(); return; }
      if (act === 'yes') { mask.remove(); onYes(); }
    });
  }
  $('#btnClear').onclick = () => {
    if (!stats.length) return;
    showConfirm('确定清空统计列表？', () => {
      stats = []; saveStats(); renderStats();
      resultsEl.querySelectorAll('.addbtn.added').forEach(b => { b.classList.remove('added'); b.textContent = '＋'; });
    });
  };
  $('#btnCsv').onclick = () => {
    if (!stats.length) return;
    const rows = [['编号', '定额项目', '所属部分', '规格/参数', '类别', '工期(天)']];
    let total = 0;
    stats.forEach(s => {
      const p = pagesById[s.pid]; const it = p.items[s.idx];
      const val = s.sel >= 0 ? it[s.sel] : '';
      const n = parseFloat(val); if (!isNaN(n)) total += n;
      rows.push([it[0], p.title, p.path[0], paramSummary(p, it), s.sel >= 0 ? p.headers[s.sel] : '', val]);
    });
    rows.push(['', '', '', '', '合计', String(total)]);
    const csv = '\ufeff' + rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = '工期定额统计列表.csv';
    a.click();
  };

  renderStats();
})();

(function(){
  var app=document.querySelector('.app');
  var tabs=document.getElementById('mtabs');
  if(!tabs||!app) return;
  function activate(mv){
    app.className='app m-'+mv;
    tabs.querySelectorAll('button').forEach(function(b){
      b.classList.toggle('active', b.getAttribute('data-mv')===mv);
    });
  }
  window.__mActivate=activate;
  var isMobile = window.matchMedia && window.matchMedia('(max-width:820px)').matches;
  tabs.addEventListener('click',function(e){
    var b=e.target.closest('button'); if(!b) return;
    activate(b.getAttribute('data-mv'));
  });
  /* 选中定额列表的非目录（叶子）项目 → 自动切到查询栏目 */
  var treeEl=document.getElementById('tree');
  if(treeEl){
    treeEl.addEventListener('click',function(e){
      if(e.target.closest('.leaf')){ activate('search'); }
    });
  }
  /* 给查询定额面板标题加折叠/展开按钮（仅含搜索栏的查询组件面板） */
  document.querySelectorAll('.panel[data-mview="search"]').forEach(function(panel){
    if(!panel.querySelector('.searchbar')) return;
    var hd=panel.querySelector('.panel-hd');
    if(!hd || hd.querySelector('.toggle-btn')) return;
    var btn=document.createElement('button');
    btn.type='button'; btn.className='toggle-btn';
    btn.title='收起/展开';
    btn.innerHTML='<span class="arr">▼</span> 收起';
    hd.appendChild(btn);
    /* 手机版默认收起搜索卡片，按钮显示“展开” */
    if(isMobile){
      panel.classList.add('collapsed');
      btn.innerHTML='<span class="arr">▶</span> 展开';
    }
    btn.addEventListener('click',function(e){
      e.stopPropagation();
      var collapsed = panel.classList.toggle('collapsed');
      btn.innerHTML='<span class="arr">'+(collapsed?'▶':'▼')+'</span> '+(collapsed?'展开':'收起');
    });
  });
  activate('tree');
})();
