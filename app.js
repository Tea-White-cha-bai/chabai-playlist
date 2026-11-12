/* app.js —— 界面与交互 */
(function () {
  'use strict';

  var state = S.state;
  var $ = function (sel) { return document.querySelector(sel); };
  var listEl, chipsEl, statsEl, tabbarEl, hostEl, sheetEl, pageTitle, pageSub;

  var view = { tab: 'rank', q: '' };
  var curSheetName = '';
  var exportStyle = 'list';
  var previewOverride = null;
  var chart = { id: '', items: [], loading: false, chosen: {}, loaded: {} };

  var TABS = [
    { id: 'home', ic: 'home', label: '首页' },
    { id: 'rank', ic: 'chart-bar', label: '难度榜' },
    { id: 'title', ic: 'music', label: '歌名' },
    { id: 'artist', ic: 'user', label: '歌手' },
    { id: 'group', ic: 'list', label: '分类' },
    { id: 'random', ic: 'arrows-shuffle', label: '随机' },
    { id: 'chart', ic: 'flame', label: '榜单' }
  ];

  var TITLES = {
    home: ['首页', '按导入顺序排列'],
    rank: ['难度榜', '按难度从高到低'],
    title: ['歌名首字', '按拼音首字母分组'],
    artist: ['歌手首字', '按歌手拼音首字母'],
    group: ['歌手分类', '同一歌手的歌聚在一起'],
    random: ['随机排序', '点「打乱」重新洗牌'],
    chart: ['网易云榜单', '在线榜单，可一键加进歌单']
  };

  /* ---------------- 工具 ---------------- */
  function esc(s) {
    return (s == null ? '' : '' + s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(msg) { S.Bridge.toast(msg); }

  function applyTheme() {
    var t = state.settings.theme;
    if (t === 'auto') {
      t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', t);
    document.documentElement.style.setProperty('--fs', String(state.settings.fs || 1));
    document.documentElement.style.setProperty('--fs-title', String(state.settings.fsTitle || state.settings.fs || 1));
    document.documentElement.style.setProperty('--fs-sub', String(state.settings.fsSub || state.settings.fs || 1));
    document.documentElement.style.setProperty('--w-title', String(state.settings.weightTitle || 600));
    document.documentElement.style.setProperty('--w-sub', String(state.settings.weightSub || 400));
    document.documentElement.style.setProperty('--btn-bg-alpha', String(state.settings.iconOpacity == null ? 0.75 : state.settings.iconOpacity));
    var dark = t === 'dark';
    S.Bridge.setBars(dark ? '#0e0f12' : '#f4f5f8', dark);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0e0f12' : '#f4f5f8');
  }

  /* ---------------- 数据视图 ---------------- */
  function cmpTitle(a, b) {
    var x = S.pyOf(a.title), y = S.pyOf(b.title);
    return x < y ? -1 : x > y ? 1 : 0;
  }

  function filtered() {
    var q = view.q.trim().toLowerCase();
    var st = state.settings.stateFilter, df = state.settings.diffFilter, lf = state.settings.listFilter;
    return state.songs.filter(function (s) {
      if (st !== 'all' && s.st !== st) return false;
      if (df === 'none') { if (s.diff !== 0) return false; }
      else if (df > 0 && s.diff !== df) return false;
      if (lf && s.tags.indexOf(lf) < 0) return false;
      if (q) {
        var hay = (s.title + ' ' + s.artist + ' ' + S.pyOf(s.title) + ' ' + S.pyOf(s.artist)).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function splitDone(arr) {
    var open = [], done = [];
    for (var i = 0; i < arr.length; i++) (arr[i].st === 'done' ? done : open).push(arr[i]);
    return { open: open, done: done };
  }

  function sortRank(arr) {
    return arr.slice().sort(function (a, b) {
      var x = a.diff || 0, y = b.diff || 0;
      if (x !== y) return y - x;
      return cmpTitle(a, b);
    });
  }

  function byInitial(arr, keyFn) {
    var map = {};
    arr.forEach(function (s) {
      var k = S.initialOf(keyFn(s) || '');
      (map[k] = map[k] || []).push(s);
    });
    var keys = Object.keys(map).sort(function (a, b) {
      if (a === '#') return 1;
      if (b === '#') return -1;
      return a < b ? -1 : 1;
    });
    return keys.map(function (k) {
      return { key: k, label: k === '#' ? '# 其他' : k, rows: map[k].sort(cmpTitle) };
    });
  }

  function buildGroups() {
    var arr = filtered();
    var sp = splitDone(arr);
    var groups = [];

    if (view.tab === 'home') {
      var seqRows = sp.open.slice().sort(function (a, b) {
        return (a.seq == null ? 1e9 : a.seq) - (b.seq == null ? 1e9 : b.seq);
      });
      groups.push({ key: 'home', label: '', rows: seqRows, ranked: true });
    } else if (view.tab === 'rank') {
      var rows = sortRank(sp.open);
      groups.push({ key: 'rank', label: '', rows: rows, ranked: true });
    } else if (view.tab === 'title') {
      groups = byInitial(sp.open, function (s) { return s.title; });
    } else if (view.tab === 'artist') {
      groups = byInitial(sp.open, function (s) { return s.artist || '未知歌手'; });
    } else if (view.tab === 'group') {
      var map = {};
      sp.open.forEach(function (s) {
        var k = s.artist || '未知歌手';
        (map[k] = map[k] || []).push(s);
      });
      var keys = Object.keys(map).sort(function (a, b) {
        var x = S.pyOf(a), y = S.pyOf(b);
        return x < y ? -1 : x > y ? 1 : 0;
      });
      groups = keys.map(function (k) {
        return { key: 'a:' + k, label: k, rows: map[k].sort(cmpTitle) };
      });
    } else {
      var order = state.order || [];
      var pos = {};
      order.forEach(function (id, i) { pos[id] = i; });
      sp.open.sort(function (a, b) {
        var x = pos[a.id], y = pos[b.id];
        if (x == null && y == null) return cmpTitle(a, b);
        if (x == null) return 1;
        if (y == null) return -1;
        return x - y;
      });
      groups.push({ key: 'rnd', label: '', rows: sp.open });
    }

    if (sp.done.length) {
      groups.push({ key: '__done', label: '已唱', rows: sortRank(sp.done), doneGroup: true });
    }
    return groups;
  }

  /* ---------------- 行 ---------------- */
  function rowHtml(s, rank, showRank, gimg, sliceInfo) {
    var d = s.diff || 0;
    var c = cardCfg();
    if (!c.showRank) showRank = false;
    var l2 = [];
    if (c.showArtist !== false) l2.push('<span class="ar">' + (s.artist ? esc(s.artist) : '未知歌手') + '</span>');
    if (s.tags && s.tags.length) l2.push('<span class="dchip d0">' + esc(s.tags[0]) + '</span>');
    if (c.showPlays && s.plays) l2.push('<span class="dchip d0">练过 ' + s.plays + ' 次</span>');
    var cim = gimg || null;
    var imgHtml = '';
    if (cim) {
      var st1 = sliceInfo
        ? sliceStyle(urlOf(cim), sliceInfo.k, sliceInfo.total, c.anchor)
        : ("background-image:url('" + urlOf(cim) + "');background-size:cover;background-position:" + anchorCss(cim.anchor || 'center') + ";");
      imgHtml = '<span class="cardimg" style="' + st1 + '"></span>' +
        (c.showImgVeil === true ? '<span class="cardveil"></span>' : '');
    }
    return '' +
      '<div class="row' + (s.st === 'done' ? ' done' : '') + (cim ? ' has-img' : '') +
      (cim && c.fadeRight ? ' fade-r' : '') + (c.accentBar ? ' accent-bar' : '') + '" data-id="' + s.id + '">' +
      imgHtml +
      (showRank ? '<div class="rank' + (rank <= 3 && view.tab === 'rank' ? ' top' + rank : '') + '">' + rank + '</div>' : '') +
      '<label class="cb" data-act="toggle"><input type="checkbox"' + (s.st === 'done' ? ' checked' : '') + '><span class="box">✓</span></label>' +
      '<div class="main" data-act="detail">' +
      '<div class="l1"><span class="title">' + esc(s.title) + '</span>' +
      (c.showDiff !== false ? ('<span class="dchip d' + d + '" data-act="editdiff">' + (d ? S.STARS[d] : '未评') + '</span>' +
        '<span class="dchip d0">' + S.DIFF_LABEL[d] + '</span>') : '') + '</div>' +
      '<div class="l2">' + l2.join('') + '</div>' +
      '</div>' +
      '<button class="more" data-act="detail">' + icon('chevron-right') + '</button>' +
      '</div>';
  }

  function render() {
    if (view.tab === 'chart') { renderChartPage(); return; }
    var groups = buildGroups();
    var t = TITLES[view.tab] || ['', ''];
    pageTitle.textContent = t[0];
    var total = state.songs.length;
    var filteredCount = filtered().length;
    pageSub.textContent = total ? (filteredCount + (filteredCount !== total ? '/' + total : '') + ' 首') : '';

    var html = '';
    var rankNo = 0;
    var cc0 = cardCfg();
    var gList = (cc0.gImages && cc0.gImages.length) ? cc0.gImages : null;
    var covList = (cc0.coverImages && cc0.coverImages.length) ? cc0.coverImages : null;
    var gEvery = cc0.everyN || 0;
    var starts = cc0.startIds || [];
    var coverBase = -1;
    var coverSeq = 0;
    var activeStart = null, activeRow = -1, activeIdx = 0;
    var rowSeen = 0;
    var showRank = (view.tab === 'rank' || view.tab === 'home');
    for (var g = 0; g < groups.length; g++) {
      var grp = groups[g];
      if (!grp.rows.length && !grp.doneGroup) continue;
      if (grp.doneGroup) html += '<div class="group-h">已唱<span class="cnt">' + grp.rows.length + '</span></div>';
      else if (grp.label) html += '<div class="group-h">' + esc(grp.label) + '<span class="cnt">' + grp.rows.length + '</span></div>';
      for (var i = 0; i < grp.rows.length; i++) {
        rankNo++;
        var gimg = null, sliceInfo = null;
        var sid2 = grp.rows[i].id;
        var isBlank = state.cardBlank && state.cardBlank[sid2];
        var mode = cc0.mode || 'cur';
        var ce = Math.max(1, cc0.coverEvery || 1);
        var re = Math.max(1, cc0.rotateEvery || 1);
        if (starts.indexOf(sid2) >= 0) { coverBase = rowSeen; coverSeq++; }

        if (isBlank) {
          gimg = null;
        } else if (mode === 'cur') {
          if (cc0.curOn !== false) {
            gimg = cardImgOf(sid2) || null;
            if (previewOverride && previewOverride.ids.indexOf(sid2) >= 0) gimg = previewOverride.img;
          }
        } else if (mode === 'rotate') {
          if (cc0.rotateOn && gList) {
            gimg = gList[Math.floor(rowSeen / re) % gList.length];
            if (re > 1) sliceInfo = { k: rowSeen % re, total: re };
          }
        } else if (mode === 'cover') {
          var cst = cc0.coverStarts || [];
          for (var q = 0; q < cst.length; q++) {
            if (cst[q].songId === sid2) { activeStart = cst[q]; activeRow = rowSeen; }
          }
          if (activeStart && activeStart.img) {
            var cnt = Math.max(1, activeStart.count || 1);
            var rel = rowSeen - activeRow;      // 0 = 起点本身，包含在内
            if (rel >= 0 && rel < cnt) {
              gimg = activeStart.img;
              if (cnt > 1) sliceInfo = { k: rel, total: cnt };
            }
          }
        }
        rowSeen++;
        html += rowHtml(grp.rows[i], rankNo, showRank && !grp.doneGroup, gimg, sliceInfo);
      }
    }

    if (!html) {
      if (total) {
        html = '<div class="empty"><div class="big">' + icon('music') + '</div>' +
          '<p>没有符合筛选条件的歌</p>' +
          '<button class="btn-primary" data-act="import">导入歌曲</button></div>';
      } else {
        html = '<div class="empty"><div class="big">' + icon('music') + '</div>' +
          '<p>还没有歌曲<br>导入、搜索，或者去网易云挑几首</p>' +
          '<div class="empty-btns">' +
          '<button class="btn-primary" data-act="import">' + icon('plus') + '导入歌曲</button>' +
          '<button class="btn-primary" data-act="searchsong">' + icon('search') + '搜索歌曲</button>' +
          '<button class="btn-primary" data-act="neteaserec">' + icon('flame') + '网易云推荐</button>' +
          '</div></div>';
      }
    }
    listEl.innerHTML = html;
    renderChips();
    renderStats();
    applyBackground();
  }

  function renderChips() {
    var st = state.settings.stateFilter;
    var items = [
      { a: 'state', v: 'all', t: '全部' },
      { a: 'state', v: 'todo', t: '未唱' },
      { a: 'state', v: 'done', t: '已唱' }
    ];
    var html = '';
    items.forEach(function (it) {
      html += '<span class="chip' + (st === it.v ? ' on' : '') + '" data-act="' + it.a + '" data-v="' + it.v + '">' + it.t + '</span>';
    });
    var activeFilter = (state.settings.diffFilter !== 0 && state.settings.diffFilter !== 'none' ? 1 : 0) +
      (state.settings.diffFilter === 'none' ? 1 : 0) + (state.settings.listFilter ? 1 : 0);
    html += '<span class="chip' + (activeFilter ? ' act' : '') + '" data-act="filtersheet">筛选' + (activeFilter ? ' ' + activeFilter : '') + '</span>';
    html += '<span class="chip" data-act="resetcheck">重置勾选</span>';
    if (view.tab === 'rank' || view.tab === 'home') {
      html += '<span class="chip act" data-act="resort">' + icon('refresh') + '重新排序</span>';
      html += '<span class="chip" data-act="pull">' + icon('dice-5') + '抽一首</span>';
      html += '<span class="chip" data-act="export">' + icon('share-3') + '导出</span>';
    }
    if (view.tab === 'random') {
      html += '<span class="chip on" data-act="reshuffle">' + icon('arrows-shuffle') + '打乱</span>';
      html += '<span class="chip" data-act="pull">' + icon('dice-5') + '抽一首</span>';
    }
    chipsEl.innerHTML = html;
  }

  function statsInnerHtml(force) {
    if (!force && view.tab !== 'rank' && view.tab !== 'home') return '';
    var n = state.songs.length;
    if (!n) return '';
    var todo = 0, done = 0, unrated = 0, dist = [0, 0, 0, 0, 0, 0];
    state.songs.forEach(function (s) {
      if (s.st === 'done') done++; else todo++;
      if (!s.diff) unrated++;
      dist[s.diff || 0]++;
    });
    var max = Math.max.apply(null, dist) || 1;
    var bars = '';
    var colors = ['#6b7382', '#3aa2ff', '#35d07f', '#ffd24d', '#ff9f43', '#ff5d6c'];
    for (var i = 0; i < 6; i++) {
      var h = Math.max(3, Math.round(dist[i] / max * 26));
      bars += '<i style="height:' + h + 'px;background:' + colors[i] + '" title="' + S.DIFF_LABEL[i] + ' ' + dist[i] + '"></i>';
    }
    return '<div class="stats"><div class="stats-top">' +
      '<div class="stat"><b>' + n + '</b><span>总数</span></div>' +
      '<div class="stat todo"><b>' + todo + '</b><span>未唱</span></div>' +
      '<div class="stat done"><b>' + done + '</b><span>已唱</span></div>' +
      '<div class="stat"><b>' + unrated + '</b><span>未评难度</span></div>' +
      '<div class="dist">' + bars + '</div>' +
      '</div></div>';
  }

  function renderStats() {
    statsEl.innerHTML = statsInnerHtml(false);
  }

  function renderTabs() {
    tabbarEl.innerHTML = TABS.map(function (t) {
      return '<button data-act="tab" data-v="' + t.id + '" class="' + (view.tab === t.id ? 'on' : '') + '">' +
        '<span class="ic">' + icon(t.ic) + '</span>' + t.label + '</button>';
    }).join('');
  }

  /* ---------------- 底层面板 ---------------- */
  function sheet(html, name) {
    var wasOpen = !hostEl.classList.contains('hidden');
    var keep = (wasOpen && curSheetName === (name || curSheetName)) ? sheetEl.scrollTop : 0;
    curSheetName = name || curSheetName;
    hostEl.classList.remove('hidden');
    sheetEl.innerHTML = '<div class="sh-grab"></div>' + html;
    sheetEl.classList.remove('full');
    sheetEl.scrollTop = keep;
  }
  function closeSheet() {
    hostEl.classList.add('hidden');
    sheetEl.innerHTML = '';
    // 关面板时一并收掉预览浮窗，避免任何路径下残留
    var pbar = document.getElementById('previewBar');
    if (pbar && previewing) { pbar.classList.add('hidden'); pbar.innerHTML = ''; previewing = false; }
    // 未点“保存配置”就关闭 => 丢弃草稿并还原界面
    if (cardDraft) { dropCardDraft(); render(); }
  }
  function sheetTitle(t) {
    return '<div class="sh-title">' + esc(t) + '<span class="x" data-act="closesheet">关闭</span></div>';
  }


  /* ---------------- 网易云榜单页 ---------------- */
  function renderChartPage() {
    var t = TITLES.chart;
    pageTitle.textContent = t[0];
    pageSub.textContent = chart.loading ? '加载中…' : (chart.items.length ? chart.items.length + ' 首' : '');
    renderChartChips();
    statsEl.innerHTML = '';

    if (chart.loading) {
      listEl.innerHTML = '<div class="empty"><div class="big">' + icon('flame') + '</div><p>正在拉取网易云榜单…</p></div>';
      return;
    }
    if (!chart.items.length) {
      listEl.innerHTML = '<div class="empty"><div class="big">' + icon('flame') + '</div>' +
        '<p>还没有拉取榜单<br>点「刷新」从网易云获取</p>' +
        '<button class="btn-primary" data-act="chartrefresh">刷新榜单</button></div>';
      return;
    }
    var html = '';
    for (var i = 0; i < chart.items.length; i++) {
      var it = chart.items[i];
      var on = !!chart.chosen[i];
      var dup = S.exists(it.title, it.artist);
      html += '<div class="row' + (on ? ' picked' : '') + '" data-id="' + i + '" data-act="charttoggle">' +
        '<div class="rank">' + (i + 1) + '</div>' +
        '<div class="main">' +
        '<div class="l1"><span class="title">' + esc(it.title) + '</span>' +
        (dup ? '<span class="dchip d0">已有</span>' : '') + '</div>' +
        '<div class="l2"><span class="ar">' + esc(it.artist || '未知歌手') + '</span>' +
        (it.album ? '<span class="dchip d0">' + esc(String(it.album).slice(0, 12)) + '</span>' : '') + '</div>' +
        '</div>' +
        '<span class="pickdot' + (on ? ' on' : '') + '">' + (on ? '✓' : '+') + '</span>' +
        '</div>';
    }
    listEl.innerHTML = html;
  }

  function renderChartChips() {
    var html = '';
    S.CHARTS.forEach(function (c) {
      html += '<span class="chip' + (chart.id === c.id ? ' on' : '') + '" data-act="chartpick" data-v="' + c.id + '">' + c.name + '</span>';
    });
    html += '<span class="chip act" data-act="chartrefresh">' + icon('refresh') + '刷新</span>';
    html += '<span class="chip" data-act="chartall">' + icon('check') + '全选</span>';
    html += '<span class="chip act" data-act="chartadd">' + icon('plus') + '添加进歌单</span>';
    chipsEl.innerHTML = html;
  }

  function loadChart(force) {
    if (!chart.id) chart.id = S.CHARTS[0].id;
    if (chart.loading) return;
    if (!force && chart.loaded[chart.id]) { chart.items = chart.loaded[chart.id]; chart.chosen = {}; render(); return; }
    chart.loading = true;
    chart.chosen = {};
    render();
    S.fetchChart(chart.id).then(function (arr) {
      chart.loading = false;
      chart.items = arr || [];
      chart.loaded[chart.id] = chart.items;
      render();
      toast('榜单已更新：' + chart.items.length + ' 首');
    }).catch(function (e) {
      chart.loading = false;
      render();
      toast('拉取失败：' + (e && e.message ? e.message : '网络问题'));
    });
  }



  /* ---------------- 图片落地（IndexedDB 优先） ---------------- */
  var imgUrlCache = {};

  function urlOf(im) {
    if (!im) return '';
    if (im.dataUrl) return im.dataUrl;
    if (im.idb && imgUrlCache[im.idb]) return imgUrlCache[im.idb];
    return '';
  }

  function ensureImagesLoaded() {
    var jobs = [];
    function need(im) {
      if (!im || im.dataUrl || !im.idb) return;
      if (imgUrlCache[im.idb]) return;
      jobs.push(S.imgGet(im.idb).then(function (d) {
        if (d) imgUrlCache[im.idb] = d;
      }));
    }
    var c = cardCfg();
    (c.gImages || []).forEach(need);
    (c.coverImages || []).forEach(need);
    (state.settings.bg.images || []).forEach(need);
    Object.keys(state.cardImgs || {}).forEach(function (k) { need(state.cardImgs[k]); });
    if (!jobs.length) return Promise.resolve(0);
    return Promise.all(jobs).then(function () { return jobs.length; });
  }

  function persistImage(im) {
    if (!im || !im.dataUrl) return Promise.resolve(false);
    var id = im.id || S.uid();
    im.id = id;
    return S.imgPut(id, im.dataUrl).then(function (ok) {
      if (ok) {
        imgUrlCache[id] = im.dataUrl;
        im.idb = id;
      }
      return ok;
    });
  }

  /* ---------------- 自定义背景 ---------------- */
  var bgScrollIdx = 0;

  function bgCfg() { return state.settings.bg; }
  var cardDraft = null;
  function cardCfg() { return cardDraft || state.settings.card; }
  function begCardDraft() {
    // 每次打开面板时建草稿，改动只改草稿
    cardDraft = JSON.parse(JSON.stringify(state.settings.card));
    return cardDraft;
  }
  function commitCardDraft() {
    if (!cardDraft) return;
    state.settings.card = cardDraft;
    cardDraft = null;
    S.save();
  }
  function dropCardDraft() {
    cardDraft = null;
  }

  function applyBackground() {
    var bg = bgCfg();
    var body = document.body;
    var layer = $('#bgLayer'), dim = $('#bgDim');
    if (!layer) return;
    var imgs = bg.images || [];
    var show = bg.enabled && imgs.length > 0 && (!bg.homeOnly || view.tab === 'home');
    body.classList.toggle('has-bg', !!show);
    body.classList.toggle('frosted', !!show && !!bg.frosted);
    var ccx = cardCfg();
    var st = ccx.style || 'default';
    body.classList.remove('card-glass', 'card-plain', 'card-outline');
    if (st !== 'default') body.classList.add('card-' + st);
    var root = document.documentElement;
    root.style.setProperty('--card-radius', (ccx.radius == null ? 14 : ccx.radius) + 'px');
    root.style.setProperty('--card-gap', (ccx.gap == null ? 7 : ccx.gap) + 'px');
    root.style.setProperty('--card-img-opacity', String(ccx.imgOpacity == null ? 0.95 : ccx.imgOpacity));
    root.style.setProperty('--card-bg-alpha', String(ccx.cardOpacity == null ? 1 : ccx.cardOpacity));
    body.classList.toggle('accent-bar', !!ccx.accentBar);

    if (!show) {
      layer.style.backgroundImage = 'none';
      dim.style.opacity = '0';
      document.documentElement.style.removeProperty('--acc');
      return;
    }
    var idx = ((bg.current || 0) + bgScrollIdx) % imgs.length;
    var img = imgs[idx];
    var bgUrl = urlOf(img);
    layer.style.backgroundImage = bgUrl ? 'url("' + bgUrl + '")' : 'none';
    layer.style.backgroundSize = bg.fit === 'contain' ? 'contain' : 'cover';
    layer.style.backgroundPosition = (bg.posX == null ? 50 : bg.posX) + '% ' + (bg.posY == null ? 50 : bg.posY) + '%';
    var presets = {
      none: '',
      soft: 'brightness(1.06) saturate(1.12)',
      night: 'brightness(.55) saturate(.9)',
      mono: 'grayscale(1) contrast(1.05)'
    };
    var f = presets[bg.filter] || '';
    if (bg.blur) f += ' blur(' + bg.blur + 'px)';
    layer.style.filter = f || 'none';
    layer.style.transform = bg.blur ? 'scale(1.12)' : 'none';
    dim.style.opacity = String(bg.dim == null ? 0.35 : bg.dim);
    if (bg.accent && img.color) document.documentElement.style.setProperty('--acc', img.color);
    else document.documentElement.style.removeProperty('--acc');
  }

  function addBgImage(file) {
    var bg = bgCfg();
    if (bg.images.length >= 5) { toast('最多 5 张背景图，先删一张'); return; }
    toast('正在处理图片…');
    S.processImage(file, function (res) {
      if (!res) { toast('图片读取失败'); return; }
      var bim = { id: S.uid(), dataUrl: res.dataUrl, color: res.color, name: '背景 ' + (bg.images.length + 1) };
      bg.images.push(bim);
      bg.current = bg.images.length - 1;
      bg.enabled = true;
      persistImage(bim);
      S.save();
      applyBackground();
      openBgSheet();
      toast('已添加背景图');
    });
  }

  function openBgSheet() {
    var bg = bgCfg();
    var thumbs = bg.images.map(function (im, i) {
      return '<div class="thumb' + (i === bg.current ? ' on' : '') + '" data-act="bgpick" data-v="' + i + '" style="background-image:url(\'' + urlOf(im) + '\')">' +
        '<span class="del" data-act="bgdel" data-v="' + i + '">✕</span></div>';
    }).join('');
    var html = sheetTitle('主题背景') +
      '<div class="field"><label>背景图（最多 5 张）</label><div class="thumbs">' + thumbs +
      '<div class="thumb add" data-act="bgadd">＋</div></div></div>' +
      '<div class="field"><label>开关</label><div class="pick-row">' +
      '<span class="pick ' + (bg.enabled ? 'on' : '') + '" data-act="bgtoggle" data-v="enabled">启用背景</span>' +
      '<span class="pick ' + (bg.frosted ? 'on' : '') + '" data-act="bgtoggle" data-v="frosted">磨砂卡片</span>' +
      '<span class="pick ' + (bg.fixed ? 'on' : '') + '" data-act="bgtoggle" data-v="fixed">背景固定</span>' +
      '<span class="pick ' + (bg.homeOnly ? 'on' : '') + '" data-act="bgtoggle" data-v="homeOnly">只在首页</span>' +
      '<span class="pick ' + (bg.accent ? 'on' : '') + '" data-act="bgtoggle" data-v="accent">自动取主色</span>' +
      '</div></div>' +
      '<div class="field"><label>背景虚化 <span id="blurVal">' + bg.blur + '</span></label>' +
      '<input type="range" id="bgBlur" min="0" max="30" step="1" value="' + bg.blur + '" style="width:100%"></div>' +
      '<div class="field"><label>暗度遮罩 <span id="dimVal">' + Math.round((bg.dim || 0) * 100) + '%</span></label>' +
      '<input type="range" id="bgDimR" min="0" max="80" step="5" value="' + Math.round((bg.dim || 0) * 100) + '" style="width:100%"></div>' +
      '<div class="field"><label>滤镜</label><div class="pick-row">' +
      [['none', '原图'], ['soft', '柔光'], ['night', '暗夜'], ['mono', '黑白']].map(function (p) {
        return '<span class="pick ' + (bg.filter === p[0] ? 'on' : '') + '" data-act="bgfilter" data-v="' + p[0] + '">' + p[1] + '</span>';
      }).join('') + '</div></div>' +
      '<div class="field"><label>填充方式</label><div class="pick-row">' +
      '<span class="pick ' + (bg.fit !== 'contain' ? 'on' : '') + '" data-act="bgfit" data-v="cover">铺满（裁剪）</span>' +
      '<span class="pick ' + (bg.fit === 'contain' ? 'on' : '') + '" data-act="bgfit" data-v="contain">完整显示</span>' +
      '<span class="pick" data-act="bgcrop">取景调整</span>' +
      '</div></div>' +
      '<div class="btn-row"><button class="btn acc" data-act="closesheet">完成</button></div>';
    sheet(html, 'bg');
  }

  function openCropSheet() {
    var bg = bgCfg();
    var img = bg.images[bg.current];
    if (!img) { toast('先添加一张背景图'); return; }
    var html = sheetTitle('取景调整') +
      '<div class="crop-box" id="cropBox" style="background-image:url(\'' + img.dataUrl + '\');background-size:' +
      (bg.fit === 'contain' ? 'contain' : (100 * (bg.zoom || 1)) + '%') + ';background-position:' +
      (bg.posX == null ? 50 : bg.posX) + '% ' + (bg.posY == null ? 50 : bg.posY) + '%"></div>' +
      '<div class="field" style="margin-top:12px"><label>缩放 <span id="zoomVal">' + Math.round((bg.zoom || 1) * 100) + '%</span></label>' +
      '<input type="range" id="cropZoom" min="100" max="260" step="5" value="' + Math.round((bg.zoom || 1) * 100) + '" style="width:100%"></div>' +
      '<div class="btn-row"><button class="btn" data-act="cropreset">居中</button>' +
      '<button class="btn acc" data-act="closesheet">完成</button></div>';
    sheet(html, 'crop');
    bindCropDrag();
  }

  function bindCropDrag() {
    var box = document.getElementById('cropBox');
    if (!box) return;
    var dragging = false, sx = 0, sy = 0, px = 0, py = 0;
    function start(e) {
      dragging = true;
      var t = e.touches ? e.touches[0] : e;
      sx = t.clientX; sy = t.clientY;
      px = bgCfg().posX == null ? 50 : bgCfg().posX;
      py = bgCfg().posY == null ? 50 : bgCfg().posY;
    }
    function move(e) {
      if (!dragging) return;
      var t = e.touches ? e.touches[0] : e;
      var dx = (t.clientX - sx) / box.clientWidth * 100;
      var dy = (t.clientY - sy) / box.clientHeight * 100;
      var bg = bgCfg();
      bg.posX = Math.max(0, Math.min(100, px - dx));
      bg.posY = Math.max(0, Math.min(100, py - dy));
      box.style.backgroundPosition = bg.posX + '% ' + bg.posY + '%';
      applyBackground();
      if (e.cancelable) e.preventDefault();
    }
    function end() { dragging = false; S.save(); }
    box.addEventListener('touchstart', start, { passive: true });
    box.addEventListener('touchmove', move, { passive: false });
    box.addEventListener('touchend', end);
    box.addEventListener('mousedown', start);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
  }


  /* ---------------- 歌名卡片图片 ---------------- */
  var ANCHORS = [['left top', '左上'], ['left bottom', '左下'], ['right bottom', '右下'], ['right top', '右上'], ['center', '居中']];
  var MAX_CARD_IMGS = 200;

  // 一张图切成 N 片，分给连续 N 张卡片（拼起来是完整图片）
  function sliceStyle(dataUrl, k, total, anchor) {
    if (total > 1) {
      var posY = (k / (total - 1)) * 100;
      return "background-image:url('" + dataUrl + "');background-size:100% " + (total * 100) +
        "%;background-position:50% " + posY + "%;";
    }
    return "background-image:url('" + dataUrl + "');background-size:cover;background-position:" + anchorCss(anchor) + ";";
  }

  function anchorCss(a) {
    var m = { 'left top': '0% 0%', 'left bottom': '0% 100%', 'right bottom': '100% 100%', 'right top': '100% 0%', 'center': '50% 50%' };
    return m[a] || m.center;
  }

  function cardImgOf(id) { return (state.cardImgs || {})[id] || null; }

  function compressCard(file, cb) {
    var img = new Image(), url = URL.createObjectURL(file);
    img.onload = function () {
      try {
        var maxW = 640;
        var w = img.naturalWidth, h = img.naturalHeight;
        var sc = Math.min(1, maxW / w);
        var cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(w * sc));
        cv.height = Math.max(1, Math.round(h * sc));
        var ctx = cv.getContext('2d');
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        cb(cv.toDataURL('image/jpeg', 0.72));
      } catch (e) { URL.revokeObjectURL(url); cb(null); }
    };
    img.onerror = function () { URL.revokeObjectURL(url); cb(null); };
    img.src = url;
  }

  function targetSongs() {
    var c = cardCfg();
    var t = c.target || 'card';
    if (t === 'all') return state.songs.slice();
    if (t === 'list') return filtered().slice();
    if (t === 'done') return state.songs.filter(function (s) { return s.st === 'done'; });
    if (t === 'start') {
      var ids0 = c.startIds || [];
      return state.songs.filter(function (x) { return ids0.indexOf(x.id) >= 0; });
    }
    // 默认：只针对当前编辑的那张卡面（绝不回退成全部）
    var eid = c.editId;
    var one = state.songs.filter(function (x) { return x.id === eid; })[0];
    return one ? [one] : [];
  }

  // 轮换图：相册多选，按上传顺序轮换
  function setGlobalCardImgs(files) {
    var list = Array.prototype.slice.call(files || []);
    if (!list.length) return;
    toast('正在处理 ' + list.length + ' 张图片…');
    var c = cardCfg();
    var out = [], done = 0;
    list.forEach(function (f) {
      compressCard(f, function (dataUrl) {
        if (dataUrl) out.push({ id: S.uid(), dataUrl: dataUrl, anchor: c.anchor || 'center' });
        if (++done === list.length) {
          if (!out.length) { toast('图片读取失败'); return; }
          c.gImages = (c.gImages || []).concat(out);
          c.mode = 'rotate';
          c.rotateOn = true;
          if (!c.rotateEvery) c.rotateEvery = (c.tiers && c.tiers[0]) || 1;
          out.forEach(function (im) { persistImage(im); });
          S.save();
          render(); openCardImgSheet();
          toast('已添加 ' + out.length + ' 张轮换图');
        }
      });
    });
  }

  // 换图档位：三个档位按键显示在数字框上方
  // 档位：只作为「每 N 张」的快捷值


  // ============ 三个子页面 ============

  // ① 当前卡面：只做「替换当前卡面图」
  function openCurSheet() {
    if (!cardDraft) begCardDraft();
    var c = cardCfg();
    var sg = state.songs.filter(function (x) { return x.id === c.editId; })[0];
    var im = sg ? cardImgOf(sg.id) : null;
    var url = im ? urlOf(im) : '';
    var html = sheetTitle('当前卡面') +
      '<div class="hint" style="margin-bottom:10px">' +
      (sg ? ('正在编辑：' + esc(sg.title) + ' · ' + esc(sg.artist || '未知歌手')) : '先在列表里长按一首歌') + '</div>' +
      (url
        ? '<div class="crop-box" style="background-image:url(\'' + url + '\');background-size:cover;background-position:center"></div>'
        : '<div class="crop-box" style="display:flex;align-items:center;justify-content:center;color:var(--txt3)">这张卡面还没有图</div>') +
      '<div class="btn-row" style="margin-top:12px">' +
      '<button class="btn acc" data-act="curpick">' + icon('photo') + '替换当前卡面图</button>' +
      '</div>' +
      '<div class="btn-row" style="margin-top:8px">' +
      (url ? '<button class="btn danger" data-act="curclear">' + icon('trash') + '清除这张卡面的图</button>' : '') +
      '</div>' +
      '<div class="btn-row" style="margin-top:8px">' +
      '<button class="btn" data-act="curblank">' + icon('refresh') + '恢复空白卡</button>' +
      '</div>' +
      '<div class="btn-row" style="margin-top:8px">' +
      '<button class="btn" data-act="curback">' + icon('arrow-back-up') + '返回</button>' +
      '</div>';
    sheet(html, 'cur');
  }

  // ② 轮换图：固定档位 1/5/10 + 自定义（带开关）
  function openRotSheet() {
    if (!cardDraft) begCardDraft();
    var c = cardCfg();
    var g = c.gImages || [];
    var thumbs = g.map(function (im, i) {
      return '<div class="thumb" data-act="cardgdel" data-v="' + i +
        '" style="background-image:url(\'' + urlOf(im) + '\')"><span class="del">✕</span></div>';
    }).join('');
    var tiers = [1, 5, 10];
    var names = ['一档', '二档', '三档'];
    var useCustom = !!c.rotateUseCustom;
    var html = sheetTitle('轮换图') +
      '<div class="hint" style="margin-bottom:10px">按上传顺序铺满列表，每 N 张卡面换下一张。</div>' +
      '<div class="tier-row" style="margin-bottom:12px">' +
      tiers.map(function (n, i) {
        return '<span class="tier' + ((!useCustom && c.rotateEvery === n) ? ' on' : '') +
          '" data-act="rottier" data-v="' + n + '">' +
          '<em>' + names[i] + '</em><b style="font-size:calc(15px * var(--fs));padding:0 4px">' + n + '</b><em>张</em></span>';
      }).join('') + '</div>' +
      '<div class="every-row" style="margin-bottom:10px">' +
      '<span class="pick ' + (useCustom ? 'on' : '') + '" data-act="rotcustom">' + (useCustom ? '开' : '关') + '</span>' +
      '<span>每</span>' +
      '<input class="num-box" id="rotCustom" type="number" min="1" max="200" inputmode="numeric" value="' + (c.rotateCustom || 5) + '">' +
      '<span>张卡面换一张</span>' +
      '</div>' +
      '<div class="thumbs">' + thumbs + '<div class="thumb add" data-act="rotadd">＋</div></div>' +
      '<div class="btn-row" style="margin-top:10px">' +
      '<button class="btn acc" data-act="rotadd">' + icon('folder') + '相册多选</button>' +
      '</div>' +
      '<div class="btn-row" style="margin-top:14px">' +
      '<button class="btn" data-act="rotback">' + icon('arrow-back-up') + '返回</button>' +
      '<button class="btn acc" data-act="cardsavecfg">' + icon('device-floppy') + '保存配置</button>' +
      '</div>';
    sheet(html, 'rot');
  }

  // ③ 覆盖图：每个起点独立图 + 独立张数
  function openCovSheet() {
    if (!cardDraft) begCardDraft();
    var c = cardCfg();
    var list = c.coverStarts || [];
    var rows = list.length ? list.map(function (st, i) {
      var sg = state.songs.filter(function (x) { return x.id === st.songId; })[0];
      var url = st.img ? urlOf(st.img) : '';
      return '<div class="cov-item">' +
        '<div class="cov-thumb" style="' + (url ? "background-image:url('" + url + "')" : '') + '">' +
        (url ? '' : icon('photo')) + '</div>' +
        '<div class="cov-body">' +
        '<div class="cov-title">' + esc(sg ? sg.title : '（已删除）') + '</div>' +
        '<div class="cov-count"><span>覆盖</span>' +
        '<input class="num-box sm" type="number" min="1" max="200" inputmode="numeric" data-covcount="' + i + '" value="' + (st.count || 1) + '">' +
        '<span>张卡面</span></div>' +
        '</div>' +
        '<div class="cov-acts">' +
        '<button class="mini-btn" data-act="covpick" data-v="' + i + '">换图</button>' +
        '<button class="mini-btn danger" data-act="covdel2" data-v="' + i + '">删除</button>' +
        '</div>' +
        '</div>';
    }).join('') : '<div class="hint">还没有起点。长按列表里任意歌曲 → 「设为覆盖起点」。</div>';
    var html = sheetTitle('覆盖图') +
      '<div class="hint" style="margin-bottom:12px">每个起点单独设置图片和张数，只影响该起点向下，互不干扰。</div>' +
      rows +
      '<div class="btn-row" style="margin-top:12px">' +
      '<button class="btn acc" data-act="covnew">' + icon('plus') + '新建起点</button>' +
      '</div>' +
      '<div class="btn-row" style="margin-top:10px">' +
      '<button class="btn" data-act="covback">' + icon('arrow-back-up') + '返回</button>' +
      '<button class="btn acc" data-act="cardsavecfg">' + icon('device-floppy') + '保存配置</button>' +
      '</div>';
    sheet(html, 'cov');
  }

  function openTrashSheet() {
    var tr = state.trash || [];
    var rows = tr.length ? tr.map(function (t, i) {
      var d = new Date(t.at || Date.now());
      return '<div class="cov-item">' +
        '<div class="cov-thumb">' + icon('music') + '</div>' +
        '<div class="cov-body"><div class="cov-title">' + esc(t.song.title) + '</div>' +
        '<div class="cov-count"><span>' + esc(t.song.artist || '未知') + ' · ' + (d.getMonth() + 1) + '/' + d.getDate() + '</span></div></div>' +
        '<div class="cov-acts">' +
        '<button class="mini-btn" data-act="trashtake" data-v="' + i + '">恢复</button>' +
        '<button class="mini-btn danger" data-act="trashdrop" data-v="' + i + '">删除</button></div></div>';
    }).join('') : '<div class="hint">回收站是空的。</div>';
    sheet(sheetTitle('最近删除') +
      '<div class="hint" style="margin-bottom:10px">删除的歌曲会保留在这里（最多 30 首）。</div>' + rows +
      '<div class="btn-row" style="margin-top:14px">' +
      '<button class="btn danger" data-act="trashclear">清空回收站</button>' +
      '<button class="btn" data-act="closesheet">关闭</button></div>', 'trash');
  }

  function openStartSheet() {
    if (!cardDraft) begCardDraft();
    var c = cardCfg();
    var list = c.coverStarts || [];
    var rows = list.length ? list.map(function (st, i) {
      var sg = state.songs.filter(function (x) { return x.id === st.songId; })[0];
      return '<div class="cov-item">' +
        '<div class="cov-thumb" style="' + (st.img ? "background-image:url('" + urlOf(st.img) + "')" : '') + '">' +
        (st.img ? '' : icon('photo')) + '</div>' +
        '<div class="cov-body"><div class="cov-title">' + esc(sg ? sg.title : '（已删除）') + '</div>' +
        '<div class="cov-count"><span>覆盖 ' + (st.count || 1) + ' 张卡面</span></div></div>' +
        '<div class="cov-acts"><button class="mini-btn danger" data-act="startdel" data-v="' + i + '">删除</button></div>' +
        '</div>';
    }).join('') : '<div class="hint">还没有起点。在覆盖图页点「新建起点」，或长按歌曲 →「设为覆盖起点」。</div>';
    sheet(sheetTitle('起点管理') +
      '<div class="hint" style="margin-bottom:10px">覆盖图会从每个起点开始向下铺。</div>' + rows +
      '<div class="btn-row" style="margin-top:14px">' +
      '<button class="btn" data-act="startback">' + icon('arrow-back-up') + '返回</button>' +
      '<button class="btn acc" data-act="cardsavecfg">' + icon('device-floppy') + '保存配置</button></div>', 'starts');
  }

  // 图片总入口：三个子页面
  function openCardImgSheet() {
    if (!cardDraft) begCardDraft();
    var c = cardCfg();
    var single = Object.keys(state.cardImgs || {}).length;
    var cur = c.mode || 'cur';
    var mark = function (m) { return cur === m ? ' · 当前' : ''; };
    var html = sheetTitle('卡片图片') +
      '<div class="field"><div class="btn-row" style="flex-direction:column">' +
      '<button class="btn acc" data-act="opencur">' + icon('photo') + '当前卡面' + mark('cur') + '</button>' +
      '<button class="btn" data-act="openrot">' + icon('arrows-shuffle') + '轮换图' + mark('rotate') + '</button>' +
      '<button class="btn" data-act="opencov">' + icon('stack-2') + '覆盖图' + mark('cover') + '</button>' +
      '</div></div>' +
      '<div class="hint">当前有 ' + single + ' 首歌曲设置了单独卡面图。</div>' +
      '<div class="btn-row" style="margin-top:12px">' +
      '<button class="btn danger" data-act="cardimgclear">' + icon('trash') + '清空全部卡面图</button>' +
      '</div>' +
      '<div class="btn-row" style="margin-top:8px">' +
      '<button class="btn" data-act="cardblank">' + icon('refresh') + '恢复空白卡面（当前卡）</button>' +
      '</div>';
    sheet(html, 'img');
  }

  function openCurPick() {
    var fi = document.getElementById('cardShotInput');
    fi.onchange = function () {
      var f = fi.files[0];
      fi.value = '';
      if (!f) return;
      compressCard(f, function (d) {
        if (!d) { toast('图片读取失败'); return; }
        var cc = cardCfg();
        var id = cc.editId;
        if (!id) { toast('先在列表里长按一首歌'); return; }
        var im = { dataUrl: d, anchor: 'auto' };
        state.cardImgs[id] = im;
        if (state.cardBlank) delete state.cardBlank[id];
        persistImage(im);
        cc.mode = 'cur'; cc.curOn = true; cc.rotateOn = false; cc.coverOn = false;
        commitCardDraft();
        S.save(); render(); openCurSheet();
        toast('已替换当前卡面图');
      });
    };
    fi.click();
  }

  /* 截图：在图片上框选一块 */
  function openShotPicker() {
    var fi = document.getElementById('cardShotInput');
    fi.onchange = function () {
      var f = fi.files[0];
      fi.value = '';
      if (!f) return;
      var url = URL.createObjectURL(f);
      openShotTool(url);
    };
    fi.click();
  }

  function openShotTool(url) {
    var html = sheetTitle('截图取图') +
      '<div class="shot-wrap" id="shotWrap"><img id="shotImg" src="' + url + '">' +
      '<div class="shot-box" id="shotBox" style="left:10%;top:20%;width:80%;height:40%"><span class="hd" id="shotHd"></span></div></div>' +
      '<div class="pick-row" style="margin-top:10px">' +
      ANCHORS.map(function (a) {
        return '<span class="pick" data-act="shotanchor" data-v="' + a[0] + '">' + a[1] + '</span>';
      }).join('') + '</div>' +
      '<div class="hint" style="margin:8px 0">拖动框选区域，右下圆点可缩放；选好后点「预览」。</div>' +
      '<div class="btn-row"><button class="btn" data-act="closesheet">取消</button>' +
      '<button class="btn acc" data-act="shotok">预览</button></div>';
    sheet(html);
    bindShotDrag();
  }

  function bindShotDrag() {
    var wrap = document.getElementById('shotWrap'), box = document.getElementById('shotBox');
    if (!wrap || !box) return;
    var mode = null, sx = 0, sy = 0, rect = null;
    function geo() {
      return { w: wrap.clientWidth, h: wrap.clientHeight };
    }
    function start(e) {
      var t = e.touches ? e.touches[0] : e;
      mode = (e.target && e.target.id === 'shotHd') ? 'resize' : 'move';
      sx = t.clientX; sy = t.clientY;
      rect = { l: box.offsetLeft, t: box.offsetTop, w: box.offsetWidth, h: box.offsetHeight };
      if (e.cancelable) e.preventDefault();
    }
    function move(e) {
      if (!mode) return;
      var t = e.touches ? e.touches[0] : e;
      var g = geo();
      var dx = t.clientX - sx, dy = t.clientY - sy;
      if (mode === 'move') {
        box.style.left = Math.max(0, Math.min(g.w - rect.w, rect.l + dx)) + 'px';
        box.style.top = Math.max(0, Math.min(g.h - rect.h, rect.t + dy)) + 'px';
      } else {
        var w = Math.max(40, Math.min(g.w - rect.l, rect.w + dx));
        var h = Math.max(30, Math.min(g.h - rect.t, rect.h + dy));
        box.style.width = w + 'px';
        box.style.height = h + 'px';
      }
      if (e.cancelable) e.preventDefault();
    }
    function end() { mode = null; }
    wrap.addEventListener('touchstart', start, { passive: false });
    wrap.addEventListener('touchmove', move, { passive: false });
    wrap.addEventListener('touchend', end);
    wrap.addEventListener('mousedown', start);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
  }

  function shotAnchor(a) {
    var wrap = document.getElementById('shotWrap'), box = document.getElementById('shotBox');
    if (!wrap || !box) return;
    var g = { w: wrap.clientWidth, h: wrap.clientHeight };
    var w = box.offsetWidth, h = box.offsetHeight;
    var pos = {
      'left top': [0, 0], 'left bottom': [0, g.h - h],
      'right bottom': [g.w - w, g.h - h], 'right top': [g.w - w, 0],
      'center': [(g.w - w) / 2, (g.h - h) / 2]
    }[a] || [0, 0];
    box.style.left = pos[0] + 'px';
    box.style.top = pos[1] + 'px';
  }

  function shotToDataUrl(cb) {
    var img = document.getElementById('shotImg'), box = document.getElementById('shotBox');
    if (!img || !box) { cb(null); return; }
    var sx = box.offsetLeft / img.clientWidth * img.naturalWidth;
    var sy = box.offsetTop / img.clientHeight * img.naturalHeight;
    var sw = box.offsetWidth / img.clientWidth * img.naturalWidth;
    var sh = box.offsetHeight / img.clientHeight * img.naturalHeight;
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(sw));
    cv.height = Math.max(1, Math.round(sh));
    cv.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    cb(cv.toDataURL('image/jpeg', 0.75));
  }

  /* 预览：退回上一页（记住来源面板） */
  var previewFrom = 'card';
  var previewing = false;
  var lastPreviewSheet = 'card';

  function pvBack() {
    var from = lastPreviewSheet || previewFrom || 'card';
    // 先把浮窗彻底关掉，再回面板（否则会残留“预览中”浮条）
    var bar = document.getElementById('previewBar');
    if (bar) { bar.classList.add('hidden'); bar.innerHTML = ''; }
    var host = document.getElementById('previewHost');
    if (host) { host.classList.add('hidden'); host.innerHTML = ''; }
    previewOverride = null;
    previewing = false;
    pendingShot = null;
    render();
    closeSheet();
    if (from === 'img') openCardImgSheet();
    else if (from === 'every') openEverySheet(false);
    else if (from === 'settings') openSettings();
    else openCardSheet();
  }

  function openCardPreview(pending) {
    if (pending) pendingShot = pending;
    previewFrom = curSheetName || 'card';
    if (pendingShot) {
      var ids = targetSongs().map(function (x) { return x.id; });
      previewOverride = ids.length ? { ids: ids, img: pendingShot } : null;
    } else {
      previewOverride = null;
    }
    // 返回面板时要能重开
    lastPreviewSheet = previewFrom;
    closeSheet();
    if (view.tab === 'chart') { view.tab = 'home'; renderTabs(); }
    render();
    if (listEl) listEl.scrollTop = 0;
    previewing = true;
    showPreviewBar(!!pendingShot);
  }

  function showPreviewBar(hasPending) {
    var bar = document.getElementById('previewBar');
    if (!bar) return;
    bar.innerHTML = '<div class="pv-tag">预览中：这就是修改后的首页' +
      '<small>' + (hasPending ? ('保存范围：' + esc(targetLabel()) + '（共 ' + targetSongs().length + ' 首）') : '可正常点选、滚动、勾选') + '</small></div>' +
      '<button data-act="pvback">' + icon('arrow-back-up') + '退回</button>' +
      (hasPending ? '<button class="acc" data-act="cardsave">保存</button>' : '');
    bar.classList.remove('hidden');
  }

  function closeFullPreview() {
    previewOverride = null;
    pendingShot = null;
    previewing = false;
    var bar = document.getElementById('previewBar');
    if (bar) { bar.classList.add('hidden'); bar.innerHTML = ''; }
    var host = document.getElementById('previewHost');
    if (host) { host.classList.add('hidden'); host.innerHTML = ''; }
    render();
  }


  var pendingShot = null;

  function savePendingShot() {
    if (!pendingShot) { toast('没有待保存的图片'); return; }
    var songs = targetSongs();
    if (!songs.length) { toast('没有可分配的歌'); return; }
    var n = 0;
    for (var i = 0; i < songs.length; i++) {
      if (Object.keys(state.cardImgs).length >= MAX_CARD_IMGS) break;
      if (String(songs[i].id).indexOf('__demo') === 0) continue;
      var nim = { dataUrl: pendingShot.dataUrl, anchor: cardCfg().anchor };
      state.cardImgs[songs[i].id] = nim;
      persistImage(nim);
      n++;
    }
    pendingShot = null;
    try { S.save(); } catch (e) { }
    render(); closeFullPreview(); closeSheet();
    toast('已保存到 ' + n + ' 首' + (n > 1 ? '（目标：' + targetLabel() + '）' : ''));
  }

  /* ---------------- 歌名卡片自定义 ---------------- */
  function miniPreviewHtml() {
    var c = cardCfg();
    var sg = state.songs.filter(function (x) { return x.id === c.editId; })[0] || state.songs[0] ||
      { title: '示例歌曲', artist: '示例歌手', diff: 3, st: 'todo' };
    var own = cardImgOf(sg.id);
    var covList = (c.coverImages && c.coverImages.length) ? c.coverImages : null;
    var gList = (c.gImages && c.gImages.length) ? c.gImages : null;
    var use = own || covList || gList ? (own || (covList ? covList[0] : gList[0])) : null;
    var url = use ? urlOf(use) : '';
    var imgHtml = '';
    if (url) {
      var stl = "background-image:url('" + url + "');background-size:cover;background-position:" + anchorCss(use.anchor || c.anchor) + ";";
      imgHtml = '<span class="cardimg" style="' + stl + '"></span>' +
        (c.showImgVeil === true ? '<span class="cardveil"></span>' : '');
    }
    return '<div class="mini-preview"><div class="mp-label">实时预览</div>' +
      '<div class="row' + (url ? ' has-img' : '') + (url && c.fadeRight ? ' fade-r' : '') + (c.accentBar ? ' accent-bar' : '') + '">' +
      imgHtml +
      (c.showRank !== false ? '<div class="rank">1</div>' : '') +
      '<label class="cb"><input type="checkbox"><span class="box">✓</span></label>' +
      '<div class="main"><div class="l1"><span class="title">' + esc(sg.title) + '</span>' +
      (c.showDiff !== false ? '<span class="dchip d' + (sg.diff || 0) + '">' + (sg.diff ? S.STARS[sg.diff] : '未评') + '</span>' : '') +
      '</div><div class="l2">' + (c.showArtist !== false ? '<span class="ar">' + esc(sg.artist || '未知歌手') + '</span>' : '') +
      '</div></div></div></div>';
  }

  function openCardSheet(noDraft) {
    if (!cardDraft) begCardDraft();
    var c = cardCfg();
    var styles = [['default', '默认原卡片'], ['glass', '磨砂'], ['plain', '透明'], ['outline', '描边']];
    var collapsed = state.settings.cardAccFold !== false;
    var html = sheetTitle('歌名卡片') +
      miniPreviewHtml() +
      '<div class="field"><label>卡片样式</label><div class="pick-row">' +
      styles.map(function (p) {
        return '<span class="pick ' + (c.style === p[0] ? 'on' : '') + '" data-act="cardstyle" data-v="' + p[0] + '">' + p[1] + '</span>';
      }).join('') + '</div></div>' +
      '<div class="field"><label>显示内容</label><div class="pick-row">' +
      '<span class="pick ' + (c.showArtist ? 'on' : '') + '" data-act="cardtoggle" data-v="showArtist">歌手</span>' +
      '<span class="pick ' + (c.showDiff ? 'on' : '') + '" data-act="cardtoggle" data-v="showDiff">难度</span>' +
      '<span class="pick ' + (c.showRank ? 'on' : '') + '" data-act="cardtoggle" data-v="showRank">序号</span>' +
      '<span class="pick ' + (c.showPlays ? 'on' : '') + '" data-act="cardtoggle" data-v="showPlays">练习次数</span>' +
      '</div></div>' +

      '<div class="field"><label>外观</label>' +
      '<div class="mini-row"><span>圆角</span><input type="range" id="cardRadius" min="0" max="30" step="1" value="' + (c.radius == null ? 14 : c.radius) + '">' +
      '<em id="cardRadiusVal">' + (c.radius == null ? 14 : c.radius) + '</em></div>' +
      '<div class="mini-row"><span>间距</span><input type="range" id="cardGap" min="0" max="20" step="1" value="' + (c.gap == null ? 7 : c.gap) + '">' +
      '<em id="cardGapVal">' + (c.gap == null ? 7 : c.gap) + '</em></div>' +
      '<div class="mini-row"><span>图片透明度</span><input type="range" id="cardOpacity" min="30" max="100" step="5" value="' + Math.round((c.imgOpacity == null ? 0.95 : c.imgOpacity) * 100) + '">' +
      '<em id="cardOpacityVal">' + Math.round((c.imgOpacity == null ? 0.95 : c.imgOpacity) * 100) + '%</em></div>' +
      '<div class="mini-row"><span>卡面整体透明度</span><input type="range" id="cardAlpha" min="0" max="100" step="5" value="' + Math.round((c.cardOpacity == null ? 1 : c.cardOpacity) * 100) + '">' +
      '<em id="cardAlphaVal">' + Math.round((c.cardOpacity == null ? 1 : c.cardOpacity) * 100) + '%</em></div>' +
      '<div class="pick-row" style="margin-top:6px">' +
      '<span class="pick ' + (c.accentBar ? 'on' : '') + '" data-act="cardaccent">左侧色条</span>' +
      '<span class="pick ' + (c.showImgVeil === true ? 'on' : '') + '" data-act="cardveil">文字遮罩</span>' +
      '</div>' +
      '<div class="hint" style="margin-top:6px">默认不盖遮罩，卡面图按原图亮度显示。</div></div>' +
      '<div class="acc-head' + (collapsed ? '' : ' open') + '" data-act="cardfold">' +
      '换图档位与图片' + icon('chevron-right') + '</div>' +
      (collapsed ? '' : ('<div class="btn-row">' +
        '<button class="btn" data-act="opencur">当前卡面</button>' +
        '<button class="btn" data-act="openrot">轮换图</button>' +
        '</div><div class="btn-row" style="margin-top:8px">' +
        '<button class="btn" data-act="opencov">覆盖图</button>' +
        '<button class="btn danger" data-act="cardreset">恢复默认</button>' +
        '</div>')) +
      '<div class="btn-row" style="margin-top:10px">' +
      '<button class="btn" data-act="openstarts">' + icon('flag') + '起点管理（' + ((c.coverStarts || []).length) + '）</button>' +
      '</div>' +
      '<div class="btn-row" style="margin-top:10px">' +
      '<button class="btn" data-act="cardpreview">' + icon('check') + '预览</button>' +
      '<button class="btn acc" data-act="cardsavecfg">' + icon('device-floppy') + '保存配置</button></div>';
    sheet(html, 'card');
  }

  /* ---------------- 各种面板 ---------------- */
  function openDetail(id) {
    var s = state.songs.filter(function (x) { return x.id === id; })[0];
    if (!s) return;
    var d = s.diff || 0;
    var html = sheetTitle(s.title) +
      '<div class="field"><label>歌名</label><input type="text" id="edTitle" value="' + esc(s.title) + '"></div>' +
      '<div class="field"><label>歌手</label><input type="text" id="edArtist" value="' + esc(s.artist) + '"></div>' +
      '<div class="field"><label>难度（手动评星）</label><div class="stars" id="edStars">' +
      [1, 2, 3, 4, 5].map(function (i) {
        return '<button data-act="star" data-v="' + i + '" class="' + (d >= i ? 'on' : '') + '">★</button>';
      }).join('') +
      '<button data-act="star" data-v="0" style="width:auto;padding:0 12px;font-size:13px">清除</button>' +
      '</div><div class="hint" style="margin-top:6px">当前：' + S.diffText(d) + ' ' + S.DIFF_LABEL[d] +
      '（来源：' + (s.diffSrc === 'manual' ? '手动' : s.diffSrc === 'bank' ? '内置库' : s.diffSrc === 'import' ? '导入' : '无') + '）</div></div>' +
      '<div class="field"><label>状态</label><div class="seg" id="edState">' +
      [['todo', '未唱'], ['done', '已唱']].map(function (p) {
        return '<button data-act="setstate" data-v="' + p[0] + '" class="' + (s.st === p[0] ? 'on' : '') + '">' + p[1] + '</button>';
      }).join('') + '</div></div>' +
      '<div class="field"><label>歌单（可多选）</label><div class="pick-row" id="edTags">' +
      (state.lists.length ? state.lists.map(function (l) {
        return '<span class="pick ' + (s.tags.indexOf(l) >= 0 ? 'on' : '') + '" data-act="toggletag" data-v="' + esc(l) + '">' + esc(l) + '</span>';
      }).join('') : '<span class="hint">还没有歌单，去设置里新建</span>') +
      '</div></div>' +
      '<div class="kv"><span>练习次数</span><span>' + (s.plays || 0) + ' 次</span></div>' +
      '<div class="kv"><span>上次练习</span><span>' + (s.last ? new Date(s.last).toLocaleDateString() : '—') + '</span></div>' +
      '<div class="hint" style="margin-bottom:8px">歌名和歌手可以直接改，OCR 认错的字在这里修正，改完点「保存修改」。</div>' +
      '<div class="btn-row">' +
      '<button class="btn acc" data-act="savedetail" data-id="' + s.id + '">保存修改</button>' +
      '<button class="btn" data-act="practice" data-id="' + s.id + '">练一次 +1</button>' +
      '<button class="btn danger" data-act="del" data-id="' + s.id + '">删除</button>' +
      '</div>';
    sheet(html);
    curEdit = id;
  }
  var curEdit = null;

  function openFilter() {
    var df = state.settings.diffFilter, lf = state.settings.listFilter;
    var html = sheetTitle('筛选') +
      '<div class="field"><label>难度</label><div class="pick-row">' +
      ['全部', '未评', '★', '★★', '★★★', '★★★★', '★★★★★'].map(function (t, i) {
        var v = i === 0 ? 0 : (i === 1 ? 'none' : i - 1);
        var on = String(df) === String(v);
        return '<span class="pick ' + (on ? 'on' : '') + '" data-act="setdiff" data-v="' + v + '">' + t + '</span>';
      }).join('') + '</div></div>' +
      '<div class="field"><label>歌单</label><div class="pick-row">' +
      '<span class="pick ' + (!lf ? 'on' : '') + '" data-act="setlist" data-v="">全部歌单</span>' +
      state.lists.map(function (l) {
        return '<span class="pick ' + (lf === l ? 'on' : '') + '" data-act="setlist" data-v="' + esc(l) + '">' + esc(l) + '</span>';
      }).join('') + '</div></div>' +
      '<div class="btn-row" style="margin-top:14px"><button class="btn acc" data-act="closesheet">完成</button></div>';
    sheet(html);
  }

  function openSettings() {
    var s = state.settings;
    var html = sheetTitle('设置') +
      '<div class="field"><label>主题</label><div class="seg">' +
      [['auto', '跟随系统'], ['dark', '深色'], ['light', '浅色']].map(function (p) {
        return '<button data-act="theme" data-v="' + p[0] + '" class="' + (s.theme === p[0] ? 'on' : '') + '">' + p[1] + '</button>';
      }).join('') + '</div></div>' +
      '<div class="field"><label>背景图</label><div class="btn-row">' +
      '<button class="btn acc" data-act="bgopen">' + icon('photo') + '添加 / 管理背景</button>' +
      '</div></div>' +
      '<div class="field"><label>歌名卡片</label><div class="btn-row">' +
      '<button class="btn" data-act="cardopen">' + icon('list') + '卡片样式（长按歌曲也能改）</button>' +
      '</div></div>' +
      '<div class="field"><label>整体字号 <span id="fsVal">' + Math.round(s.fs * 100) + '%</span></label>' +
      '<input type="range" id="fsRange" min="85" max="140" step="5" value="' + Math.round(s.fs * 100) + '" style="width:100%"></div>' +
      '<div class="field"><label>歌名粗细 <span id="wtTitleVal">' + (s.weightTitle || 600) + '</span></label>' +
      '<input type="range" id="wtTitle" min="300" max="800" step="100" value="' + (s.weightTitle || 600) + '" style="width:100%"></div>' +
      '<div class="field"><label>歌手粗细 <span id="wtSubVal">' + (s.weightSub || 400) + '</span></label>' +
      '<input type="range" id="wtSub" min="300" max="700" step="100" value="' + (s.weightSub || 400) + '" style="width:100%"></div>' +
      '<div class="field"><label>按键背景透明度 <span id="iconOpVal">' + Math.round((s.iconOpacity == null ? 0.75 : s.iconOpacity) * 100) + '%</span></label>' +
      '<input type="range" id="iconOp" min="20" max="100" step="5" value="' + Math.round((s.iconOpacity == null ? 0.75 : s.iconOpacity) * 100) + '" style="width:100%">' +
      '<div class="hint" style="margin-top:4px">底部七个标签图标不受影响。</div></div>' +
      '<div class="field"><label>歌名字号 <span id="fsTitleVal">' + Math.round((s.fsTitle || 1) * 100) + '%</span></label>' +
      '<input type="range" id="fsTitleRange" min="85" max="150" step="5" value="' + Math.round((s.fsTitle || 1) * 100) + '" style="width:100%"></div>' +
      '<div class="field"><label>歌手字号 <span id="fsSubVal">' + Math.round((s.fsSub || 1) * 100) + '%</span></label>' +
      '<input type="range" id="fsSubRange" min="80" max="150" step="5" value="' + Math.round((s.fsSub || 1) * 100) + '" style="width:100%"></div>' +
      '<div class="field"><label>歌单管理</label>' +
      '<div class="pick-row" id="listManage">' +
      (state.lists.length ? state.lists.map(function (l) {
        return '<span class="pick" data-act="dellist" data-v="' + esc(l) + '">' + esc(l) + ' ✕</span>';
      }).join('') : '<span class="hint">暂无歌单</span>') +
      '</div>' +
      '<div class="btn-row" style="margin-top:8px"><button class="btn" data-act="addlist">＋ 新建歌单</button></div></div>' +
      '<div class="field"><label>歌曲</label><div class="btn-row">' +
      '<button class="btn acc" data-act="import">' + icon('plus') + '导入歌曲</button>' +
      '<button class="btn" data-act="fillartists">' + icon('pencil') + '补全缺失歌手</button>' +
      '<button class="btn" data-act="fixtitles">' + icon('arrow-back-up') + '整理歌名序号</button>' +
      '</div></div>' +
      '<div class="field"><label>数据</label><div class="btn-row">' +
      '<button class="btn" data-act="restoretrash">' + icon('arrow-back-up') + '最近删除（' + ((state.trash || []).length) + '）</button>' +
      '<button class="btn" data-act="backup">导出备份</button>' +
      '<button class="btn" data-act="restore">导入备份</button>' +
      '<button class="btn" data-act="demo">载入示例</button>' +
      '<button class="btn danger" data-act="clearall">清空全部</button>' +
      '</div></div>' +
      '<div class="field"><label>说明</label><div class="hint">' +
      '· 勾选 = 已唱，勾上的歌会沉到列表最下面。<br>' +
      '· 未唱的歌会出现在「抽一首」里。<br>' +
      '· 难度来源：内置库（人工估计，仅供参考）、导入的难度、手动评星（优先级最高）。<br>' +
      '· 「重新排序」只用内置库重算，不联网。<br>' +
      '· 全部数据只存在手机本地。' +
      '</div></div>' +
      '<div class="btn-row"><button class="btn acc" data-act="closesheet">完成</button></div>';
    sheet(html);
  }

  function openImport(prefill) {
    var html = sheetTitle('导入歌曲') +
      '<div class="field"><label>粘贴文本或导入文件（支持 txt / csv / docx / xlsx，每行一首）</label>' +
      '<textarea id="impText" placeholder="1 爱你 - 王心凌&#10;2 小酒窝 - 林俊杰&#10;3 演员 - 薛之谦">' + esc(prefill || '') + '</textarea></div>' +
      '<div class="btn-row">' +
      '<button class="btn" data-act="pickimg">' + icon('photo') + '图片识别</button>' +
      '<button class="btn" data-act="pickfile">' + icon('file-text') + '导入文件</button>' +
      '</div>' +
      '<div class="progress hidden" id="ocrBar"><i></i></div>' +
      '<div class="hint" id="ocrHint" style="margin:8px 0"></div>' +
      '<div class="field"><label>导入选项</label><div class="pick-row" id="impOpts">' +
      '<span class="pick on" data-act="toggleautofill" data-v="1">自动补全缺失的原唱歌手</span>' +
      '<span class="pick on" data-act="toggleautobank" data-v="1">套用内置难度库</span>' +
      '</div></div>' +
      '<div class="field" style="margin-top:12px"><label>导入到歌单</label><div class="pick-row" id="impList">' +
      '<span class="pick on" data-act="implist" data-v="">不分类</span>' +
      state.lists.map(function (l) {
        return '<span class="pick" data-act="implist" data-v="' + esc(l) + '">' + esc(l) + '</span>';
      }).join('') +
      '</div></div>' +
      '<div class="btn-row" style="margin-bottom:10px">' +
      '<button class="btn" data-act="parse">解析预览</button>' +
      '<button class="btn acc" data-act="doimport">确认导入</button>' +
      '</div>' +
      '<div id="impPreview"></div>';
    sheet(html);
    curImport.list = '';
    curImport.items = [];
    curImport.autofill = true;
    curImport.autobank = true;
  }
  var curImport = { list: '', items: [], autofill: true, autobank: true };

  function openExport() {
    var rows = exportRows();
    var html = sheetTitle('导出 / 分享') +
      '<div class="hint" style="margin-bottom:12px">共 ' + rows.length + ' 首（当前筛选后的结果）</div>' +
      '<div class="btn-row">' +
      '<button class="btn acc" data-act="sharetext">分享文本</button>' +
      '<button class="btn" data-act="savetext">保存 TXT</button>' +
      '</div>' +
      '<div class="field" style="margin-top:12px"><label>图片版式</label><div class="pick-row">' +
      '<span class="pick ' + (exportStyle === 'list' ? 'on' : '') + '" data-act="exstyle" data-v="list">列表长图</span>' +
      '<span class="pick ' + (exportStyle === 'square' ? 'on' : '') + '" data-act="exstyle" data-v="square">方形海报</span>' +
      '<span class="pick ' + (exportStyle === 'mini' ? 'on' : '') + '" data-act="exstyle" data-v="mini">极简纯文本图</span>' +
      '</div></div>' +
      '<div class="btn-row" style="margin-top:8px">' +
      '<button class="btn" data-act="shareimg">生成图片分享</button>' +
      '<button class="btn" data-act="saveimg">保存图片</button>' +
      '</div>' +
      '<div class="btn-row" style="margin-top:8px">' +
      '<button class="btn" data-act="copytext">复制到剪贴板</button>' +
      '</div>';
    sheet(html);
  }

  function exportRows() {
    var groups = buildGroups(), out = [];
    groups.forEach(function (g) { out = out.concat(g.rows); });
    return out;
  }

  function exportTitle() {
    return '茶白歌单 · ' + (TITLES[view.tab] || ['歌单'])[0];
  }

  function makeImage(rows) {
    if (exportStyle === 'square') return makeSquare(rows);
    if (exportStyle === 'mini') return makeMini(rows);
    var W = 1080, pad = 44, rh = 62, headerH = 170;
    var max = Math.min(rows.length, 120);
    var H = headerH + max * rh + 80;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var x = cv.getContext('2d');
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    x.fillStyle = dark ? '#12141a' : '#ffffff';
    x.fillRect(0, 0, W, H);
    var grd = x.createLinearGradient(0, 0, W, headerH);
    grd.addColorStop(0, '#7c5cff');
    grd.addColorStop(1, '#21c7b4');
    x.fillStyle = grd;
    x.fillRect(0, 0, W, 8);
    x.fillStyle = dark ? '#eef0f5' : '#14161c';
    x.font = 'bold 46px sans-serif';
    x.fillText(exportTitle(), pad, 96);
    x.font = '26px sans-serif';
    x.fillStyle = dark ? '#9aa1b0' : '#5d6472';
    var now = new Date();
    x.fillText(now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate() + '   共 ' + rows.length + ' 首', pad, 140);
    var y = headerH;
    var colors = ['#6b7382', '#3aa2ff', '#35d07f', '#ffd24d', '#ff9f43', '#ff5d6c'];
    var ccE = cardCfg();
    var rad = ccE.radius == null ? 14 : ccE.radius;
    var alpha = ccE.cardOpacity == null ? 1 : ccE.cardOpacity;
    var cardFill = dark ? ('rgba(26,28,34,' + alpha + ')') : ('rgba(255,255,255,' + alpha + ')');
    rows.slice(0, max).forEach(function (s, i) {
      var bx = pad - 14, bw = W - (pad - 14) * 2, by = y - rh + 18, bh = rh - 8;
      x.fillStyle = cardFill;
      x.beginPath();
      if (x.roundRect) x.roundRect(bx, by, bw, bh, rad); else x.rect(bx, by, bw, bh);
      x.fill();
      if (ccE.accentBar) {
        var g2 = x.createLinearGradient(bx, by, bx, by + bh);
        g2.addColorStop(0, '#7c5cff'); g2.addColorStop(1, '#21c7b4');
        x.fillStyle = g2;
        x.beginPath();
        if (x.roundRect) x.roundRect(bx, by, 5, bh, [rad, 0, 0, rad]); else x.rect(bx, by, 5, bh);
        x.fill();
      }
      x.fillStyle = dark ? '#6b7382' : '#8c93a3';
      x.font = '26px sans-serif';
      x.fillText((i + 1) + '', pad + 6, y);
      x.fillStyle = dark ? '#eef0f5' : '#14161c';
      x.font = 'bold 32px sans-serif';
      var title = s.title.length > 16 ? s.title.slice(0, 16) + '…' : s.title;
      x.fillText(title, pad + 60, y);
      x.font = '24px sans-serif';
      x.fillStyle = dark ? '#9aa1b0' : '#5d6472';
      var ar = (s.artist || '未知') ;
      if (ar.length > 10) ar = ar.slice(0, 10) + '…';
      x.fillText(ar, pad + 60 + 380, y);
      x.fillStyle = colors[s.diff || 0];
      x.font = '24px sans-serif';
      x.fillText(s.diff ? S.STARS[s.diff] : '未评', W - pad - 150, y);
      if (s.st === 'done') {
        x.fillStyle = '#35d07f';
        x.font = '22px sans-serif';
        x.fillText('已唱', W - pad - 20 - 60, y);
      }
      y += rh;
    });
    if (rows.length > max) {
      x.fillStyle = dark ? '#9aa1b0' : '#5d6472';
      x.font = '24px sans-serif';
      x.fillText('… 其余 ' + (rows.length - max) + ' 首未显示', pad, y + 10);
    }
    return cv.toDataURL('image/png');
  }

  function pullRandom() {
    var pool = state.songs.filter(function (s) { return s.st !== 'done'; });
    if (!pool.length) { toast(state.songs.length ? '没有可抽的歌：全部都标成「已唱」了' : '先导入歌曲吧'); return; }
    var recent = state.recent.slice(-5);
    var cand = pool.filter(function (s) { return recent.indexOf(s.id) < 0; });
    if (!cand.length) cand = pool;
    var total = 0;
    cand.forEach(function (s) { total += Math.max(1, s.diff || 2); });
    var r = Math.random() * total, acc = 0, pick = cand[0];
    for (var i = 0; i < cand.length; i++) {
      acc += Math.max(1, cand[i].diff || 2);
      if (r <= acc) { pick = cand[i]; break; }
    }
    state.recent.push(pick.id);
    if (state.recent.length > 30) state.recent.shift();
    S.save();
    S.Bridge.vibrate(18);
    var html = sheetTitle('唱歌时间') +
      '<div style="text-align:center;padding:10px 0 18px">' +
      '<div style="font-size:calc(26px * var(--fs));font-weight:800;margin-bottom:8px">' + esc(pick.title) + '</div>' +
      '<div style="color:var(--txt2)">' + esc(pick.artist || '未知歌手') + ' · ' + S.diffText(pick.diff) + ' ' + S.DIFF_LABEL[pick.diff || 0] + '</div>' +
      '</div>' +
      '<div class="btn-row">' +
      '<button class="btn acc" data-act="pull">再抽一首</button>' +
      '<button class="btn" data-act="practice" data-id="' + pick.id + '">唱完了 +1</button>' +
      '</div>';
    sheet(html);
  }

  function demoImport() {
    var demo = [
      ['小酒窝', '林俊杰'], ['演员', '薛之谦'], ['晴天', '周杰伦'], ['童话', '光良'],
      ['后来', '刘若英'], ['海阔天空', 'Beyond'], ['吻别', '张学友'], ['浮夸', '陈奕迅'],
      ['修炼爱情', '林俊杰'], ['大鱼', '周深'], ['青藏高原', '韩红'], ['小幸运', '田馥甄'],
      ['成都', '赵雷'], ['成都府', '赵雷'], ['泡沫', '邓紫棋'], ['光年之外', '邓紫棋'],
      ['消愁', '毛不易'], ['我们不一样', '大壮'], ['起风了', '买辣椒也用券'], ['千千阙歌', '陈慧娴']
    ].map(function (p) { return { title: p[0], artist: p[1], diff: 0 }; });
    var r = S.addSongs(demo, { useBank: true, listName: '' });
    toast('示例导入 ' + r.added + ' 首');
    closeSheet();
    render();
  }


  /* ---------------- 联网搜歌 ---------------- */
  var online = { items: [], chosen: {}, list: '' };

  function openOnlineSearch(prefill) {
    online.items = []; online.chosen = {};
    var html = sheetTitle('联网搜歌') +
      '<div class="field"><input type="text" id="osInput" placeholder="歌名或歌手，如：晴天 周杰伦"></div>' +
      '<div class="btn-row" style="margin-bottom:10px">' +
      '<button class="btn acc" data-act="osgo">搜索</button>' +
      '<button class="btn" data-act="osall">全选 / 取消</button>' +
      '</div>' +
      '<div id="osResult"><div class="hint">需要联网。搜不到的歌可以返回用「导入 → 粘贴文本」手动加。</div></div>' +
      '<div class="field" style="margin-top:12px"><label>加入歌单</label><div class="pick-row" id="osList">' +
      '<span class="pick on" data-act="oslist" data-v="">不分类</span>' +
      state.lists.map(function (l) {
        return '<span class="pick" data-act="oslist" data-v="' + esc(l) + '">' + esc(l) + '</span>';
      }).join('') + '</div></div>' +
      '<div class="btn-row"><button class="btn acc" data-act="osadd">添加选中的歌</button></div>';
    sheet(html, 'online');
    if (prefill) {
      var oi = document.getElementById('osInput');
      if (oi) oi.value = prefill;
      runOnlineSearch(prefill);
    }
  }

  function runOnlineSearch(q) {
    if (!(q || '').trim()) { toast('先输入歌名或歌手'); return; }
    var box = document.getElementById('osResult');
    if (box) box.innerHTML = '<div class="hint">搜索中…</div>';
    S.searchSongs(q).then(function (arr) { renderOsResult(arr); })
      .catch(function (e) {
        renderOsResult([]);
        toast('搜索失败：' + (e && e.message ? e.message : '网络问题'));
      });
  }

  function renderOsResult(arr) {
    online.items = arr || [];
    var box = document.getElementById('osResult');
    if (!box) return;
    if (!online.items.length) {
      box.innerHTML = '<div class="hint">没搜到，换个关键词试试（也可以只输入歌手名）。</div>';
      return;
    }
    box.innerHTML = '<div class="hint" style="margin-bottom:6px">共 ' + online.items.length + ' 条，点一下选中</div>' +
      '<div class="preview-list">' + online.items.map(function (it, i) {
        var dup = S.exists(it.title, it.artist);
        return '<div class="preview-item" data-act="ostoggle" data-v="' + i + '">' +
          '<span style="width:18px;color:var(--acc)">' + (online.chosen[i] ? '✓' : '') + '</span>' +
          '<span class="t">' + esc(it.title) + (dup ? ' <span style="color:var(--txt3)">(已有)</span>' : '') + '</span>' +
          '<span class="a">' + esc(it.artist || '—') + '</span>' +
          '</div>';
      }).join('') + '</div>';
  }

  /* ---------------- 事件 ---------------- */
  function handleAct(act, el) {
    var id = el.getAttribute('data-id');
    switch (act) {
      case 'tab':
        view.tab = el.getAttribute('data-v');
        state.settings.tab = view.tab === 'chart' ? 'home' : view.tab;
        if (view.tab === 'random' && !state.order.length) S.shuffle();
        S.save(); renderTabs();
        if (view.tab === 'chart') { loadChart(false); } else render();
        listEl.scrollTop = 0;
        break;
      case 'toggle': {
        var row = el.closest('.row'); if (!row) break;
        var s = find(row.getAttribute('data-id')); if (!s) break;
        s.st = (s.st === 'done') ? 'todo' : 'done';
        S.save(); render();
        break;
      }
      case 'editdiff': {
        var row3 = el.closest('.row'); if (!row3) break;
        openDetail(row3.getAttribute('data-id'));
        break;
      }
      case 'detail': {
        var row4 = el.closest('.row'); if (!row4) break;
        openDetail(row4.getAttribute('data-id'));
        break;
      }
      case 'state': {
        state.settings.stateFilter = el.getAttribute('data-v');
        S.save(); render();
        break;
      }
      case 'filtersheet': openFilter(); break;
      case 'resort': {
        var n = S.applyBank();
        toast(n ? '内置难度库更新了 ' + n + ' 首，已重新排序' : '没有需要更新的（手动评级不会覆盖）');
        render();
        break;
      }
      case 'resetcheck': {
        var cnt = state.songs.filter(function (s) { return s.st === 'done'; }).length;
        if (!cnt) { toast('没有勾选的歌'); break; }
        state.songs.forEach(function (s) { if (s.st === 'done') s.st = 'todo'; });
        S.save(); render(); toast('已取消全部勾选（' + cnt + ' 首）');
        break;
      }
      case 'reshuffle':
        S.shuffle(); render(); toast('已重新打乱'); S.Bridge.vibrate(15);
        break;
      case 'pull': pullRandom(); break;
      case 'export': openExport(); break;
      case 'import': openImport(''); break;
      case 'searchmode': setSearchMode(el.getAttribute('data-v')); break;
      case 'onlinesearch': openOnlineSearch(); break;
      case 'chartpick':
        chart.id = el.getAttribute('data-v');
        chart.items = [];
        renderChartChips();
        loadChart(false);
        break;
      case 'chartrefresh': loadChart(true); break;
      case 'chartall': {
        var anyOff = Object.keys(chart.chosen).filter(function (k) { return chart.chosen[k]; }).length < chart.items.length;
        chart.chosen = {};
        if (anyOff) chart.items.forEach(function (_, i) { chart.chosen[i] = true; });
        render();
        break;
      }
      case 'charttoggle': {
        var ii = el.getAttribute('data-id');
        chart.chosen[ii] = !chart.chosen[ii];
        render();
        break;
      }
      case 'chartadd': {
        var picked = Object.keys(chart.chosen).filter(function (k) { return chart.chosen[k]; })
          .map(function (k) { return chart.items[Number(k)]; }).filter(Boolean);
        if (!picked.length) { toast('先点几首想加的歌'); break; }
        var rr = S.addSongs(picked, { useBank: true, listName: '', mode: 'skip' });
        toast('加入 ' + rr.added + ' 首' + (rr.skipped ? '，已有 ' + rr.skipped + ' 首' : ''));
        chart.chosen = {};
        render();
        break;
      }
      case 'searchsong':
        searchMode = 'local';
        openSearch();
        updateSearchUI();
        break;
      case 'neteaserec':
        view.tab = 'chart';
        renderTabs();
        loadChart(false);
        break;
      case 'netsearchbar':
        searchMode = 'net';
        openSearch();
        $('#searchbar').classList.remove('hidden');
        updateSearchUI();
        $('#searchInput').focus();
        break;
      case 'osgo':
        runOnlineSearch((document.getElementById('osInput') || {}).value || '');
        break;
      case 'ostoggle': {
        var oi = el.getAttribute('data-v');
        online.chosen[oi] = !online.chosen[oi];
        renderOsResult(online.items);
        break;
      }
      case 'osall': {
        var anyOff = Object.keys(online.chosen).filter(function (k) { return online.chosen[k]; }).length < online.items.length;
        online.chosen = {};
        if (anyOff) online.items.forEach(function (_, i) { online.chosen[i] = true; });
        renderOsResult(online.items);
        break;
      }
      case 'oslist': {
        online.list = el.getAttribute('data-v');
        document.querySelectorAll('#osList .pick').forEach(function (p) {
          p.classList.toggle('on', p.getAttribute('data-v') === online.list);
        });
        break;
      }
      case 'osadd': {
        var picked = Object.keys(online.chosen).filter(function (k) { return online.chosen[k]; })
          .map(function (k) { return online.items[Number(k)]; }).filter(Boolean);
        if (!picked.length) { toast('先选中要添加的歌'); break; }
        var r2 = S.addSongs(picked, { useBank: true, listName: online.list, mode: 'skip' });
        toast('添加 ' + r2.added + ' 首' + (r2.skipped ? '，跳过重复 ' + r2.skipped + ' 首' : ''));
        closeSheet(); render();
        break;
      }
      case 'demo': demoImport(); break;
      case 'closesheet': closeSheet(); break;
      case 'setdiff': {
        var dv = el.getAttribute('data-v');
        state.settings.diffFilter = (dv === 'none') ? 'none' : Number(dv || 0);
        S.save(); openFilter(); render();
        break;
      }
      case 'setlist':
        state.settings.listFilter = el.getAttribute('data-v');
        S.save(); openFilter(); render();
        break;
      case 'star': {
        if (!curEdit) break;
        var sv = find(curEdit); if (!sv) break;
        var v = parseInt(el.getAttribute('data-v'), 10);
        sv.diff = v; sv.diffSrc = v ? 'manual' : '';
        S.save(); openDetail(curEdit); render();
        break;
      }
      case 'setstate': {
        if (!curEdit) break;
        var ss = find(curEdit); if (!ss) break;
        ss.st = el.getAttribute('data-v');
        S.save(); openDetail(curEdit); render();
        break;
      }
      case 'toggletag': {
        if (!curEdit) break;
        var st2 = find(curEdit); if (!st2) break;
        var t = el.getAttribute('data-v');
        var i = st2.tags.indexOf(t);
        if (i >= 0) st2.tags.splice(i, 1); else st2.tags.push(t);
        S.save(); openDetail(curEdit); render();
        break;
      }
      case 'savedetail': {
        var sd = find(id); if (!sd) break;
        var tEl = document.getElementById('edTitle'), aEl = document.getElementById('edArtist');
        if (tEl) sd.title = S.norm(tEl.value) || sd.title;
        if (aEl) sd.artist = S.norm(aEl.value);
        S.save(); closeSheet(); render(); toast('已保存');
        break;
      }
      case 'practice': {
        var pr = find(id); if (!pr) break;
        pr.plays = (pr.plays || 0) + 1;
        pr.last = Date.now();
        S.save(); closeSheet(); render(); toast('已记录：' + pr.title + ' 练习 ' + pr.plays + ' 次');
        break;
      }
      case 'del': {
        var dl = find(id); if (!dl) break;
        askConfirm({ title: '删除歌曲', text: '《' + dl.title + '》' + (dl.artist ? ' - ' + dl.artist : '') + '\n删除后无法恢复。', ok: '删除', danger: true }).then(function (ok) {
          if (!ok) return;
          state.trash = state.trash || [];
          state.trash.unshift({ song: dl, at: Date.now() });
          if (state.trash.length > 30) state.trash.pop();
          state.songs = state.songs.filter(function (x) { return x.id !== dl.id; });
          S.invalidateExists();
          S.save(); closeSheet(); render(); toast('已删除');
        });
        break;
      }
      case 'theme':
        state.settings.theme = el.getAttribute('data-v');
        S.save(); applyTheme(); openSettings();
        break;
      case 'addlist': {
        askPrompt({ title: '新建歌单', placeholder: '例如：粤语 / 高音 / 比赛曲' }).then(function (name) {
          if (!name) return;
          name = S.norm(name);
          if (name && state.lists.indexOf(name) < 0) state.lists.push(name);
          S.save(); openSettings();
        });
        break;
      }
      case 'dellist': {
        var ln = el.getAttribute('data-v');
        askConfirm({ title: '删除歌单', text: '「' + ln + '」会被移除，里面的歌曲不会被删除。', ok: '删除', danger: true }).then(function (ok) {
          if (!ok) return;
          state.lists = state.lists.filter(function (x) { return x !== ln; });
          state.songs.forEach(function (s) { s.tags = s.tags.filter(function (x) { return x !== ln; }); });
          if (state.settings.listFilter === ln) state.settings.listFilter = '';
          S.save(); openSettings(); render();
        });
        break;
      }
      case 'fillartists': closeSheet(); runFill(); break;
      case 'bgopen': openBgSheet(); break;
      case 'cardopen': openCardSheet(); break;
      case 'cardimg': openCardImgSheet(); break;
      case 'opencur': openCurSheet(); break;
      case 'openstarts': openStartSheet(); break;
      case 'startback': openCardSheet(); break;
      case 'startdel': {
        var sd2 = cardCfg();
        if (!cardDraft) begCardDraft();
        var i9 = Number(el.getAttribute('data-v'));
        var dead9 = sd2.coverStarts[i9];
        if (dead9 && dead9.img && dead9.img.idb) S.imgDel(dead9.img.idb);
        sd2.coverStarts.splice(i9, 1);
        commitCardDraft(); S.save(); render(); openStartSheet();
        toast('已删除该起点');
        break;
      }
      case 'openrot': openRotSheet(); break;
      case 'opencov': openCovSheet(); break;
      case 'rotback': openCardImgSheet(); break;
      case 'rottier': {
        var rt = cardCfg();
        rt.rotateUseCustom = false;
        rt.rotateEvery = Number(el.getAttribute('data-v')) || 1;
        render(); openRotSheet();
        break;
      }
      case 'rotcustom': {
        var rc = cardCfg();
        rc.rotateUseCustom = !rc.rotateUseCustom;
        if (rc.rotateUseCustom) rc.rotateEvery = rc.rotateCustom || 5;
        render(); openRotSheet();
        break;
      }
      case 'covback': openCardImgSheet(); break;
      case 'covpick': {
        var cp = cardCfg();
        var idx = Number(el.getAttribute('data-v'));
        var fi2 = document.getElementById('cardCoverInput');
        fi2.onchange = function () {
          var f = fi2.files[0]; fi2.value = '';
          if (!f) return;
          compressCard(f, function (d) {
            if (!d) return;
            var im = { dataUrl: d, anchor: 'auto' };
            if (!cardDraft) begCardDraft();
            cardCfg().coverStarts[idx].img = im;
            persistImage(im);
            commitCardDraft(); S.save(); render(); openCovSheet();
            toast('已为该起点设置图片');
          });
        };
        fi2.click();
        break;
      }
      case 'covnew': {
        if (!cardDraft) begCardDraft();
        var cn0 = cardCfg();
        var sid0 = cn0.editId;
        if (!sid0) { toast('先在列表里长按一首歌，再回来新建'); break; }
        cn0.coverStarts = cn0.coverStarts || [];
        var dup0 = cn0.coverStarts.filter(function (x) { return x.songId === sid0; }).length;
        if (dup0) { toast('这首歌已经是起点了'); break; }
        cn0.coverStarts.push({ songId: sid0, count: 1, img: null });
        commitCardDraft(); S.save(); render(); openCovSheet();
        toast('已新建起点，共 ' + cn0.coverStarts.length + ' 个');
        break;
      }
      case 'covdel2': {
        if (!cardDraft) begCardDraft();
        var cd3 = cardCfg();
        var di3 = Number(el.getAttribute('data-v'));
        var dead = cd3.coverStarts[di3];
        if (dead && dead.img && dead.img.idb) S.imgDel(dead.img.idb);
        cd3.coverStarts.splice(di3, 1);
        commitCardDraft();
        S.save(); render(); openCovSheet();
        toast('已删除该起点');
        break;
      }
      case 'curpick': openCurPick(); break;
      case 'curback': openCardImgSheet(); break;
      case 'curblank': {
        var cbk = cardCfg();
        var id0 = cbk.editId;
        if (!id0) { toast('先在列表里长按一首歌'); break; }
        var im9 = state.cardImgs[id0];
        if (im9 && im9.idb) S.imgDel(im9.idb);
        delete state.cardImgs[id0];
        state.cardBlank = state.cardBlank || {};
        state.cardBlank[id0] = true;
        commitCardDraft(); S.save(); render(); openCurSheet();
        toast('当前卡面已恢复空白');
        break;
      }
      case 'curclear': {
        var ccl = cardCfg();
        var im0 = state.cardImgs[ccl.editId];
        if (im0 && im0.idb) S.imgDel(im0.idb);
        delete state.cardImgs[ccl.editId];
        commitCardDraft();
        S.save(); render(); openCurSheet();
        toast('已清除这张卡面的图');
        break;
      }
      case 'cardblank': {
        var cbl = cardCfg();
        var idb2 = cbl.editId;
        if (!idb2) { toast('先在列表里长按一首歌'); break; }
        var im8 = state.cardImgs[idb2];
        if (im8 && im8.idb) S.imgDel(im8.idb);
        delete state.cardImgs[idb2];
        state.cardBlank = state.cardBlank || {};
        state.cardBlank[idb2] = true;
        commitCardDraft();
        S.save(); render(); closeSheet();
        toast('当前卡面已恢复空白');
        break;
      }
      case 'cardfold': {
        state.settings.cardAccFold = !(state.settings.cardAccFold !== false);
        S.save(); openCardSheet();
        break;
      }
      case 'cardaccent': cardCfg().accentBar = !cardCfg().accentBar; applyBackground(); render(); openCardSheet(); break;
      case 'cardpreview': openCardPreview(null); break;
      case 'pvclose': pvBack(); break;
      case 'pvSave': savePendingShot(); break;
      case 'cardsave': savePendingShot(); break;
      case 'pvclose': closeFullPreview(); break;
      case 'cardshot': openShotPicker(); break;
      case 'shotanchor': shotAnchor(el.getAttribute('data-v')); break;
      case 'shotok': {
        shotToDataUrl(function (d) {
          if (!d) { toast('截图失败'); return; }
          openCardPreview({ dataUrl: d, anchor: cardCfg().anchor });
        });
        break;
      }
      case 'rotadd': {
        var mi2 = document.getElementById('cardMultiInput');
        mi2.setAttribute('multiple', 'multiple');
        mi2.onchange = function () { setGlobalCardImgs(mi2.files); mi2.value = ''; };
        mi2.click();
        break;
      }
      case 'covadd':
      case 'covmulti': {
        var ci9 = document.getElementById('cardCoverInput');
        ci9.setAttribute('multiple', 'multiple');
        ci9.onchange = function () {
          var fl9 = Array.prototype.slice.call(ci9.files || []);
          ci9.value = '';
          if (!fl9.length) return;
          var c9 = cardCfg();
          var got9 = 0, res9 = [];
          fl9.forEach(function (f) {
            compressCard(f, function (d) {
              if (d) res9.push({ id: S.uid(), dataUrl: d, anchor: 'auto' });
              if (++got9 === fl9.length) {
                c9.coverImages = (c9.coverImages || []).concat(res9);
                c9.coverIndex = 0;
                c9.mode = 'cover'; c9.coverOn = true; c9.curOn = false; c9.rotateOn = false;
                res9.forEach(function (im) { persistImage(im); });
                commitCardDraft();
                S.save(); render(); openCovSheet();
                toast('已添加 ' + res9.length + ' 张覆盖图');
              }
            });
          });
        };
        ci9.click();
        break;
      }
      case 'cardmulti': {
        var mi = document.getElementById('cardMultiInput');
        mi.setAttribute('multiple', 'multiple');
        mi.setAttribute('accept', 'image/*');
        mi.onchange = function () { setGlobalCardImgs(mi.files); mi.value = ''; };
        mi.click();
        break;
      }
      case 'cardgdel': {
        var cgd = cardCfg();
        var gdel = cgd.gImages[Number(el.getAttribute('data-v'))];
        if (gdel && gdel.idb) S.imgDel(gdel.idb);
        cgd.gImages.splice(Number(el.getAttribute('data-v')), 1);
        if (cgd.gIndex >= cgd.gImages.length) cgd.gIndex = 0;
        if (!cgd.gImages.length) cgd.rotate = false;
        render(); openCardImgSheet();
        break;
      }

      case 'cardtarget': {
        var ctg = cardCfg();
        ctg.target = el.getAttribute('data-v');
        openCardImgSheet();
        break;
      }
      case 'cardanchor': cardCfg().anchor = el.getAttribute('data-v'); openCardImgSheet(); break;
      case 'cardfade': cardCfg().fadeRight = !cardCfg().fadeRight; render(); openCardImgSheet(); break;
      case 'cardveil': {
        var cc3 = cardCfg();
        cc3.showImgVeil = (cc3.showImgVeil === false);
        render(); openCardImgSheet();
        break;
      }
      case 'cardimgclear': {
        askConfirm({ title: '清除全部单曲图', text: '会删掉 ' + Object.keys(state.cardImgs || {}).length + ' 首歌曲的单独卡片图（之前误存进全部歌曲的那些也在内），歌曲本身不受影响。', ok: '清除', danger: true }).then(function (ok) {
          if (!ok) return;
          Object.keys(state.cardImgs).forEach(function (k) {
            var im0 = state.cardImgs[k];
            if (im0 && im0.idb) S.imgDel(im0.idb);
          });
          state.cardImgs = {};
          var cb2 = cardCfg();
          cb2.gImages = []; cb2.coverImages = []; cb2.startIds = [];
          cb2.mode = 'cur'; cb2.curOn = true; cb2.rotateOn = false; cb2.coverOn = false;
          commitCardDraft();
          S.save(); render(); closeSheet();
          toast('已清空，卡片恢复空白');
        });
        break;
      }
      case 'bgadd': {
        var bi = document.getElementById('imageInput');
        bi.onchange = function () { if (bi.files[0]) addBgImage(bi.files[0]); bi.value = ''; };
        bi.click();
        break;
      }
      case 'bgpick': {
        bgCfg().current = Number(el.getAttribute('data-v')) || 0;
        bgScrollIdx = 0;
        S.save(); applyBackground(); openBgSheet();
        break;
      }
      case 'bgdel': {
        var di = Number(el.getAttribute('data-v'));
        var bgd = bgCfg();
        bgd.images.splice(di, 1);
        if (bgd.current >= bgd.images.length) bgd.current = Math.max(0, bgd.images.length - 1);
        if (!bgd.images.length) bgd.enabled = false;
        S.save(); applyBackground(); openBgSheet();
        break;
      }
      case 'bgtoggle': {
        var key = el.getAttribute('data-v');
        var bgt = bgCfg();
        bgt[key] = !bgt[key];
        S.save(); applyBackground(); openBgSheet();
        break;
      }
      case 'bgfilter': {
        bgCfg().filter = el.getAttribute('data-v');
        S.save(); applyBackground(); openBgSheet();
        break;
      }
      case 'bgfit': {
        bgCfg().fit = el.getAttribute('data-v');
        S.save(); applyBackground(); openBgSheet();
        break;
      }
      case 'bgcrop': openCropSheet(); break;
      case 'cropreset': {
        var bgr = bgCfg();
        bgr.posX = 50; bgr.posY = 50; bgr.zoom = 1;
        S.save(); applyBackground(); openCropSheet();
        break;
      }
      case 'cardstyle': {
        cardCfg().style = el.getAttribute('data-v');
        render(); openCardSheet();
        break;
      }
      case 'cardtoggle': {
        var ck = el.getAttribute('data-v');
        var cc = cardCfg();
        cc[ck] = !cc[ck];
        render(); openCardSheet();
        break;
      }
      case 'cardrotate': {
        var ck3 = cardCfg();
        ck3.rotate = el.getAttribute('data-v') === '1';
        render(); openCardImgSheet();
        toast(ck3.rotate ? '轮换模式：按上传顺序换图' : '不轮换：用覆盖图切片铺卡片');
        break;
      }
      case 'cardtierapply': {
        var box = el.querySelector('.tier-box');
        var tn = box ? (parseInt(box.value, 10) || 1) : (Number(el.getAttribute('data-v')) || 1);
        var idx = box ? parseInt(box.getAttribute('data-tier'), 10) : -1;
        var ct3 = cardCfg();
        var fld = el.getAttribute('data-field') || ((ct3.mode === 'cover') ? 'coverEvery' : 'rotateEvery');
        if (idx >= 0 && ct3.tiers) ct3.tiers[idx] = tn;
        ct3[fld] = tn;
        render();
        Array.prototype.forEach.call(document.querySelectorAll('.tier'), function (t) {
          var b = t.querySelector('.tier-box');
          t.classList.toggle('on', b && (parseInt(b.value, 10) || 0) === tn);
        });
        var nb2 = document.getElementById('everyNum');
        if (nb2) nb2.value = String(tn);
        break;
      }
      case 'cardcoveradd': {
        var ci2 = document.getElementById('cardCoverInput');
        ci2.setAttribute('multiple', 'multiple');
        ci2.setAttribute('accept', 'image/*');
        ci2.onchange = function () {
          var fs2 = Array.prototype.slice.call(ci2.files || []);
          ci2.value = '';
          if (!fs2.length) return;
          var cc4 = cardCfg();
          var got = 0, res = [];
          fs2.forEach(function (f) {
            compressCard(f, function (d) {
              if (d) res.push({ id: S.uid(), dataUrl: d, anchor: cc4.anchor });
              if (++got === fs2.length) {
                cc4.coverImages = (cc4.coverImages || []).concat(res);
                cc4.coverIndex = 0;
                cc4.mode = 'cover'; cc4.coverOn = true; cc4.curOn = false; cc4.rotateOn = false;
                if (!cc4.rotate) { /* 使用覆盖图 */ }
                render(); openCardImgSheet();
                toast('已添加 ' + res.length + ' 张覆盖图');
              }
            });
          });
        };
        ci2.click();
        break;
      }
      case 'cardmulticover': {
        var mc = document.getElementById('cardCoverInput');
        mc.setAttribute('multiple', 'multiple');
        mc.onchange = function () {
          var fl = Array.prototype.slice.call(mc.files || []);
          mc.value = '';
          if (!fl.length) return;
          var ccf = cardCfg();
          var got2 = 0, res2 = [];
          fl.forEach(function (f) {
            compressCard(f, function (d) {
              if (d) res2.push({ id: S.uid(), dataUrl: d, anchor: ccf.anchor });
              if (++got2 === fl.length) {
                ccf.coverImages = (ccf.coverImages || []).concat(res2);
                ccf.coverIndex = 0;
                ccf.mode = 'cover'; ccf.coverOn = true; ccf.curOn = false; ccf.rotateOn = false;
                render(); openCardImgSheet();
                toast('已添加 ' + res2.length + ' 张覆盖图');
              }
            });
          });
        };
        mc.click();
        break;
      }
      case 'cardmenuopen': openCardSheet(); break;
      case 'cardmenustart': {
        if (!cardDraft) begCardDraft();
        var cm = cardCfg();
        var startId = el.getAttribute('data-id') || cm.editId || '';
        if (!startId) { toast('取不到歌曲，请长按那首歌再试'); break; }
        cm.editId = startId;
        cm.coverStarts = cm.coverStarts || [];
        var exists0 = cm.coverStarts.filter(function (x) { return x.songId === startId; }).length;
        if (!exists0) cm.coverStarts.push({ songId: startId, count: 1, img: null });
        cm.mode = 'cover'; cm.coverOn = true; cm.curOn = false; cm.rotateOn = false;
        commitCardDraft();
        S.save(); render();
        toast(exists0 ? '这首歌已经是起点' : '已新建起点，去覆盖图页设置图片和张数');
        openCardSheet();
        break;
      }
      case 'cardmenuclear': {
        var cmc = cardCfg();
        var im0 = state.cardImgs[cmc.editId];
        if (im0 && im0.idb) S.imgDel(im0.idb);
        delete state.cardImgs[cmc.editId];
        commitCardDraft();
        S.save(); render(); closeSheet();
        toast('已清除这张卡面的图');
        break;
      }
      case 'cardmode': {
        var cm2 = cardCfg();
        var mv = el.getAttribute('data-v');
        cm2.mode = mv;
        // 三选一：开一个，其余自动关闭
        if (mv === 'cur') { cm2.curOn = true; cm2.rotateOn = false; cm2.coverOn = false; }
        else if (mv === 'rotate') { cm2.rotateOn = true; cm2.curOn = false; cm2.coverOn = false; }
        else { cm2.coverOn = true; cm2.curOn = false; cm2.rotateOn = false; }
        render(); openCardImgSheet();
        toast('已切换到' + (mv === 'cur' ? '当前卡面' : mv === 'rotate' ? '轮换图' : '覆盖图') + '，其它模式已自动关闭');
        break;
      }
      case 'cardonoff': {
        var co = cardCfg();
        var key2 = el.getAttribute('data-v');
        co[key2] = !(co[key2] !== false);
        render(); openCardImgSheet();
        break;
      }
      case 'cardstartdel': {
        var csd = cardCfg();
        csd.startIds.splice(Number(el.getAttribute('data-v')), 1);
        render();
        if (curSheetName === 'starts') openStartSheet(); else openCovSheet();
        break;
      }
      case 'cardcovpick': {
        cardCfg().coverIndex = Number(el.getAttribute('data-v')) || 0;
        render(); openCardImgSheet();
        break;
      }
      case 'cardcovdel': {
        var cd2 = cardCfg();
        var cdel = cd2.coverImages[Number(el.getAttribute('data-v'))];
        if (cdel && cdel.idb) S.imgDel(cdel.idb);
        cd2.coverImages.splice(Number(el.getAttribute('data-v')), 1);
        if (cd2.coverIndex >= cd2.coverImages.length) cd2.coverIndex = 0;
        render(); openCardImgSheet();
        break;
      }
      case 'cardsavecfg': {
        commitCardDraft();
        S.save();
        closeFullPreview();
        closeSheet();
        render();
        toast('配置已保存');
        break;
      }
      case 'pvback': pvBack(); break;
      case 'cardreset': {
        askConfirm({ title: '恢复默认卡面', text: '会清空所有轮换图、覆盖图、起点，并把外观还原。确定？', ok: '恢复', danger: true }).then(function (ok) {
        if (!ok) return;
        var editId0 = cardCfg().editId;
        var fresh = JSON.parse(JSON.stringify(S.DEFAULT_SETTINGS.card));
        fresh.editId = editId0;
        state.settings.card = fresh;
        cardDraft = null;
        S.save(); applyBackground(); render(); closeSheet();
        toast('已恢复默认卡面（图片和起点已清空）');
        });
        break;
      }
      case 'fixtitles': {
        var fr = S.fixTitles();
        closeSheet();
        render();
        toast('已整理：修正 ' + fr.fixed + ' 首' + (fr.merged ? '，合并重复 ' + fr.merged + ' 首' : ''));
        break;
      }
      case 'restoretrash': openTrashSheet(); break;
      case 'trashtake': {
        var ti9 = Number(el.getAttribute('data-v'));
        var tr9 = state.trash || [];
        if (!tr9[ti9]) break;
        var item9 = tr9[ti9];
        state.songs.push(item9.song);
        tr9.splice(ti9, 1);
        S.invalidateExists(); S.save(); render(); openTrashSheet();
        toast('已恢复《' + item9.song.title + '》');
        break;
      }
      case 'trashdrop': {
        state.trash.splice(Number(el.getAttribute('data-v')), 1);
        S.save(); openTrashSheet();
        break;
      }
      case 'trashclear': {
        askConfirm({ title: '清空回收站', text: '所有已删除歌曲将永久移除，无法恢复。', ok: '清空', danger: true }).then(function (ok) {
          if (!ok) return;
          state.trash = []; S.save(); openTrashSheet();
        });
        break;
      }
      case 'backup': {
        var data = JSON.stringify(state, null, 1);
        S.Bridge.saveText('茶白歌单备份-' + new Date().toISOString().slice(0, 10) + '.json', data);
        break;
      }
      case 'restore': {
        var fi = document.getElementById('fileInput');
        fi.onchange = function () {
          var f = fi.files[0]; if (!f) return;
          var fr = new FileReader();
          fr.onload = function () {
            try {
              var o = JSON.parse(fr.result);
              if (!o || !Array.isArray(o.songs)) throw new Error('格式不对');
              state.songs = o.songs; state.lists = o.lists || []; state.order = o.order || [];
              state.settings = Object.assign({}, S.DEFAULT_SETTINGS, o.settings || {});
              S.save(); applyTheme(); closeSheet(); render(); toast('已恢复 ' + state.songs.length + ' 首');
            } catch (e) { toast('导入失败：' + e.message); }
          };
          fr.readAsText(f);
          fi.value = '';
        };
        fi.click();
        break;
      }
      case 'clearall': {
        askConfirm({ title: '清空全部歌曲', text: '共 ' + state.songs.length + ' 首，清空后无法恢复，建议先导出备份。', ok: '清空', danger: true }).then(function (ok) {
          if (!ok) return;
          state.songs = []; state.order = []; state.recent = [];
          S.invalidateExists();
          localStorage.removeItem('songranker.v2');
          S.save(); closeSheet(); render(); toast('已清空');
        });
        break;
      }
      case 'pickimg': {
        var ii = document.getElementById('imageInput');
        ii.onchange = function () { startOcr(ii.files[0]); ii.value = ''; };
        ii.click();
        break;
      }
      case 'pickfile': {
        var ff = document.getElementById('fileInput');
        ff.onchange = function () {
          var f = ff.files[0]; if (!f) return;
          var hint2 = document.getElementById('ocrHint');
          if (hint2) hint2.textContent = '正在读取 ' + f.name + ' …';
          S.readAnyFile(f).then(function (text) {
            var ta = document.getElementById('impText');
            if (ta) ta.value = (ta.value ? ta.value + '\n' : '') + text;
            if (hint2) hint2.textContent = '已读取 ' + f.name + '（' + text.split('\n').length + ' 行），点「解析预览」';
            doParse();
          }).catch(function (e) {
            if (hint2) hint2.textContent = '读取失败：' + (e && e.message ? e.message : e);
            toast('读取失败：' + (e && e.message ? e.message : '格式不支持'));
          });
          ff.value = '';
        };
        ff.click();
        break;
      }
      case 'toggleautofill':
        curImport.autofill = !curImport.autofill;
        el.classList.toggle('on', curImport.autofill);
        break;
      case 'toggleautobank':
        curImport.autobank = !curImport.autobank;
        el.classList.toggle('on', curImport.autobank);
        break;
      case 'implist': {
        curImport.list = el.getAttribute('data-v');
        document.querySelectorAll('#impList .pick').forEach(function (p) {
          p.classList.toggle('on', p.getAttribute('data-v') === curImport.list);
        });
        break;
      }
      case 'parse': doParse(); break;
      case 'doimport': doImport(); break;
      case 'exstyle': exportStyle = el.getAttribute('data-v'); openExport(); break;
      case 'sharetext': S.Bridge.share(S.toText(exportTitle(), exportRows())); break;
      case 'copytext': S.Bridge.copy(S.toText(exportTitle(), exportRows())); break;
      case 'savetext':
        S.Bridge.saveText(exportTitle().replace(/[ ·]/g, '_') + '.txt', S.toText(exportTitle(), exportRows()));
        break;
      case 'shareimg':
        S.Bridge.shareImage('歌单-' + Date.now() + '.png', makeImage(exportRows()));
        break;
      case 'saveimg':
        S.Bridge.saveImage('歌单-' + Date.now() + '.png', makeImage(exportRows()));
        break;
    }
  }

  function find(id) {
    return state.songs.filter(function (s) { return s.id === id; })[0];
  }

  function doParse() {
    var ta = document.getElementById('impText');
    var items = S.parseText(ta ? ta.value : '');
    curImport.items = items;
    var box = document.getElementById('impPreview');
    if (!items.length) {
      box.innerHTML = '<div class="hint">没有解析到歌曲，检查一下每行格式，例如：<br>小酒窝 - 林俊杰</div>';
      return;
    }
    var withArtist = items.filter(function (i) { return i.artist; }).length;
    box.innerHTML = '<div class="hint" style="margin-bottom:8px">解析到 <b>' + items.length + '</b> 首，其中 ' + withArtist + ' 首带歌手</div>' +
      '<div class="preview-list">' + items.slice(0, 200).map(function (i) {
        return '<div class="preview-item"><span class="t">' + esc(i.title) + '</span><span class="a">' + esc(i.artist || '—') + '</span></div>';
      }).join('') + '</div>';
  }

  function doImport() {
    if (!curImport.items.length) doParse();
    if (!curImport.items.length) { toast('先解析出歌曲再导入'); return; }
    var r = S.addSongs(curImport.items, { useBank: curImport.autobank, listName: curImport.list, mode: 'skip' });
    toast('新增 ' + r.added + ' 首' + (r.skipped ? '，重复合并 ' + r.skipped + ' 首' : ''));
    closeSheet(); render();
    if (curImport.autofill) runFill();
  }

  async function runFill() {
    var missing = state.songs.filter(function (s) { return !S.norm(s.artist); });
    if (!missing.length) return;
    toast('正在补全歌手：' + missing.length + ' 首…');
    try {
      var res = await S.fillArtists(function (p) {
        if (p.phase === 'net' && p.done % 3 === 0) toast('补全歌手 ' + p.done + '/' + p.total);
      });
      render();
      toast('歌手补全：本地库 ' + res.local + ' 首，联网 ' + res.net + ' 首' + (res.left ? '，还有 ' + res.left + ' 首没查到' : ''));
    } catch (e) {
      render();
      toast('补全中断：' + (e && e.message ? e.message : '网络问题'));
    }
  }

  async function startOcr(file) {
    if (!file) return;
    var bar = document.getElementById('ocrBar');
    var hint = document.getElementById('ocrHint');
    bar.classList.remove('hidden');
    hint.textContent = '正在识别…（第一次会慢一些）';
    try {
      var text = await S.runOcr(file, function (m) {
        if (m && m.status) {
          var p = Math.round((m.progress || 0) * 100);
          var i = bar.querySelector('i'); if (i) i.style.width = p + '%';
          hint.textContent = m.status + ' ' + p + '%';
        }
      });
      bar.classList.add('hidden');
      var cleaned = (text || '').replace(/\n{2,}/g, '\n');
      var ta = document.getElementById('impText');
      if (ta) ta.value = cleaned;
      var items = S.parseText(cleaned);
      curImport.items = items;
      hint.textContent = '识别完成，解析到 ' + items.length + ' 首，可在上面编辑后再导入';
      doParse();
    } catch (e) {
      bar.classList.add('hidden');
      hint.textContent = '识别失败：' + (e && e.message ? e.message : e);
    }
  }



  /* ---------------- 快速添加 ---------------- */
  function openQuickAdd() {
    var html = sheetTitle('添加歌曲') +
      '<div class="btn-row">' +
      '<button class="btn acc" data-act="import">' + icon('plus') + '导入歌曲</button>' +
      '<button class="btn" data-act="netsearchbar">' + icon('world-search') + '联网搜歌</button>' +
      '</div>' +
      '<div class="btn-row" style="margin-top:10px">' +
      '<button class="btn" data-act="neteaserec">' + icon('flame') + '网易云榜单</button>' +
      '<button class="btn" data-act="demo">载入示例</button>' +
      '</div>';
    sheet(html, 'quick');
  }

  /* ---------------- 自动备份 ---------------- */
  function autoBackupTick() {
    var st = state.settings;
    if (!st.autoBackup) return;
    var week = 7 * 24 * 3600 * 1000;
    if (Date.now() - (st.lastBackup || 0) < week) return;
    if (!state.songs.length) return;
    setTimeout(function () {
      try {
        var d = new Date();
        var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
        var name = '茶白歌单-自动备份-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.json';
        var light = JSON.parse(JSON.stringify({
          songs: state.songs, lists: state.lists, order: state.order,
          seqCounter: state.seqCounter, settings: { theme: st.theme, fs: st.fs, tab: st.tab }
        }));
        S.Bridge.saveText(name, JSON.stringify(light, null, 1));
        st.lastBackup = Date.now();
        S.save();
      } catch (e) { }
    }, 2500);
  }

  /* ---------------- 主题化弹窗 ---------------- */
  function openModal(html) {
    var h = $('#modalHost');
    $('#modalCard').innerHTML = html;
    h.classList.remove('hidden');
  }
  function closeModal() {
    $('#modalHost').classList.add('hidden');
    $('#modalCard').innerHTML = '';
  }
  function askConfirm(o) {
    o = o || {};
    return new Promise(function (resolve) {
      openModal('<div class="m-title">' + esc(o.title || '确认') + '</div>' +
        (o.text ? '<div class="m-text">' + esc(o.text) + '</div>' : '') +
        '<div class="m-btns">' +
        '<button class="btn" data-m="0">' + esc(o.cancel || '取消') + '</button>' +
        '<button class="btn ' + (o.danger ? 'danger' : 'acc') + '" data-m="1">' + esc(o.ok || '确定') + '</button>' +
        '</div>');
      var done = false;
      function finish(v) {
        if (done) return;
        done = true;
        closeModal();
        resolve(v);
      }
      $('#modalCard').onclick = function (e) {
        var b = e.target.closest('[data-m]');
        if (!b) return;
        finish(b.getAttribute('data-m') === '1');
      };
      $('#modalMask').onclick = function () { finish(false); };
    });
  }
  function askPrompt(o) {
    o = o || {};
    return new Promise(function (resolve) {
      openModal('<div class="m-title">' + esc(o.title || '输入') + '</div>' +
        (o.text ? '<div class="m-text">' + esc(o.text) + '</div>' : '') +
        '<input class="m-input" id="mInput" type="text" value="' + esc(o.value || '') + '" placeholder="' + esc(o.placeholder || '') + '">' +
        '<div class="m-btns">' +
        '<button class="btn" data-m="0">取消</button>' +
        '<button class="btn acc" data-m="1">确定</button>' +
        '</div>');
      var done = false;
      function finish(v) {
        if (done) return;
        done = true;
        closeModal();
        resolve(v);
      }
      $('#modalCard').onclick = function (e) {
        var b = e.target.closest('[data-m]');
        if (!b) return;
        var v = b.getAttribute('data-m') === '1' ? ($('#mInput').value || '').trim() : null;
        finish(v);
      };
      $('#modalMask').onclick = function () { finish(null); };
      var inp = $('#mInput');
      if (inp) { inp.focus(); inp.onkeydown = function (e) { if (e.key === 'Enter') finish(inp.value.trim()); }; }
    });
  }

  /* ---------------- 面板拖动 ---------------- */
  function bindSheetDrag() {
    var startY = 0, dy = 0, dragging = false, id = null;

    function onStart(e) {
      var y0 = (e.touches ? e.touches[0].clientY : e.clientY);
      var top = sheetEl.getBoundingClientRect().top;
      var onHeader = (y0 - top) <= 128;                 // 顶部一片区域都算拖动区
      var onGrab = e.target.closest && e.target.closest('.sh-grab, .sh-title');
      if (!onHeader && !onGrab) return;
      if (e.target.closest && e.target.closest('.x, input, button[data-m], .pick, .btn')) return;
      dragging = true; dy = 0;
      startY = (e.touches ? e.touches[0].clientY : e.clientY);
      sheetEl.classList.add('dragging');
      sheetEl.style.transform = '';
    }
    function onMove(e) {
      if (!dragging) return;
      var y = (e.touches ? e.touches[0].clientY : e.clientY);
      dy = y - startY;
      var shift = dy > 0 ? dy : Math.max(dy * 0.6, -60);
      sheetEl.style.transform = 'translateY(' + shift + 'px)';
      if (e.cancelable && Math.abs(dy) > 6) e.preventDefault();
    }
    function onEnd() {
      if (!dragging) return;
      dragging = false;
      sheetEl.classList.remove('dragging');
      sheetEl.style.transform = '';
      if (dy > 130) { closeSheet(); return; }
      if (dy < -80) {
        if (!sheetEl.classList.contains('full')) {
          sheetEl.classList.add('full');
          toast('已展开全屏，向下拖可关闭');
        }
      }
    }

    sheetEl.addEventListener('touchstart', onStart, { passive: true });
    sheetEl.addEventListener('touchmove', onMove, { passive: false });
    sheetEl.addEventListener('touchend', onEnd);
    sheetEl.addEventListener('touchcancel', onEnd);
    // 桌面/预览用鼠标
    sheetEl.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
  }


  /* ---------------- 长按卡片 / 滚动换图 ---------------- */
  var longPressed = false;

  function bindLongPress() {
    var timer = null, moved = false, sy = 0;
    listEl.addEventListener('touchstart', function (e) {
      var row = e.target.closest ? e.target.closest('.row') : null;
      if (!row) return;
      moved = false;
      sy = e.touches[0].clientY;
      clearTimeout(timer);
      timer = setTimeout(function () {
        if (moved) return;
        longPressed = true;
        S.Bridge.vibrate(20);
        var lid = row && row.getAttribute('data-id');
        if (lid) {
          var cS = cardCfg();
          cS.editId = lid;
          openCardMenu(lid);
        } else openCardSheet();
      }, 550);
    }, { passive: true });
    listEl.addEventListener('touchmove', function (e) {
      if (Math.abs(e.touches[0].clientY - sy) > 10) { moved = true; clearTimeout(timer); }
    }, { passive: true });
    listEl.addEventListener('touchend', function () { clearTimeout(timer); }, { passive: true });
    listEl.addEventListener('touchcancel', function () { clearTimeout(timer); });
    // 桌面/预览：右键
    listEl.addEventListener('contextmenu', function (e) {
      var row = e.target.closest ? e.target.closest('.row') : null;
      if (!row) return;
      e.preventDefault();
      var cid = row.getAttribute('data-id');
      if (cid) { cardCfg().editId = cid; openCardMenu(cid); }
      else openCardSheet();
    });
  }

  function openCardMenu(id) {
    var sg = state.songs.filter(function (x) { return x.id === id; })[0];
    if (!sg) { openCardSheet(); return; }
    var hasImg = !!cardImgOf(id);
    var c0 = cardCfg();
    var src = hasImg ? '单曲图片' :
      ((c0.coverImages && c0.coverImages.length) ? '覆盖图' :
        ((c0.gImages && c0.gImages.length) ? '轮换图' : '无'));
    var html = sheetTitle('《' + sg.title + '》') +
      '<div class="hint" style="margin-bottom:12px">' + esc(sg.artist || '未知歌手') +
      ' · 图片来源：' + src + '</div>' +
      '<div class="btn-row" style="flex-direction:column">' +
      '<button class="btn acc" data-act="cardmenuopen">' + icon('photo') + '卡片图片设置</button>' +
      '<button class="btn" data-act="cardmenustart" data-id="' + id + '">' + icon('pencil') + '设为覆盖起点</button>' +
      (hasImg ? '<button class="btn danger" data-act="cardmenuclear">' + icon('trash') + '清除这张卡面的图</button>' : '') +
      '</div>';
    sheet(html, 'cardmenu');
  }

  function bindScrollSwap() { /* 整体卡片背景改为渲染时按行号计算，无需滚动监听 */ }

  /* ---------------- 返回键 ---------------- */
  window.__dshBack = function () {
    if (!hostEl.classList.contains('hidden')) { closeSheet(); return 'handled'; }
    if (!$('#searchbar').classList.contains('hidden')) { closeSearch(); return 'handled'; }
    if (view.q) { view.q = ''; $('#searchInput').value = ''; render(); return 'handled'; }
    if (view.tab !== 'rank') { view.tab = 'rank'; renderTabs(); render(); return 'handled'; }
    return 'exit';
  };

  var searchMode = 'local';

  function openSearch() {
    $('#searchbar').classList.remove('hidden');
    updateSearchUI();
    setTimeout(function () { $('#searchInput').focus(); }, 60);
  }

  function closeSearch() {
    $('#searchbar').classList.add('hidden');
    view.q = '';
    $('#searchInput').value = '';
    render();
    updateSearchUI();
  }

  function updateSearchUI() {
    var el = $('#searchInput');
    if (!el) return;
    var q = (el.value || '').trim();
    var btn = $('#btnSearchAction');
    if (btn) {
      btn.innerHTML = icon(q ? 'search' : 'x');
      btn.classList.toggle('acc', !!q);
      btn.setAttribute('title', q ? (searchMode === 'net' ? '联网搜歌' : '搜索') : '关闭搜索');
    }
    document.querySelectorAll('#modeSeg button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-v') === searchMode);
    });
  }

  function setSearchMode(m) {
    searchMode = m;
    if (m === 'local') view.q = $('#searchInput').value || '';
    else view.q = '';
    render();
    updateSearchUI();
    if (m === 'net') toast('联网模式：输入后点右侧按钮搜全网');
  }

  function doSearchAction() {
    var q = ($('#searchInput').value || '').trim();
    if (!q) { closeSearch(); return; }
    if (searchMode === 'net') openOnlineSearch(q);
    else { view.q = q; render(); $('#searchInput').blur(); }
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    listEl = $('#list'); chipsEl = $('#chips'); statsEl = $('#statsWrap');
    tabbarEl = $('#tabbar'); hostEl = $('#sheetHost'); sheetEl = $('#sheetBody');
    pageTitle = $('#pageTitle'); pageSub = $('#pageSub');

    S.load();
    view.tab = state.settings.tab || 'rank';
    // 图片迁移到 IndexedDB（腾出 localStorage 配额）
    try {
      S.migrateImages().then(function (n) {
        return ensureImagesLoaded().then(function () { if (n) render(); });
      }).catch(function () { });
    } catch (e) { }
    applyTheme();
    renderTabs();
    render();

    document.addEventListener('click', function (e) {
      if (longPressed) { longPressed = false; return; }
      if (e.target && e.target.classList && e.target.classList.contains('tier-box')) return; // 数字框直接编辑
      var el = e.target.closest('[data-act]');
      if (!el) return;
      var act = el.getAttribute('data-act');
      if (act === 'toggle') return; // 由 change 处理
      e.preventDefault();
      handleAct(act, el);
    });

    document.addEventListener('change', function (e) {
      var t = e.target;
      if (t && t.classList && t.classList.contains('tier-box')) {
        var cc3 = cardCfg();
        var ts3 = cc3.tiers || (cc3.tiers = [1, 5, 10]);
        var ti3 = parseInt(t.getAttribute('data-tier'), 10) || 0;
        var tv3 = parseInt(t.value, 10);
        if (!(tv3 > 0 && tv3 <= 200)) t.value = String(ts3[ti3]);
      }
      if (t && t.type === 'checkbox') {
        var row = t.closest('.row');
        if (!row) return;
        var s = find(row.getAttribute('data-id'));
        if (!s) return;
        s.st = t.checked ? 'done' : 'todo';
        if (t.checked) S.Bridge.vibrate(12);
        S.save(); render();
      }
    });

    document.addEventListener('input', function (e) {
      if (e.target && e.target.id === 'searchInput') {
        if (searchMode === 'local') { view.q = e.target.value; render(); }
        updateSearchUI();
      }
      if (e.target && e.target.classList && e.target.classList.contains('tier-box')) {
        var tv = parseInt(e.target.value, 10);
        if (!(tv > 0 && tv <= 200)) return;
        var ck2 = cardCfg();
        var ts2 = ck2.tiers || (ck2.tiers = [1, 5, 10]);
        var ti2 = parseInt(e.target.getAttribute('data-tier'), 10) || 0;
        ts2[ti2] = tv;
        if (ck2.rotate) ck2.everyN = tv; else ck2.coverN = tv;
        var nb = document.getElementById('everyNum');
        if (nb) nb.value = String(tv);
        var wraps = document.querySelectorAll('.tier');
        for (var wi = 0; wi < wraps.length; wi++) {
          var wn = parseInt((wraps[wi].querySelector('.tier-box') || {}).value, 10);
          wraps[wi].classList.toggle('on', wn === tv);
        }
        S.save(); render();
      }
      if (e.target && e.target.id === 'coverNum') {
        var cv2 = parseInt(e.target.value, 10);
        var cvc = cardCfg();
        cvc.coverEvery = (cv2 && cv2 > 0) ? Math.min(200, cv2) : 1;
        render();
      }
      if (e.target && e.target.getAttribute && e.target.getAttribute('data-covcount') !== null) {
        var ci4 = Number(e.target.getAttribute('data-covcount'));
        var cv4 = parseInt(e.target.value, 10);
        var ccs = cardCfg().coverStarts;
        if (ccs[ci4]) ccs[ci4].count = (cv4 && cv4 > 0) ? Math.min(200, cv4) : 1;
        render();
      }
      if (e.target && e.target.id === 'rotCustom') {
        var rvc = parseInt(e.target.value, 10);
        var rcf = cardCfg();
        rcf.rotateCustom = (rvc && rvc > 0) ? Math.min(200, rvc) : 1;
        if (rcf.rotateUseCustom) rcf.rotateEvery = rcf.rotateCustom;
        render();
      }
      if (e.target && e.target.id === 'rotEvery') {
        var rv2 = parseInt(e.target.value, 10);
        cardCfg().rotateEvery = (rv2 && rv2 > 0) ? Math.min(200, rv2) : 1;
        render();
      }
      if (e.target && e.target.id === 'covEvery') {
        var cv3 = parseInt(e.target.value, 10);
        cardCfg().coverEvery = (cv3 && cv3 > 0) ? Math.min(200, cv3) : 1;
        render();
      }
      if (e.target && e.target.id === 'everyNum') {
        var ev = parseInt(e.target.value, 10);
        var ce = cardCfg();
        var val = (ev && ev > 0) ? Math.min(200, ev) : 1;
        if ((ce.mode || 'cur') === 'cover') ce.coverEvery = val; else ce.rotateEvery = val;
        render();
      }
      if (e.target && e.target.id === 'bgBlur') {
        bgCfg().blur = parseInt(e.target.value, 10);
        var bv = document.getElementById('blurVal'); if (bv) bv.textContent = e.target.value;
        applyBackground(); S.save();
      }
      if (e.target && e.target.id === 'bgDimR') {
        bgCfg().dim = parseInt(e.target.value, 10) / 100;
        var dv2 = document.getElementById('dimVal'); if (dv2) dv2.textContent = e.target.value + '%';
        applyBackground(); S.save();
      }
      if (e.target && e.target.id === 'cropZoom') {
        bgCfg().zoom = parseInt(e.target.value, 10) / 100;
        var zv = document.getElementById('zoomVal'); if (zv) zv.textContent = e.target.value + '%';
        var cb = document.getElementById('cropBox');
        if (cb) cb.style.backgroundSize = e.target.value + '%';
        applyBackground(); S.save();
      }
      if (e.target && e.target.id === 'cardRadius') {
        cardCfg().radius = parseInt(e.target.value, 10);
        var rv = document.getElementById('cardRadiusVal'); if (rv) rv.textContent = e.target.value;
        applyBackground(); render();
      }
      if (e.target && e.target.id === 'cardGap') {
        cardCfg().gap = parseInt(e.target.value, 10);
        var gv = document.getElementById('cardGapVal'); if (gv) gv.textContent = e.target.value;
        applyBackground(); render();
      }
      if (e.target && e.target.id === 'wtTitle') {
        state.settings.weightTitle = parseInt(e.target.value, 10);
        var wt = document.getElementById('wtTitleVal'); if (wt) wt.textContent = e.target.value;
        applyTheme(); render(); S.save();
      }
      if (e.target && e.target.id === 'wtSub') {
        state.settings.weightSub = parseInt(e.target.value, 10);
        var ws2 = document.getElementById('wtSubVal'); if (ws2) ws2.textContent = e.target.value;
        applyTheme(); render(); S.save();
      }
      if (e.target && e.target.id === 'iconOp') {
        state.settings.iconOpacity = parseInt(e.target.value, 10) / 100;
        var io = document.getElementById('iconOpVal'); if (io) io.textContent = e.target.value + '%';
        applyTheme(); render(); S.save();
      }
      if (e.target && e.target.id === 'cardAlpha') {
        cardCfg().cardOpacity = parseInt(e.target.value, 10) / 100;
        var av = document.getElementById('cardAlphaVal'); if (av) av.textContent = e.target.value + '%';
        applyBackground(); render();
      }
      if (e.target && e.target.id === 'cardOpacity') {
        cardCfg().imgOpacity = parseInt(e.target.value, 10) / 100;
        var ov2 = document.getElementById('cardOpacityVal'); if (ov2) ov2.textContent = e.target.value + '%';
        applyBackground(); render();
      }
      if (e.target && e.target.id === 'fsTitleRange') {
        state.settings.fsTitle = parseInt(e.target.value, 10) / 100;
        var vt = document.getElementById('fsTitleVal');
        if (vt) vt.textContent = e.target.value + '%';
        applyTheme(); render(); S.save();
      }
      if (e.target && e.target.id === 'fsSubRange') {
        state.settings.fsSub = parseInt(e.target.value, 10) / 100;
        var vs = document.getElementById('fsSubVal');
        if (vs) vs.textContent = e.target.value + '%';
        applyTheme(); render(); S.save();
      }
      if (e.target && e.target.id === 'fsRange') {
        state.settings.fs = parseInt(e.target.value, 10) / 100;
        var v = document.getElementById('fsVal');
        if (v) v.textContent = e.target.value + '%';
        document.documentElement.style.setProperty('--fs', String(state.settings.fs));
        S.save();
      }
    });

    var fab = document.getElementById('fabAdd');
    if (fab) {
      fab.innerHTML = icon('plus');
      fab.classList.remove('hidden');
      fab.addEventListener('click', function () { openQuickAdd(); });
    }
    $('#btnSearch').innerHTML = icon('search');
    $('#btnSettings').innerHTML = icon('settings');
    $('#btnSearch').addEventListener('click', openSearch);
    $('#btnSearchAction').addEventListener('click', doSearchAction);
    $('#searchInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); doSearchAction(); }
    });
    $('#btnSettings').addEventListener('click', openSettings);

    bindSheetDrag();
    bindLongPress();
    bindScrollSwap();

    try { autoBackupTick(); } catch (e) { }

    document.addEventListener('app-toast', function (e) {
      var t = $('#toast');
      t.textContent = e.detail;
      t.classList.add('show');
      clearTimeout(t.__tm);
      t.__tm = setTimeout(function () { t.classList.remove('show'); }, 1800);
    });

    // 首次使用自动加载示例
    if (!state.songs.length) {
      // 留空：由空状态引导
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
