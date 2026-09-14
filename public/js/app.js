import { Gomoku } from './gomoku.js?v=2';
import { Xiangqi } from './xiangqi.js?v=2';
import { Go } from './go.js?v=2';
import { getSession, saveSession, clearSession, getNickname, saveNickname } from './db.js?v=2';

const $ = function(q, r) { return (r || document).querySelector(q); };
const $$ = function(q, r) { return Array.prototype.slice.call((r || document).querySelectorAll(q)); };
const MODULES = { gomoku: Gomoku, xiangqi: Xiangqi, go: Go };
if (typeof window !== 'undefined' && window.NorulesUI) MODULES.norules = window.NorulesUI;
let NAME = '玩家' + Math.floor(100 + Math.random() * 900);

const app = { room: null, game: null, token: null, you: 1, opponent: '', opponents: [], capacity: 2, module: null, state: null };
let net = null;

// ---------------- utilities ----------------
function toast(msg, type) {
  const el = document.createElement('div');
  el.className = 'toast ' + (type || '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

function confirmDialog(title, msg) {
  return new Promise(resolve => {
    const dlg = $('#confirmDialog');
    if (dlg.open) dlg.close();
    $('#confirmTitle').textContent = title;
    $('#confirmMsg').textContent = msg;
    dlg.showModal();
    const ok = $('#confirmOk');
    const cancel = $('#confirmCancel');
    const cleanup = () => { dlg.close(); ok.onclick = null; cancel.onclick = null; };
    ok.onclick = () => { cleanup(); resolve(true); };
    cancel.onclick = () => { cleanup(); resolve(false); };
    dlg.oncancel = () => { cleanup(); resolve(false); };
  });
}

function sende(o) {
  if (net && net.readyState === 1) net.send(JSON.stringify(o));
}

// ---------------- connection ----------------
async function connect() {
  const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
  net = new WebSocket(proto + location.host + '/');
  net.onopen = async () => {
    const qp = new URLSearchParams(location.search);
    const jr = qp.get('join');
    if (jr && /^\d{6}$/.test(jr)) {
      uiWait('正在加入房间 ' + prettyRoom(jr) + ' …');
      sende({ type: 'join', room: jr, game: qp.get('game') || 'gomoku', name: NAME });
    } else {
      const saved = await getSession();
      if (saved && saved.room) {
        sende({ type: 'resume', room: saved.room, token: saved.token });
      }
    }
  };
  net.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } onMsg(m); };
  net.onclose = () => { net = null; setTimeout(connect, 1500); };
  setInterval(() => sende({ ping: 1 }), 25000);
}

// ---------------- message handling ----------------
function onMsg(m) {
  switch (m.type) {
    case 'created':
      saveSessionData(m);
      app.capacity = m.capacity || 2;
      uiWait('房间已创建，等待玩家 (1/' + app.capacity + ')…');
      $('#waitRoom').textContent = prettyRoom(m.room);
      $('#waitLink').textContent = location.origin + '/?join=' + m.room;
      break;
    case 'joined':
      saveSessionData(m);
      app.capacity = m.capacity || app.capacity || 2;
      app.names = m.names || [];
      app.opponents = app.names.filter(function(n, i) { return i + 1 !== app.you && n; });
      if (m.state) {
        startGame(m);
      } else {
        uiWait('已加入房间，等待玩家 (' + app.names.filter(Boolean).length + '/' + app.capacity + ')…');
        $('#waitRoom').textContent = prettyRoom(m.room);
      }
      break;
    case 'playerJoined':
      app.names = m.names || [];
      app.capacity = m.capacity || app.capacity;
      app.opponents = app.names.filter(function(n, i) { return i + 1 !== app.you && n; });
      toast(m.name + ' 加入了房间');
      if (!m.state && $('#overlayWait').classList && !$('#overlayWait').classList.contains('hidden')) {
        $('#overlayWait').querySelector('h3').textContent =
          '等待玩家 (' + app.names.filter(Boolean).length + '/' + app.capacity + ')…';
      }
      break;
    case 'start':
      startGame({ room: app.room, game: m.game, player: m.player, token: app.token,
        capacity: m.capacity, state: m.state, names: m.names, opponentNames: m.opponents }, false);
      break;
    case 'resumed':
      app.opponent = m.opponentName;
      startGame(m, true);
      break;
    case 'state':
      app.state = m.state;
      render(m.state);
      break;
    case 'rematch':
      app.state = m.state;
      hide('#overlayResult');
      render(m.state, true);
      toast('重新开局');
      break;
    case 'hints':
      if (app.module && app.module.onHints) app.module.onHints(m);
      break;
    case 'opponentReconnected':
      toast('对手已重新连接');
      break;
    case 'opponentLeft':
      handleOppLeft();
      break;
    case 'roomDestroyed':
      toast('房间已销毁');
      app.room = null;
      hide('#overlayWait');
      hide('#view-game');
      show('#view-home');
      break;
    case 'notfound': hideWait(); toast('房间不存在，请检查房间号'); break;
    case 'full': hideWait(); toast('房间已满，无法加入'); break;
    case 'wronggame': hideWait(); toast('房间的游戏类型与你选择的不同'); break;
    case 'forbidden': hideWait(); toast('身份校验失败'); break;
    case 'error': hideWait(); toast(m.msg || '操作失败', 'err'); break;
  }
}

