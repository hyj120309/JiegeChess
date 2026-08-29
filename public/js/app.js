import { Gomoku } from './gomoku.js';
import { Xiangqi } from './xiangqi.js';
import { Go } from './go.js';
import { getSession, saveSession, clearSession } from './db.js';

const $ = (q, r = document) => r.querySelector(q);
const MODULES = { gomoku: Gomoku, xiangqi: Xiangqi, go: Go };
const NAME = '玩家' + Math.floor(100 + Math.random() * 900);

const app = { room: null, game: null, token: null, you: 1, opponent: '', module: null, state: null };
let net = null;

// ---------------- utilities ----------------
function toast(msg, type) {
  const el = document.createElement('div');
  el.className = 'toast ' + (type || '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 2800);
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
      uiWait('房间已创建，等待对手加入…');
      $('#waitRoom').textContent = prettyRoom(m.room);
      $('#waitLink').textContent = location.origin + '/?join=' + m.room;
      break;
    case 'joined':
      saveSessionData(m);
      startGame(m);
      break;
    case 'opponentJoined':
      app.opponent = m.opponentName;
      startGame(m);
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
      toast('房间已被房主销毁');
      exitRoom();
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
  app.opponent = m.opponentName || app.opponent;
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
function show(q) { const el = $(q); if (el) el.classList.remove('hidden'); }
function hide(q) { const el = $(q); if (el) el.classList.add('hidden'); }

function openGame() {
  show('#view-game');
  hide('#view-home');
  $('#roomChip').textContent = app.room;
  const opp = app.you === 1 ? 2 : 1;
  $('#youName').innerHTML = '<span class="swatch ' + colorSwatch(app.game, app.you) + '"></span>' + NAME;
  $('#oppName').innerHTML = '<span class="swatch ' + colorSwatch(app.game, opp) + '"></span>' + (app.opponent || '正在加入…');
  const tip = $('#tipText');
  const tips = {
    gomoku: '轮到你就用鼠标点击棋盘上的交叉点落子。<br>黑方先手，连成五子获胜。',
    xiangqi: '先点击自己的棋子，变亮后可看到可走点位（绿点），再点击目标位置落子。<br>红方先行，将死对方获胜。',
    go: '点击交叉点落子。直接点击即可落子。<br>双方都停一手后进入点目计分阶段。'
  };
  tip.innerHTML = tips[app.game];

  const mod = MODULES[app.game];
  app.module = mod;
  mod.mount($('#boardWrap'), { you: () => app.you, send: sende, toast });
}

function colorSwatch(game, player) {
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
  const meActive = !app.state.gameover && (app.state.turn === app.you);
  $('#cardYou').classList.toggle('active', meActive);
  $('#cardOpp').classList.toggle('active', !meActive);
}

function updateStatus(st) {
  const el = $('#statusText');
  const dot = $('#dot');
  if (!st) { el.textContent = '未连接'; dot.className = 'dot'; return; }
  if (st.gameover) {
    el.textContent = '对局结束';
    dot.className = 'dot';
  } else if (st.phase === 'scoring') {
    el.textContent = '计分阶段';
    dot.className = 'dot opp';
  } else {
    const mine = st.turn === app.you;
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
function createRoom(game) {
  if (!net || net.readyState !== 1) { toast('连接中，请稍候', 'err'); return; }
  app.game = game;
  sende({ type: 'create', game, name: NAME });
  uiWait('正在创建房间…');
  $('#waitRoom').textContent = '—— —— ——';
  $('#waitLink').textContent = '';
  $('#btnCopyWait').textContent = '复制房间链接';
  $('#btnCancelWait').textContent = '取消';
}

function joinRoom() {
  const v = $('#joinRoom').value.trim();
  if (!/^\d{6}$/.test(v)) { toast('请输入 6 位房间号', 'err'); return; }
  const game = $('#segGame button.on')?.dataset.g || 'gomoku';
  app.game = game;
  sende({ type: 'join', room: v, game, name: NAME });
  uiWait('正在加入房间 ' + prettyRoom(v) + ' …');
  $('#waitRoom').textContent = prettyRoom(v);
  $('#waitLink').textContent = '';
  $('#btnCancelWait').textContent = '取消加入';
  $('#btnCopyWait').style.display = 'none';
}

function exitRoom() {
  if (app.module && app.module.reset) { try { app.module.reset(); } catch {} }
  if (app.room) sende({ type: 'leave' });
  app.room = null; app.game = null; app.token = null; app.module = null; app.state = null;
  clearSession();
  hide('#overlayWait');
  hide('#overlayResult');
  hide('#view-game');
  show('#view-home');
}

function destroyRoom() {
  if (!app.room) return;
  if (!confirm('确定要销毁当前房间吗？所有玩家将被踢出。')) return;
  sende({ type: 'destroy' });
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
  document.querySelectorAll('.mcard').forEach(c => {
    c.addEventListener('click', () => createRoom(c.dataset.game));
  });
  $('#segGame').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    $('#segGame button').forEach(x => x.classList.remove('on'));
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
  $('#btnResign').addEventListener('click', () => {
    if (!app.state || app.state.gameover) return;
    if (confirm('确定认输本局吗？')) sende({ type: 'resign' });
  });
  $('#btnDestroy')?.addEventListener('click', destroyRoom);
}

bind();
connect();
