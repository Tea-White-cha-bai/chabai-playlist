/* core.js —— 数据、拼音、难度库、解析、OCR */
(function () {
  'use strict';

  var LS_KEY = 'songranker.v2';

  var DEFAULT_SETTINGS = {
    theme: 'dark',      // dark | light | auto
    fs: 1,
    fsTitle: 1, fsSub: 1, weightTitle: 600, weightSub: 400, iconOpacity: 0.75,
    autoBackup: true, lastBackup: 0,
    tab: 'home',
    stateFilter: 'all',
    diffFilter: 0,      // 0 = 全部
    listFilter: '',
    noDesc: false,
    bg: {
      enabled: false, images: [], current: 0,
      blur: 8, dim: 0.35, filter: 'none',
      fixed: true, homeOnly: false, frosted: true, accent: false,
      fit: 'cover', posX: 50, posY: 50, zoom: 1,
      everyN: 0, tiers: [1, 5, 10]
    },
    card: {
      style: 'default',
      showArtist: true, showDiff: true, showRank: true, showPlays: false,
      radius: 14, gap: 7, imgOpacity: 0.95, cardOpacity: 1, accentBar: false,
      fadeRight: true, showImgVeil: false, anchor: 'auto', target: 'card', editId: '',
      mode: 'cur',
      curOn: true,
      rotateOn: false, rotateEvery: 1, rotateUseCustom: false, rotateCustom: 5,
      coverOn: false, coverEvery: 1,
      tiers: [1, 5, 10],
      gImages: [], coverImages: [], coverIndex: 0,
      startIds: [],
      coverStarts: []
    }
  };

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function norm(s) {
    return (s || '').toString().replace(/\s+/g, ' ').trim();
  }

  /* ---------------- 拼音 ---------------- */
  var pyCache = {};
  function pyOf(str) {
    var s = (str || '').toString();
    if (!s) return '';
    if (pyCache[s]) return pyCache[s];
    var out;
    try {
      if (window.pinyinPro) {
        out = window.pinyinPro.pinyin(s, { toneType: 'none', type: 'array' });
        out = out.join(' ').toLowerCase();
      } else out = s.toLowerCase();
    } catch (e) { out = s.toLowerCase(); }
    pyCache[s] = out;
    return out;
  }

  function initialOf(str) {
    var s = norm(str);
    if (!s) return '#';
    var c = s.charAt(0);
    if (/[a-zA-Z]/.test(c)) return c.toUpperCase();
    if (/[0-9]/.test(c)) return '#';
    try {
      if (window.pinyinPro) {
        var r = window.pinyinPro.pinyin(c, { pattern: 'first', toneType: 'none', type: 'array' });
        var t = (r && r[0]) ? r[0] : '';
        var m = t.match(/[a-zA-Z]/);
        if (m) return m[0].toUpperCase();
      }
    } catch (e) { }
    return '#';
  }

  /* ---------------- 难度 ---------------- */
  var DIFF_LABEL = { 0: '未评', 1: '简单', 2: '较易', 3: '中等', 4: '较难', 5: '很难' };

  var bankIndex = null;
  function bankKey(title, artist) {
    return norm(title).toLowerCase() + '|' + norm(artist).toLowerCase();
  }
  function buildBankIndex() {
    bankIndex = {};
    var bank = window.SONG_BANK || [];
    for (var i = 0; i < bank.length; i++) {
      var t = norm(bank[i][0]), a = norm(bank[i][1]), d = bank[i][2];
      if (!t) continue;
      bankIndex[bankKey(t, a)] = d;
      var k2 = t.toLowerCase();
      if (!bankIndex['~' + k2]) bankIndex['~' + k2] = d;
      if (a && !bankIndex['~ar:' + k2]) bankIndex['~ar:' + k2] = a;
    }
  }
  function bankLookup(title, artist) {
    if (!bankIndex) buildBankIndex();
    var k = bankKey(title, artist);
    if (bankIndex[k] != null) return bankIndex[k];
    var k2 = '~' + norm(title).toLowerCase();
    if (bankIndex[k2] != null) return bankIndex[k2];
    return 0;
  }

  /* ---------------- 存储 ---------------- */
  function defaultState() {
    return { songs: [], lists: [], recent: [], trash: [], order: [], orderSeed: 0, seqCounter: 0, cardImgs: {}, cardBlank: {}, settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) };
  }

  var state = defaultState();

  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return;
      state.songs = Array.isArray(o.songs) ? o.songs : [];
      state.lists = Array.isArray(o.lists) ? o.lists : [];
      state.recent = Array.isArray(o.recent) ? o.recent : [];
      state.order = Array.isArray(o.order) ? o.order : [];
      state.orderSeed = o.orderSeed || 0;
      state.seqCounter = o.seqCounter || 0;
      state.cardImgs = (o.cardImgs && typeof o.cardImgs === 'object') ? o.cardImgs : {};
      state.cardBlank = (o.cardBlank && typeof o.cardBlank === 'object') ? o.cardBlank : {};
      state.trash = Array.isArray(o.trash) ? o.trash : [];
      state.settings = Object.assign({}, DEFAULT_SETTINGS, o.settings || {});
      state.settings.bg = Object.assign({}, DEFAULT_SETTINGS.bg, state.settings.bg || {});
      state.settings.card = Object.assign({}, DEFAULT_SETTINGS.card, state.settings.card || {});
      if (!Array.isArray(state.settings.bg.images)) state.settings.bg.images = [];
      if (!Array.isArray(state.settings.bg.tiers)) state.settings.bg.tiers = [1, 5, 10];
      if (!Array.isArray(state.settings.card.tiers)) state.settings.card.tiers = [1, 5, 10];
      var c0 = state.settings.card;
      if (c0.rotate !== undefined || c0.coverN !== undefined || c0.coverStartId !== undefined) {
        c0.mode = c0.rotate ? 'rotate' : ((c0.coverImages && c0.coverImages.length) ? 'cover' : 'cur');
        c0.rotateOn = !!c0.rotate;
        c0.rotateEvery = c0.everyN || 1;
        c0.coverEvery = c0.coverN || 1;
        c0.coverOn = !c0.rotate;
        c0.startIds = c0.coverStartId ? [c0.coverStartId] : [];
        delete c0.rotate; delete c0.coverN; delete c0.coverRotate; delete c0.coverStartId;
        delete c0.everyN; delete c0.gEnabled; delete c0.gIndex;
      }
      if (!Array.isArray(state.settings.card.startIds)) state.settings.card.startIds = [];
      if (!Array.isArray(state.settings.card.coverStarts)) state.settings.card.coverStarts = [];
      if (state.settings.card.coverStarts.length === 0 && state.settings.card.startIds.length) {
        state.settings.card.coverStarts = state.settings.card.startIds.map(function (sid) {
          return { songId: sid, count: state.settings.card.coverEvery || 1, img: null };
        });
      }
      if (!state.settings.card.mode) state.settings.card.mode = 'cur';
      if (!Array.isArray(state.settings.card.gImages)) state.settings.card.gImages = [];
      if (!Array.isArray(state.settings.card.coverImages)) state.settings.card.coverImages = [];
      state.songs.forEach(function (s, i) {
        if (!s.id) s.id = uid();
        if (typeof s.seq !== 'number') s.seq = i;
        if (s.seq >= state.seqCounter) state.seqCounter = s.seq + 1;
        if (typeof s.diff !== 'number') s.diff = 0;
        if (!s.st) s.st = (s.done ? 'done' : 'todo');
        if (s.st === 'doing') s.st = 'todo';
        if (!Array.isArray(s.tags)) s.tags = [];
        if (typeof s.plays !== 'number') s.plays = 0;
      });
    } catch (e) { }
  }

  var saveTimer = null;
  var saveWarned = false;
  function save() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(state));
        saveWarned = false;
      } catch (e) {
        if (!saveWarned) {
          saveWarned = true;
          try {
            window.dispatchEvent(new CustomEvent('app-toast', { detail: '存储空间已满，最新的修改没保存上（建议删掉一些卡片图片）' }));
          } catch (err) { }
        }
      }
    }, 120);
  }

  /* ---------------- 歌单解析 ---------------- */
  var SEP_RE = /\s*[|｜\/／]\s*/;

  function cleanTitle(s) {
    return norm(s)
      .replace(/^[\[\]【】《》"'“”‘’]+|[\[\]【】《》"'“”‘’]+$/g, '')
      .replace(/^[·•\-–—\s]+/, '')
      .trim();
  }

  function splitTA(s) {
    s = norm(s);
    if (!s) return { title: '', artist: '' };
    // 歌名（歌手）
    var pm = s.match(/^(.+?)\s*[\(（\[【]([^\(\)\[\]【】]{1,40})[\)）\]】]\s*$/);
    if (pm) return { title: pm[1], artist: pm[2] };
    // 歌名 | 歌手
    if (SEP_RE.test(s)) {
      var parts = s.split(SEP_RE).map(norm).filter(Boolean);
      return { title: parts[0] || '', artist: parts[1] || '' };
    }
    // 歌名 - 歌手
    if (/\s+[-–—]+\s+/.test(s)) {
      var sp = s.split(/\s+[-–—]+\s+/);
      return { title: sp[0] || '', artist: sp.slice(1).join(' ') || '' };
    }
    if (/\S[-–—]\S/.test(s)) {
      var sp2 = s.split(/[-–—]/);
      if (sp2.length === 2 && norm(sp2[0]) && norm(sp2[1])) return { title: sp2[0], artist: sp2[1] };
      return { title: s, artist: '' };
    }
    // 空格分隔：歌名 歌手 / 英文歌名 歌手
    var toks = s.split(/\s+/).filter(Boolean);
    if (toks.length === 2 && !/^[\u4e00-\u9fa5]{1}$/.test(toks[1])) {
      return { title: toks[0], artist: toks[1] };
    }
    if (toks.length >= 3 && toks.length <= 4) {
      return { title: toks.slice(0, toks.length - 1).join(' '), artist: toks[toks.length - 1] };
    }
    return { title: s, artist: '' };
  }

  function parseLine(line) {
    var s = (line || '').replace(/[\u00a0\u3000]/g, ' ').trim();
    if (!s) return null;
    if (/^(歌名|歌曲|序号|曲目)/.test(s) && /歌手|演唱/.test(s)) return null;

    // 去掉行首序号
    var m = s.match(/^[\(\[（【]?\s*(\d{1,4})\s*[\)\]）】]?\s*[\.、,，:：;；\-–—]?\s*(\S.*)$/);
    if (m) {
      var rest = m[2];
      // 防止把 "2002年的第一场雪" 这类吃掉；单字歌名（椿/谁）也要能剥掉序号
      if (rest && !/^[\d年]/.test(rest)) s = rest;
    }
    s = s.replace(/^[\s\-–—\.、]+/, '').trim();
    if (!s) return null;

    var diff = 0;
    // 结尾的 (3) [3] ★★★
    var dm = s.match(/[\(（\[]\s*([1-5])\s*[\)）\]]\s*$/);
    if (dm) { diff = parseInt(dm[1], 10); s = s.slice(0, dm.index).trim(); }
    var starM = s.match(/[★☆]{1,5}\s*$/);
    if (starM) {
      var n = (starM[0].match(/★/g) || []).length;
      if (n >= 1 && n <= 5) { diff = n; s = s.slice(0, starM.index).trim(); }
    }

    var title = '', artist = '';

    if (s.indexOf('\t') >= 0) {
      var f = s.split('\t').map(norm).filter(Boolean);
      var p0 = splitTA(f[0] || '');
      title = p0.title;
      artist = p0.artist;
      if (!artist && f[1] && !/^[1-5]$/.test(f[1])) artist = f[1];
      if (!diff && f[1] && /^[1-5]$/.test(f[1])) diff = parseInt(f[1], 10);
    } else {
      var p1 = splitTA(s);
      title = p1.title;
      artist = p1.artist;
    }

    // 歌手末尾可能跟着难度
    var am = norm(artist).match(/^(.*?)\s+([1-5])$/);
    if (am && !diff) { artist = am[1]; diff = parseInt(am[2], 10); }

    title = cleanTitle(title);
    artist = cleanTitle(artist);

    if (!title) return null;
    if (title.length > 40) title = title.slice(0, 40);
    if (artist && artist.length > 30) artist = artist.slice(0, 30);
    return { title: title, artist: artist, diff: diff };
  }

  function parseText(text) {
    var lines = (text || '').split(/\r?\n/);
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var p = parseLine(lines[i]);
      if (p) out.push(p);
    }
    return out;
  }

  /* ---------------- 增删改 ---------------- */
  // 繁 -> 简（只覆盖歌名里高频字，用于查重时对齐不同平台的写法）
  var T2S_PAIRS = '愛爱夢梦時时間间說说話话聽听誰谁過过這这個个們们來来後后會会對对開开關关見见現现實实學学覺觉讓让認认為为麼么樣样別别從从沒没還还進进遠远邊边頭头裡里點点難难錯错應应該该帶带幫帮場场長长張张無无風风雲云電电陽阳陰阴聲声樂乐語语詞词書书記记憶忆舊旧歡欢淚泪傷伤緣缘親亲戀恋牽牵掛挂溫温輕轻飛飞鳥鸟魚鱼葉叶樹树橋桥車车國国際际華华麗丽燈灯遺遗擁拥藍蓝綠绿紅红黃黄紙纸筆笔寫写讀读戲戏劇剧員员團团體体業业產产務务動动靜静卻却願愿備备決决堅坚強强軟软終终於于與与隻只幾几種种類类結结給给續续斷断滿满憂忧齊齐龍龙鳳凤馬马貓猫蘭兰蓮莲燦灿艷艳驚惊嘆叹倫伦傑杰陳陈鄧邓劉刘楊杨蕭萧羅罗蘇苏孫孙鄭郑趙赵吳吴許许謝谢顏颜韓韩馮冯盧卢鐘钟錢钱蔣蒋賴赖歐欧龐庞閻阎嚴严紋纹細细絲丝織织鄉乡響响罷罢敵敌滾滚醜丑髮发鬥斗鬍胡麵面藥药醫医億亿僅仅優优價价儀仪兒儿內内兩两冊册凍冻劃划勁劲勞劳勢势勵励勸劝匯汇區区協协單单圍围園园圓圆圖图塵尘墳坟壓压壞坏壯壮夠够奪夺奮奋嬰婴寧宁寶宝寬宽導导屆届島岛嶺岭巒峦帥帅師师幣币廣广廠厂廳厅彎弯彈弹彙汇徑径復复徵征憐怜懷怀懸悬戰战戶户拋抛挾挟捨舍掃扫掙挣採采換换揮挥損损搖摇搶抢擔担據据擇择擊击擴扩擺摆擾扰攤摊敗败殺杀氣气沖冲況况淨净涼凉淺浅測测渾浑滅灭滯滞漲涨漸渐潔洁灑洒烏乌煩烦熱热燒烧營营牆墙爺爷爾尔犧牺狹狭獄狱獎奖獨独獲获獻献獸兽環环瑪玛畫画暢畅療疗瘋疯癡痴發发皺皱盤盘眾众睜睁瞞瞒確确礙碍禮礼禍祸禿秃稅税稱称穩稳窮穷竊窃競竞節节範范築筑簡简籃篮糧粮紀纪純纯紛纷級级紮扎綜综線线練练組组綁绑經经維维綱纲網网緊紧緒绪編编縱纵總总繩绳繞绕纖纤罰罚罵骂義义習习聖圣聞闻聯联聰聪職职肅肃脅胁膽胆臉脸臨临舉举艱艰藝艺萬万蓋盖';

  var T2S = (function () {
    var m = {};
    for (var i = 0; i + 1 < T2S_PAIRS.length; i += 2) m[T2S_PAIRS.charAt(i)] = T2S_PAIRS.charAt(i + 1);
    return m;
  })();

  function toSimp(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      out += (T2S[c] || c);
    }
    return out;
  }

  // 歌名归一化：用于查重（去括号内容、feat/remix 等后缀、标点、繁简差异）
  var NOISE_EN = /(feat|ft|featuring|remix|live|demo|inst|instrumental|karaoke|acoustic|cover|version|ver)\b\.?/g;
  var NOISE_CN = /(伴奏|纯音乐|翻自|翻唱|原唱|现场版|现场|女声版|男声版|清唱|和声版|钢琴版|吉他版|弦乐版|剧场版|电影版|主题曲|插曲|片尾曲|抖音版|慢摇|加速版|降调|升调|重制版|新版|原版|dj版|纯享版|完整版|纯享|版)/g;

  function titleKey(t) {
    var s = norm(t).toLowerCase();
    // 括号内容整体丢掉：(Live) （伴奏） [Remix] 《电影主题曲》
    s = s.replace(/[\(（\[【《][^\)）\]】》]*[\)）\]】》]/g, ' ');
    // feat. xxx / ft xxx 之后全丢
    s = s.replace(/\b(feat|ft|featuring)\.?\s*.*$/g, ' ');
    s = s.replace(NOISE_EN, ' ');
    s = toSimp(s.replace(/\s+/g, ''));
    s = s.replace(NOISE_CN, ' ');
    s = s.replace(/[^0-9a-z\u4e00-\u9fa5]+/g, '');
    return s;
  }

  var existsCache = null, existsCacheLen = -1;

  function invalidateExists() {
    existsCache = null;
    existsCacheLen = -1;
  }

  function exists(title, artist) {
    var k = titleKey(title);
    if (!k) return null;
    if (!existsCache || existsCacheLen !== state.songs.length) {
      existsCache = {};
      existsCacheLen = state.songs.length;
      for (var i = 0; i < state.songs.length; i++) {
        var kk = titleKey(state.songs[i].title);
        if (kk && !existsCache[kk]) existsCache[kk] = state.songs[i];
      }
    }
    return existsCache[k] || null;
  }

  // 内置库：歌名 -> 原唱
  function bankArtist(title) {
    if (!bankIndex) buildBankIndex();
    if (!bankIndex) return '';
    var k = norm(title).toLowerCase();
    var k2 = titleKey(title);
    return bankIndex['~ar:' + k] || bankIndex['~ar:' + k2] || '';
  }

  function addSongs(items, opts) {
    opts = opts || {};
    var added = 0, updated = 0, skipped = 0;
    var listName = opts.listName || '';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var t = cleanTitle(it.title), a = cleanTitle(it.artist);
      if (!t) continue;
      var old = exists(t, a);
      if (old) {
        var touched = false;
        if (!old.artist && a) { old.artist = a; touched = true; }
        if (!old.artist) {
          var ba = bankArtist(old.title);
          if (ba) { old.artist = ba; touched = true; }
        }
        if (it.diff && !old.diff) { old.diff = it.diff; old.diffSrc = 'import'; touched = true; }
        if (listName && old.tags.indexOf(listName) < 0) { old.tags.push(listName); touched = true; }
        if (touched) updated++; else skipped++;
        continue;
      }
      if (!a) a = bankArtist(t) || '';
      var d = it.diff || 0, src = it.diff ? 'import' : '';
      if (!d && opts.useBank) {
        var b = bankLookup(t, a);
        if (b) { d = b; src = 'bank'; }
      }
      state.songs.push({
        id: uid(), seq: (state.seqCounter = (state.seqCounter || 0) + 1), title: t, artist: a,
        diff: d, diffSrc: src, st: 'todo',
        tags: listName ? [listName] : [], plays: 0, last: 0, note: ''
      });
      added++;
    }
    invalidateExists();
    if (opts.shuffleAfter) shuffle();
    save();
    return { added: added, updated: updated, skipped: skipped };
  }

  function applyBank() {
    invalidateExists();
    var n = 0;
    for (var i = 0; i < state.songs.length; i++) {
      var s = state.songs[i];
      if (s.diffSrc === 'manual') continue;
      var b = bankLookup(s.title, s.artist);
      if (b && b !== s.diff) { s.diff = b; s.diffSrc = 'bank'; n++; }
      else if (b && !s.diffSrc) { s.diffSrc = 'bank'; }
    }
    save();
    return n;
  }

  function shuffle() {
    var ids = state.songs.filter(function (s) { return s.st !== 'done'; }).map(function (s) { return s.id; });
    for (var i = ids.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = ids[i]; ids[i] = ids[j]; ids[j] = t;
    }
    var doneIds = state.songs.filter(function (s) { return s.st === 'done'; }).map(function (s) { return s.id; });
    state.order = ids.concat(doneIds);
    state.orderSeed = Date.now();
    save();
    return state.order.length;
  }

  /* ---------------- 整理歌名（去序号 + 合并重复） ---------------- */
  function fixTitles() {
    invalidateExists();
    var fixed = 0;
    state.songs.forEach(function (s) {
      var t = (s.title || '').replace(/^[\(\[（【]?\s*\d{1,4}\s*[\)\]）】]?\s*[\.、,，:：;；\-–—]\s*/, '');
      t = norm(t);
      if (t && t !== s.title) { s.title = t; fixed++; }
    });
    var seen = {}, merged = [], dup = 0;
    state.songs.forEach(function (s) {
      var k = titleKey(s.title);
      if (!k) { merged.push(s); return; }
      var o = seen[k];
      if (o) {
        dup++;
        if (!o.artist && s.artist) o.artist = s.artist;
        if (!o.diff && s.diff) { o.diff = s.diff; o.diffSrc = s.diffSrc; }
        o.plays = (o.plays || 0) + (s.plays || 0);
        (s.tags || []).forEach(function (t) { if (o.tags.indexOf(t) < 0) o.tags.push(t); });
        if (s.st === 'done') o.st = 'done';
      } else { seen[k] = s; merged.push(s); }
    });
    state.songs = merged;
    invalidateExists();
    save();
    return { fixed: fixed, merged: dup };
  }

  /* ---------------- 补全歌手 ---------------- */
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function pickBest(arr, title) {
    if (!arr || !arr.length) return null;
    var k = titleKey(title);
    var best = null;
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i];
      if (!it || !it.artist) continue;
      if (titleKey(it.title) === k) return it;
      if (!best) best = it;
    }
    return best;
  }

  async function fillArtists(onProgress) {
    var todo = state.songs.filter(function (s) { return !norm(s.artist); });
    var local = 0, net = 0, total = todo.length;
    for (var i = 0; i < todo.length; i++) {
      var ba = bankArtist(todo[i].title);
      if (ba) { todo[i].artist = ba; todo[i].artistSrc = 'bank'; local++; }
    }
    if (onProgress) onProgress({ phase: 'local', total: total, done: local, local: local, net: 0 });

    var rest = state.songs.filter(function (s) { return !norm(s.artist); });
    var max = Math.min(rest.length, 250);
    for (var j = 0; j < max; j++) {
      var s = rest[j];
      try {
        var arr = await searchSongs(s.title);
        var hit = pickBest(arr, s.title);
        if (hit) { s.artist = hit.artist; s.artistSrc = 'net'; net++; }
      } catch (e) { break; }
      if (onProgress) onProgress({ phase: 'net', total: max, done: j + 1, local: local, net: net });
      await sleep(90);
    }
    save();
    return { local: local, net: net, left: state.songs.filter(function (s) { return !norm(s.artist); }).length };
  }

  /* ---------------- 导出 ---------------- */
  var STARS = ['', '★', '★★', '★★★', '★★★★', '★★★★★'];

  function diffText(d) {
    return d ? STARS[d] : '未评';
  }

  function toText(title, rows) {
    var now = new Date();
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    var head = (title || '歌单') + '  ·  ' + now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
    var lines = [head, new Array(Math.min(30, head.length + 2)).join('─'), ''];
    rows.forEach(function (r, i) {
      var num = (i + 1 < 10 ? ' ' + (i + 1) : (i + 1)) + '. ';
      var line = num + r.title + (r.artist ? ' - ' + r.artist : '');
      var d = r.diff ? ('  ' + diffText(r.diff) + ' ' + DIFF_LABEL[r.diff]) : '  未评';
      var st = r.st === 'done' ? '  [已唱]' : '';
      lines.push(line + d + st);
    });
    lines.push('');
    lines.push('共 ' + rows.length + ' 首');
    return lines.join('\n');
  }

  /* ---------------- OCR ---------------- */
  var SIMD_TEST = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

  function hasSimd() {
    try { return typeof WebAssembly !== 'undefined' && WebAssembly.validate(SIMD_TEST); }
    catch (e) { return false; }
  }

  var ocrWorker = null;

  function baseUrl() {
    var href = location.href.split('#')[0].split('?')[0];
    return href.slice(0, href.lastIndexOf('/') + 1);
  }

  function loadImage(file) {
    return new Promise(function (res, rej) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () { res({ img: img, url: url }); };
      img.onerror = function (e) { URL.revokeObjectURL(url); rej(e); };
      img.src = url;
    });
  }

  function preprocess(img) {
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    var scale = 1;
    if (w < 700) scale = Math.min(3, 700 / w);
    var W = Math.round(w * scale), H = Math.round(h * scale);
    var maxH = 6000;
    if (H > maxH) { var k = maxH / H; W = Math.round(W * k); H = maxH; }
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0, W, H);
    // 提高对比度
    try {
      var d = ctx.getImageData(0, 0, W, H);
      var a = d.data;
      for (var i = 0; i < a.length; i += 4) {
        var g = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2];
        g = g > 150 ? 255 : (g < 90 ? 0 : g);
        a[i] = a[i + 1] = a[i + 2] = g;
      }
      ctx.putImageData(d, 0, 0);
    } catch (e) { }
    return cv;
  }

  async function runOcr(file, onProgress) {
    if (!window.Tesseract) throw new Error('OCR 组件未加载');
    var base = baseUrl();
    var packed = await loadImage(file);
    var cv = preprocess(packed.img);
    URL.revokeObjectURL(packed.url);

    if (ocrWorker) {
      try { await ocrWorker.terminate(); } catch (e) { }
      ocrWorker = null;
    }

    var coreFile = hasSimd() ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js';
    ocrWorker = await window.Tesseract.createWorker('chi_sim', 1, {
      workerPath: base + 'vendor/worker.min.js',
      corePath: base + 'vendor/' + coreFile,
      langPath: base + 'vendor/lang',
      cacheMethod: 'none',
      gzip: true,
      logger: function (m) {
        if (onProgress) onProgress(m);
      }
    });

    await ocrWorker.setParameters({ preserve_interword_spaces: '1' });
    var res = await ocrWorker.recognize(cv);
    var text = (res && res.data && res.data.text) || '';
    try { await ocrWorker.terminate(); } catch (e) { }
    ocrWorker = null;
    return text;
  }




  /* ---------------- 网易云榜单 ---------------- */
  var chartSeq = 0, chartPending = {};

  window.__onChartResult = function (reqId, json) {
    var cb = chartPending[reqId];
    if (!cb) return;
    delete chartPending[reqId];
    var arr = [];
    try { arr = JSON.parse(json) || []; } catch (e) { arr = []; }
    cb(arr);
  };

  function fetchChart(id) {
    return new Promise(function (resolve, reject) {
      id = String(id || '');
      if (window.Android && window.Android.fetchChart) {
        var rid = ++chartSeq;
        var done = false;
        chartPending[rid] = function (arr) { done = true; resolve(arr); };
        try { window.Android.fetchChart(id, rid); } catch (e) { reject(e); return; }
        setTimeout(function () {
          if (!done && chartPending[rid]) { delete chartPending[rid]; reject(new Error('网络超时')); }
        }, 15000);
      } else {
        fetch('/api/chart?id=' + encodeURIComponent(id))
          .then(function (r) { return r.json(); })
          .then(function (j) { resolve(Array.isArray(j) ? j : (j.tracks || [])); })
          .catch(reject);
      }
    });
  }

  var CHARTS = [
    { id: '3778678', name: '热歌榜' },
    { id: '3779629', name: '新歌榜' },
    { id: '19723756', name: '飙升榜' },
    { id: '2884035', name: '原创榜' }
  ];

  /* ---------------- 文件读取（txt / csv / docx / xlsx） ---------------- */
  function decodeEntities(s) {
    return (s || '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
      .replace(/&#(\d+);/g, function (_, d) { try { return String.fromCodePoint(parseInt(d, 10)); } catch (e) { return ''; } })
      .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { try { return String.fromCodePoint(parseInt(h, 16)); } catch (e) { return ''; } });
  }

  function looksGarbage(text) {
    if (!text) return false;
    var bad = 0, n = Math.min(text.length, 4000);
    for (var i = 0; i < n; i++) {
      var c = text.charCodeAt(i);
      if (c === 0xFFFD) bad++;
      else if (c < 9 || (c > 13 && c < 32)) bad++;
    }
    return bad / n > 0.02;
  }

  function listZip(buf) {
    var dv = new DataView(buf);
    var len = buf.byteLength, eocd = -1;
    for (var i = len - 22; i >= Math.max(0, len - 66000); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('不是有效的 Office 文件');
    var count = dv.getUint16(eocd + 10, true);
    var off = dv.getUint32(eocd + 16, true);
    var files = {};
    var dec = new TextDecoder('utf-8');
    for (var k = 0; k < count; k++) {
      if (off + 46 > len || dv.getUint32(off, true) !== 0x02014b50) break;
      var method = dv.getUint16(off + 10, true);
      var compSize = dv.getUint32(off + 20, true);
      var nameLen = dv.getUint16(off + 28, true);
      var extraLen = dv.getUint16(off + 30, true);
      var commentLen = dv.getUint16(off + 32, true);
      var localOff = dv.getUint32(off + 42, true);
      var name = dec.decode(new Uint8Array(buf, off + 46, nameLen));
      files[name] = { method: method, compSize: compSize, localOff: localOff };
      off += 46 + nameLen + extraLen + commentLen;
    }
    return files;
  }

  async function zipEntry(buf, files, name) {
    var f = files[name];
    if (!f) return null;
    var dv = new DataView(buf), off = f.localOff;
    if (dv.getUint32(off, true) !== 0x04034b50) throw new Error('压缩包损坏');
    var nameLen = dv.getUint16(off + 26, true), extraLen = dv.getUint16(off + 28, true);
    var start = off + 30 + nameLen + extraLen;
    var raw = new Uint8Array(buf, start, f.compSize);
    var bytes;
    if (f.method === 0) {
      bytes = raw;
    } else if (f.method === 8) {
      if (typeof DecompressionStream === 'undefined') throw new Error('当前系统不支持解压 docx，请改用 txt');
      var ds = new DecompressionStream('deflate-raw');
      var stream = new Blob([raw]).stream().pipeThrough(ds);
      bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    } else {
      throw new Error('不支持的压缩方式');
    }
    return new TextDecoder('utf-8').decode(bytes);
  }

  function docxToText(xml) {
    return decodeEntities(
      xml.replace(/<w:tab[^>]*\/>/g, '\t')
        .replace(/<w:br[^>]*\/>/g, '\n')
        .replace(/<\/w:p>/g, '\n')
        .replace(/<[^>]+>/g, '')
    ).replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n');
  }

  async function xlsxToText(buf, files) {
    var shared = await zipEntry(buf, files, 'xl/sharedStrings.xml');
    var strs = [];
    if (shared) {
      var re = /<t[^>]*>([\s\S]*?)<\/t>/g, m;
      while ((m = re.exec(shared))) strs.push(decodeEntities(m[1]));
    }
    var sheetName = null;
    for (var k in files) {
      if (/^xl\/worksheets\/sheet\d*\.xml$/.test(k)) { sheetName = k; break; }
    }
    if (!sheetName) return strs.join('\n');
    var sheet = await zipEntry(buf, files, sheetName);
    if (!sheet) return strs.join('\n');
    var out = [];
    var rows = sheet.split(/<\/row>/);
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.indexOf('<c') < 0) continue;
      var cells = [];
      var cre = /<c([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g, cm;
      while ((cm = cre.exec(row))) {
        var attrs = cm[1] || '', inner = cm[3] || '';
        var t = (attrs.match(/t="([^"]+)"/) || [])[1] || '';
        var val = '';
        if (t === 's') {
          var sv = (inner.match(/<v>(\d+)<\/v>/) || [])[1];
          val = sv != null ? (strs[Number(sv)] || '') : '';
        } else if (t === 'inlineStr') {
          val = decodeEntities((inner.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1] || '');
        } else {
          var v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
          val = v ? decodeEntities(v) : '';
        }
        cells.push(val);
      }
      var line = cells.join('\t').replace(/\t+$/, '');
      if (line.trim()) out.push(line);
    }
    return out.join('\n');
  }

  async function readAnyFile(file) {
    var buf = await file.arrayBuffer();
    var u8 = new Uint8Array(buf);
    if (u8.length > 3 && u8[0] === 0x50 && u8[1] === 0x4B && u8[2] === 0x03 && u8[3] === 0x04) {
      var files = listZip(buf);
      if (files['word/document.xml']) {
        var xml = await zipEntry(buf, files, 'word/document.xml');
        return docxToText(xml || '');
      }
      if (files['xl/workbook.xml'] || files['xl/sharedStrings.xml'] || files['xl/worksheets/sheet1.xml']) {
        return await xlsxToText(buf, files);
      }
      throw new Error('这是压缩包，不是 Word/Excel 文档');
    }
    if (u8.length > 8 && u8[0] === 0xD0 && u8[1] === 0xCF && u8[2] === 0x11 && u8[3] === 0xE0) {
      throw new Error('这是老版 .doc/.xls 二进制格式，请另存为 .docx 或 .txt 再导入');
    }
    if (u8.length > 3 && u8[0] === 0xFF && u8[1] === 0xFE) {
      return new TextDecoder('utf-16le').decode(buf);
    }
    var text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    if (looksGarbage(text)) {
      try {
        var g = new TextDecoder('gbk').decode(buf);
        if (!looksGarbage(g)) return g;
      } catch (e) { }
    }
    if (looksGarbage(text)) throw new Error('这不是文本文件（可能是图片或二进制），图片请用「选择图片识别」');
    return text.replace(/^\uFEFF/, '');
  }

  /* ---------------- 联网搜歌 ---------------- */
  var searchSeq = 0, searchPending = {};

  window.__onSearchResult = function (id, json) {
    var cb = searchPending[id];
    if (!cb) return;
    delete searchPending[id];
    var arr = [];
    try { arr = JSON.parse(json) || []; } catch (e) { arr = []; }
    cb(arr);
  };

  function searchSongs(q) {
    return new Promise(function (resolve, reject) {
      q = (q || '').trim();
      if (!q) return resolve([]);
      if (window.Android && window.Android.searchSongs) {
        var id = ++searchSeq;
        var done = false;
        searchPending[id] = function (arr) { done = true; resolve(arr); };
        try { window.Android.searchSongs(q, id); } catch (e) { reject(e); return; }
        setTimeout(function () {
          if (!done && searchPending[id]) { delete searchPending[id]; reject(new Error('网络超时')); }
        }, 15000);
      } else {
        fetch('/api/search?q=' + encodeURIComponent(q))
          .then(function (r) { return r.json(); })
          .then(function (j) { resolve(Array.isArray(j) ? j : (j.result || [])); })
          .catch(reject);
      }
    });
  }


  /* ---------------- 图片仓库（IndexedDB，容量大） ---------------- */
  var idbPromise = null;
  function idb() {
    if (idbPromise) return idbPromise;
    idbPromise = new Promise(function (resolve) {
      try {
        if (!window.indexedDB) return resolve(null);
        var req = indexedDB.open('songranker-img', 1);
        req.onupgradeneeded = function (e) {
          var db = e.target.result;
          if (!db.objectStoreNames.contains('img')) db.createObjectStore('img', { keyPath: 'id' });
        };
        req.onsuccess = function (e) { resolve(e.target.result); };
        req.onerror = function () { resolve(null); };
      } catch (err) { resolve(null); }
    });
    return idbPromise;
  }

  function imgPut(id, dataUrl) {
    return idb().then(function (db) {
      if (!db) return false;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction('img', 'readwrite');
          tx.objectStore('img').put({ id: id, data: dataUrl });
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = function () { resolve(false); };
        } catch (e) { resolve(false); }
      });
    });
  }

  function imgGet(id) {
    return idb().then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction('img', 'readonly');
          var rq = tx.objectStore('img').get(id);
          rq.onsuccess = function () { resolve(rq.result ? rq.result.data : null); };
          rq.onerror = function () { resolve(null); };
        } catch (e) { resolve(null); }
      });
    });
  }

  function imgDel(id) {
    return idb().then(function (db) {
      if (!db) return false;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction('img', 'readwrite');
          tx.objectStore('img').delete(id);
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = function () { resolve(false); };
        } catch (e) { resolve(false); }
      });
    });
  }

  /* 把图片从 localStorage 迁到 IndexedDB（引用换成 idb:<id>） */
  async function migrateImages() {
    var moved = 0;
    var c = state.settings.card;
    var all = [];
    (c.gImages || []).forEach(function (im) { all.push(im); });
    (c.coverImages || []).forEach(function (im) { all.push(im); });
    Object.keys(state.cardImgs || {}).forEach(function (k) { all.push(state.cardImgs[k]); });
    (state.settings.bg.images || []).forEach(function (im) { all.push(im); });
    for (var i = 0; i < all.length; i++) {
      var im = all[i];
      if (!im || !im.dataUrl || im.idb) continue;
      var id = im.id || uid();
      var ok = await imgPut(id, im.dataUrl);
      if (ok) {
        delete im.dataUrl;
        im.idb = id;
        moved++;
      }
    }
    if (moved) save();
    return moved;
  }

  /* ---------------- 背景图处理 ---------------- */
  function dominantColor(ctx, w, h) {
    try {
      var d = ctx.getImageData(0, 0, w, h).data;
      var r = 0, g = 0, b = 0, n = 0;
      for (var i = 0; i < d.length; i += 4 * 29) {
        r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
      }
      if (!n) return '#7c5cff';
      r = Math.min(255, Math.round(r / n * 1.18));
      g = Math.min(255, Math.round(g / n * 1.18));
      b = Math.min(255, Math.round(b / n * 1.18));
      var hex = function (v) { return ('0' + v.toString(16)).slice(-2); };
      return '#' + hex(r) + hex(g) + hex(b);
    } catch (e) { return '#7c5cff'; }
  }

  function processImage(file, cb) {
    var img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = function () {
      try {
        var maxW = 1080;
        var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        var scale = Math.min(1, maxW / w);
        var cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(w * scale));
        cv.height = Math.max(1, Math.round(h * scale));
        var ctx = cv.getContext('2d');
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        var dataUrl = cv.toDataURL('image/jpeg', 0.82);
        var color = dominantColor(ctx, cv.width, cv.height);
        URL.revokeObjectURL(url);
        cb({ dataUrl: dataUrl, color: color, w: cv.width, h: cv.height });
      } catch (e) {
        URL.revokeObjectURL(url);
        cb(null);
      }
    };
    img.onerror = function () { URL.revokeObjectURL(url); cb(null); };
    img.src = url;
  }

  /* ---------------- 平台 ---------------- */
  var Bridge = {
    isAndroid: function () { return typeof window.Android !== 'undefined' && window.Android; },
    toast: function (msg) {
      if (Bridge.isAndroid()) { try { window.Android.toast(msg); return; } catch (e) { } }
      window.dispatchEvent(new CustomEvent('app-toast', { detail: msg }));
    },
    share: function (text) {
      if (Bridge.isAndroid()) { try { window.Android.share(text); return true; } catch (e) { } }
      if (navigator.share) { navigator.share({ text: text }).catch(function () { }); return true; }
      try { navigator.clipboard.writeText(text); Bridge.toast('已复制'); } catch (e) { }
      return false;
    },
    copy: function (text) {
      if (Bridge.isAndroid()) { try { window.Android.copy(text); return; } catch (e) { } }
      try { navigator.clipboard.writeText(text); Bridge.toast('已复制'); }
      catch (e) { Bridge.toast('复制失败'); }
    },
    saveText: function (name, text) {
      if (Bridge.isAndroid()) { try { window.Android.saveText(name, text); return; } catch (e) { } }
      download(new Blob([text], { type: 'text/plain;charset=utf-8' }), name);
    },
    saveImage: function (name, dataUrl) {
      var b64 = dataUrl.split(',')[1];
      if (Bridge.isAndroid()) { try { window.Android.saveImage(name, b64); return; } catch (e) { } }
      var a = document.createElement('a');
      a.href = dataUrl; a.download = name; a.click();
    },
    shareImage: function (name, dataUrl) {
      var b64 = dataUrl.split(',')[1];
      if (Bridge.isAndroid()) { try { window.Android.shareImage(name, b64); return; } catch (e) { } }
      var a = document.createElement('a');
      a.href = dataUrl; a.download = name; a.click();
    },
    setBars: function (bg, dark) {
      if (Bridge.isAndroid()) { try { window.Android.setBars(bg, dark); } catch (e) { } }
    },
    vibrate: function (ms) {
      if (Bridge.isAndroid()) { try { window.Android.vibrate(ms); } catch (e) { } }
    },
    exit: function () {
      if (Bridge.isAndroid()) { try { window.Android.exitApp(); return true; } catch (e) { } }
      return false;
    }
  };

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1200);
  }

  window.S = {
    state: state, load: load, save: save, uid: uid, norm: norm,
    pyOf: pyOf, initialOf: initialOf,
    DIFF_LABEL: DIFF_LABEL, STARS: STARS, diffText: diffText,
    bankLookup: bankLookup, applyBank: applyBank, bankArtist: bankArtist, titleKey: titleKey, fillArtists: fillArtists,
    parseLine: parseLine, parseText: parseText,
    addSongs: addSongs, exists: exists, shuffle: shuffle,
    toText: toText, runOcr: runOcr, hasSimd: hasSimd, searchSongs: searchSongs,
    readAnyFile: readAnyFile, docxToText: docxToText, fetchChart: fetchChart, CHARTS: CHARTS, fixTitles: fixTitles,
    processImage: processImage, dominantColor: dominantColor,
    imgPut: imgPut, imgGet: imgGet, imgDel: imgDel, migrateImages: migrateImages, idb: idb,
    Bridge: Bridge, download: download,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS
  };
})();