function prettyRoom(id) {
  return id.replace(/(\d{3})(\d{3})/, '$1 $2');
}

function saveSessionData(m) {
  app.room = m.room;
  app.game = m.game || app.game;
  app.token = m.token;
  app.you = m.player || 1;
  app.opponent = m.opponentName || '';
  saveSession({ room: app.room, token: app.token, game: app.game });
}

function startGame(m, fromResume) {
  app.room = m.room || app.room;
  app.game = m.game || app.game;
  app.you = m.player || m.you || app.you;
  app.capacity = m.capacity || app.capacity || 2;
  app.opponent = m.opponentName || m.opponents?.[0] || '';
  app.opponents = m.opponentNames || (m.opponentName ? [m.opponentName] : []);
  app.names = m.names || [];
  app.state = m.state;
  if (m.token || m.player) {
    saveSession({ room: app.room, token: m.token || app.token, game: app.game });
  }
  hide('#overlayWait');
  openGame();
  render(m.state, fromResume ? null : true);
}

function uiWait(text) {
  show('#overlayWait');
  const t = $('#waitTitle');
  if (t) t.textContent = '';
  if ($('#overlayWait').querySelector('h3')) $('#overlayWait').querySelector('h3').textContent = text;
}

// ---------------- views ----------------
function show(q) { const el = $(q); if (el) { el.classList.remove('hidden'); el.classList.add('active'); } }
function hide(q) { const el = $(q); if (el) { el.classList.add('hidden'); el.classList.remove('active'); } }

function openGame() {
  show('#view-game');
  hide('#view-home');
  $('#roomChip').textContent = app.room;
  $('#youName').innerHTML = '<span class="swatch ' + colorSwatch(app.game, app.you) + '"></span>' + NAME;

  // Opponent cards (seat-aligned, skip self)
  var oppPanel = $('#oppPanel');
  oppPanel.innerHTML = '';
  var cap = app.capacity || 2;
  for (var seat = 1; seat <= cap; seat++) {
    if (seat === app.you) continue;
    var nm = app.names[seat - 1] || app.opponents[seat - 1] || ('等待加入…');
    var card = document.createElement('div');
    card.className = 'player-card';
    card.id = 'opp-seat-' + seat;
    card.innerHTML = '<div class="who">座位 ' + seat + '</div>' +
      '<div class="nm"><span class="swatch ' + colorSwatch(app.game, seat) + '"></span><span class="nm-text">' + nm + '</span></div>';
    oppPanel.appendChild(card);
  }

  var tip = $('#tipText');
  var tips = {
    gomoku: '轮到你就用鼠标点击棋盘上的交叉点落子。<br>黑方先手，连成五子获胜。',
    xiangqi: '先点击自己的棋子，变亮后可看到可走点位（绿点），再点击目标位置落子。<br>红方先行，将死对方获胜。',
    go: '点击交叉点落子。直接点击即可落子。<br>双方都停一手后进入点目计分阶段。',
    norules: '轮到你时：点击手牌选中/取消，点「出牌」打出任意牌，或「跳过」。<br>其余人都跳过后你可自由出牌，先出完手牌者获胜。'
  };
  tip.innerHTML = tips[app.game] || '';

  var mod = MODULES[app.game];
  app.module = mod;
  // 牌类不支持认输
  $('#btnResign').style.display = (CARD_GAMES.indexOf(app.game) >= 0) ? 'none' : '';
  mod.mount($('#boardWrap'), {
    you: function() { return app.you; },
    send: sende,
    toast: toast,
    names: function() { return app.names || []; },
  });
}

function colorSwatch(game, player) {
  if (game === 'norules' || game === 'paodekuai' || game === 'doudizhu') return 'poker-swatch';
  if (game === 'xiangqi') return player === 1 ? 'red' : 'black-red';
  return player === 1 ? 'black' : 'white';
}

function render(st, starting) {
  if (!app.module) return;
  app.module.onState(st);
  updateStatus(st);
  updatePlayers();

  if (st.gameover) {
    if (starting !== true) showResult(st);
  } else {
    hide('#overlayResult');
  }
}

function updatePlayers() {
  var meActive = app.state && !app.state.gameover && (app.state.turn === app.you);
  $('#cardYou').classList.toggle('active', meActive);
  var opps = $$('#oppPanel .player-card');
  opps.forEach(function(c) { c.classList.remove('active'); });
  if (!meActive && app.state && app.state.turn) {
    var el = $('#opp-seat-' + app.state.turn);
    if (el) el.classList.add('active');
  }
}

function updateStatus(st) {
  var el = $('#statusText');
  var dot = $('#dot');
  if (!st) { el.textContent = '未连接'; dot.className = 'dot'; return; }
  if (st.gameover) {
    el.textContent = st.winner === app.you ? '你赢了！' : (st.winner ? '本局惜败' : '对局结束');
    dot.className = 'dot';
  } else if (st.phase === 'scoring') {
    el.textContent = '计分阶段';
    dot.className = 'dot opp';
  } else {
    var mine = st.turn === app.you;
    el.textContent = (mine ? '轮到你' : '等待对方') + (st.check ? ' · 将军!' : '');
    dot.className = 'dot ' + (mine ? 'mine' : 'opp');
  }
}

function showResult(st) {
  const emoji = $('#resEmoji'), title = $('#resTitle'), sub = $('#resSub');
  const win = st.winner;
  const you = app.you;
  let t, s, e;

  if (st.winType === 'resign') {
    e = win === you ? '🎉' : '🤝';
    t = win === you ? '你赢了！' : '本局惜败';
    s = win === you ? '对手认输，你获得胜利' : '你认输，对手获得胜利';
  } else if (st.winType === 'checkmate') {
    e = win === you ? '🏆' : '😵';
    t = win === you ? '将军！你赢了' : '被将死';
    s = win === you ? '你成功将死了对手的将帅' : '你的将帅已被将死';
  } else if (st.winType === 'stalemate') {
    e = '🤝'; t = '对方无棋可走'; s = (win === you ? '你获胜（困毙）' : '对手获胜（困毙）');
  } else if (st.winType === 'score') {
    const sc = st.score;
    e = win === you ? '🏆' : win ? '🥈' : '🤝';
    t = win === 0 ? '平局' : (win === you ? '你赢了！' : '本局惜败');
    s = '黑 ' + sc.black + ' 分 · 白 ' + sc.white + ' 分' + (sc.komi ? '（贴目 ' + sc.komi + '）' : '');
  } else if (st.winType === 'draw') {
    e = '🤝'; t = '平局'; s = '棋盘已下满';
  } else {
    e = win === you ? '🏆' : '🥈';
    t = win === you ? '你赢了！' : '本局惜败';
    s = win === you ? app.module.title + '：连成五子获胜' : app.module.title + '：对方连成五子';
  }
  emoji.textContent = e;
  title.textContent = t;
  sub.textContent = s;
  show('#overlayResult');
}

function handleOppLeft() {
  hide('#overlayResult');
  hide('#overlayWait');
  if (!$('#view-game').classList.contains('hidden')) {
    toast('对手已离开房间');
    setTimeout(() => exitRoom(), 600);
  }
}

// ---------------- actions ----------------
const CARD_GAMES = ['norules', 'paodekuai', 'doudizhu'];
const UNREADY_GAMES = ['paodekuai', 'doudizhu']; // 即将上线

function createRoom(game, playerCount) {
  if (!net || net.readyState !== 1) { toast('连接中，请稍候', 'err'); return; }
  if (UNREADY_GAMES.indexOf(game) >= 0) { toast('该玩法即将上线，敬请期待'); return; }
  app.game = game;
  sende({ type: 'create', game, name: NAME, playerCount: playerCount });
  uiWait('正在创建房间…');
  $('#waitRoom').textContent = '—— —— ——';
  $('#waitLink').textContent = '';
  $('#btnCopyWait').textContent = '复制房间链接';
  $('#btnCancelWait').textContent = '销毁房间';
  $('#btnCopyWait').style.display = '';
}

function joinRoom() {
  const v = $('#joinRoom').value.trim();
  if (!/^\d{6}$/.test(v)) { toast('请输入 6 位房间号', 'err'); return; }
  const onBtn = $('#segGame button.on');
  const game = (onBtn && onBtn.dataset.g) || 'gomoku';
  if (UNREADY_GAMES.indexOf(game) >= 0) { toast('该玩法即将上线，敬请期待'); return; }
  app.game = game;
  sende({ type: 'join', room: v, game, name: NAME });
  uiWait('正在加入房间 ' + prettyRoom(v) + ' …');
  $('#waitRoom').textContent = prettyRoom(v);
  $('#waitLink').textContent = '';
  $('#btnCancelWait').textContent = '销毁房间';
  $('#btnCopyWait').style.display = 'none';
}

function showCountPicker() {
  if (!net || net.readyState !== 1) { toast('连接中，请稍候', 'err'); return; }
  show('#overlayCount');
}

function exitRoom() {
  if (app.module && app.module.reset) { try { app.module.reset(); } catch {} }
  if (app.room) sende({ type: 'destroy' });
  app.room = null; app.game = null; app.token = null; app.module = null; app.state = null;
  clearSession();
  hide('#overlayWait');
  hide('#overlayResult');
  hide('#view-game');
  show('#view-home');
}

function copyRoomLink() {
  const url = location.origin + '/?join=' + app.room;
  (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject())
    .then(() => toast('房间链接已复制'))
    .catch(() => { toast('复制失败，链接：' + url); });
}

function hideWait() { hide('#overlayWait'); }

// ---------------- wiring ----------------
function bind() {
  $('#nickname').addEventListener('change', function () {
    const v = this.value.trim();
    if (v) { NAME = v; saveNickname(v); }
  });
  document.querySelectorAll('.mcard').forEach(c => {
    c.addEventListener('click', () => {
      var g = c.dataset.game;
      if (g === 'norules') { showCountPicker(); return; }
      createRoom(g);
    });
  });
  // 人数选择弹窗
  document.querySelectorAll('#overlayCount [data-count]').forEach(b => {
    b.addEventListener('click', () => {
      hide('#overlayCount');
      createRoom('norules', parseInt(b.dataset.count, 10));
    });
  });
  $('#btnCountCancel').addEventListener('click', () => hide('#overlayCount'));
  $('#segGame').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    document.querySelectorAll('#segGame button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
  });
  $('#btnJoin').addEventListener('click', joinRoom);
  $('#joinRoom').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });
  $('#roomPill').addEventListener('click', copyRoomLink);
  $('#btnCopyWait').addEventListener('click', copyRoomLink);
  $('#btnCancelWait').addEventListener('click', () => exitRoom());
  $('#btnExit').addEventListener('click', () => exitRoom());
  $('#btnHome').addEventListener('click', () => exitRoom());
  $('#btnResultHome').addEventListener('click', () => exitRoom());
  $('#btnRematch').addEventListener('click', () => sende({ type: 'rematch' }));
  $('#btnResign').addEventListener('click', async () => {
    if (!app.state || app.state.gameover) return;
    if (await confirmDialog('认输', '确定认输本局吗？')) sende({ type: 'resign' });
  });
  // btnDestroy removed - exit now handles destroy
}

// 加载昵称
getNickname().then(nick => {
  if (nick) {
    NAME = nick;
    const inp = $('#nickname');
    if (inp) inp.value = nick;
  }
});

bind();
connect();
