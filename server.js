'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const GAMES = {
  gomoku:    { mod: require('./lib/gomoku'),    capacity: 2 },
  xiangqi:   { mod: require('./lib/xiangqi'),   capacity: 2 },
  go:        { mod: require('./lib/go'),         capacity: 2 },
  norules:   { mod: require('./lib/norules'),    capacity: 3, customCapacity: true },
  paodekuai: { mod: require('./lib/paodekuai'),  capacity: 3 },
  doudizhu:  { mod: require('./lib/doudizhu'),   capacity: 3 },
};

const ROOT = __dirname;
const PUB = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data', 'rooms');
const PORT = process.env.PORT || 8080;
fs.mkdirSync(DATA_DIR, { recursive: true });

const rooms = new Map();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff',
};

function send(ws, payload) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function broadAll(room, payload, except) {
  for (const ws of room.players) {
    if (ws && ws !== except && ws.readyState === WebSocket.OPEN) send(ws, payload);
  }
}

function genRoomId() {
  let id;
  do { id = String(100000 + Math.floor(Math.random() * 900000)); } while (rooms.has(id));
  return id;
}
function genToken() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

// 昵称清洗: 去掉HTML危险字符, 限长 (防XSS)
function sanitizeName(name) {
  return String(name || '').replace(/[<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
}

// ---------- personal state view ----------
function buildView(state, playerIdx, seatCount) {
  if (!state || !state._views) return state;
  const view = state._views[playerIdx];
  return view || state;
}

function broadState(room) {
  for (let i = 0; i < room.players.length; i++) {
    const ws = room.players[i];
    if (ws && ws.readyState === WebSocket.OPEN) {
      send(ws, { type: 'state', state: buildView(room.state, i, room.capacity), you: i + 1 });
    }
  }
}

// ---------- persistence ----------
function roomPath(id) { return path.join(DATA_DIR, id + '.json'); }

function saveRoom(room) {
  // 剔除 _views: 含全部玩家手牌的视图(冗余且有不一致隐患), 恢复时重建
  let state = room.state;
  if (state && state._views) {
    state = Object.assign({}, state, { _views: null });
  }
  const data = {
    id: room.id, game: room.game, names: room.names, tokens: room.tokens,
    state, lastActive: room.lastActive, capacity: room.capacity,
  };
  try { fs.writeFileSync(roomPath(room.id), JSON.stringify(data), 'utf8'); }
  catch (e) { console.error('[persist]', room.id, e.message); }
}

function loadRoom(id) {
  try { return JSON.parse(fs.readFileSync(roomPath(id), 'utf8')); }
  catch { return null; }
}

function deleteRoomFile(id) {
  try { fs.unlinkSync(roomPath(id)); } catch {}
}

function loadAllRooms() {
  let count = 0;
  for (const f of fs.readdirSync(DATA_DIR)) {
    if (!f.endsWith('.json')) continue;
    const id = f.replace('.json', '');
    const data = loadRoom(id);
    if (!data || !GAMES[data.game]) continue;
    const cap = data.capacity || GAMES[data.game].capacity || 2;
    const r = new Room(id, data.game, null, data.names[0], cap);
    r.names = data.names;
    r.tokens = data.tokens;
    r.state = data.state;
    r.lastActive = data.lastActive;
    // 牌类: 重建按人视图 (磁盘上不存 _views)
    const mod = GAMES[data.game].mod;
    if (r.state && r.state.hands && mod && mod.buildViews) mod.buildViews(r.state);
    rooms.set(id, r);
    count++;
  }
  console.log('[persist] recovered ' + count + ' rooms');
}

class Room {
  constructor(id, game, ws, name, capacity) {
    this.id = id;
    this.game = game;
    this.capacity = capacity || GAMES[game].capacity || 2;
    this.players = new Array(this.capacity).fill(null);
    this.tokens = [];
    this.names = [];
    this.state = null;
    this.lastActive = Date.now();
    for (let i = 0; i < this.capacity; i++) {
      this.tokens.push(genToken());
      this.names.push('');
    }
    if (ws) {
      this.players[0] = ws;
      this.names[0] = name || '房主';
    }
  }
  liveCount() { return this.players.filter(p => p && p.readyState === WebSocket.OPEN).length; }
  slotCount() { return this.players.filter(p => p !== null).length; }
  isFull() { return this.players.every(p => p !== null); }
  addPlayer(ws, name) {
    for (let i = 0; i < this.capacity; i++) {
      if (this.players[i] === null) {
        this.players[i] = ws;
        this.names[i] = name || ('玩家' + (i + 1));
        ws.room = this; ws.seat = i;
        return i;
      }
    }
    return -1;
  }
}

// ---------- handlers ----------


function handleMessage(ws, raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  if (msg.ping) { send(ws, { type: 'pong', t: Date.now() }); return; }

  const room = ws.room;

  switch (msg.type) {
    case 'create': {
      const game = msg.game;
      if (!game || !GAMES[game]) return send(ws, { type: 'error', msg: '未知游戏' });
      if (room) return send(ws, { type: 'error', msg: '已在房间中' });
      let cap = GAMES[game].capacity || 2;
      if (GAMES[game].customCapacity) {
        cap = Math.min(5, Math.max(2, parseInt(msg.playerCount) || 2));
      }
      const nr = new Room(genRoomId(), game, ws, sanitizeName(msg.name), cap);
      rooms.set(nr.id, nr);
      ws.room = nr;
      ws.seat = 0;
      send(ws, { type: 'created', room: nr.id, game, player: 1, token: nr.tokens[0], name: nr.names[0], capacity: nr.capacity });
      break;
    }
    case 'join': {
      const rid = String(msg.room || '').trim();
      const r = rooms.get(rid);
      if (!r) return send(ws, { type: 'notfound', room: rid });
      if (msg.game && r.game !== msg.game) return send(ws, { type: 'wronggame', room: rid, game: r.game });
      if (r.isFull()) return send(ws, { type: 'full', room: rid });
      const slot = r.addPlayer(ws, sanitizeName(msg.name));
      if (slot < 0) return send(ws, { type: 'full', room: rid });
      r.tokens[slot] = genToken(); // 重新生成token，防止旧占用者抢占座位
      r.lastActive = Date.now();
      saveRoom(r);
      send(ws, {
        type: 'joined', room: rid, game: r.game, player: slot + 1,
        token: r.tokens[slot], name: r.names[slot], capacity: r.capacity,
        names: r.names, state: buildView(r.state, slot, r.capacity),
      });
      // notify others (不发state: 原始state含所有人手牌, 且客户端不需要)
      for (let i = 0; i < r.capacity; i++) {
        if (i !== slot && r.players[i] && r.players[i].readyState === WebSocket.OPEN) {
          send(r.players[i], {
            type: 'playerJoined', seat: slot + 1, name: r.names[slot],
            names: r.names, capacity: r.capacity,
          });
        }
      }
      // auto-start when room is full
      if (r.isFull()) {
        const mod = GAMES[r.game].mod;
        if (mod && !r.state) {
          r.state = mod.create(r.capacity);
          saveRoom(r);
          for (let i = 0; i < r.capacity; i++) {
            const ws2 = r.players[i];
            if (ws2 && ws2.readyState === WebSocket.OPEN) {
              send(ws2, {
                type: 'start', game: r.game, player: i + 1,
                capacity: r.capacity, state: buildView(r.state, i, r.capacity),
                names: r.names,
                opponents: r.names.filter((n, idx) => idx !== i && n),
              });
            }
          }
        }
      }
      break;
    }
    case 'resume': {
      const rid = String(msg.room || '').trim();
      const r = rooms.get(rid);
      if (!r) return send(ws, { type: 'notfound', room: rid });
      let idx = -1;
      for (let i = 0; i < r.tokens.length; i++) {
        if (r.tokens[i] === msg.token) { idx = i; break; }
      }
      if (idx < 0) return send(ws, { type: 'forbidden' });
      if (r.players[idx] && r.players[idx] !== ws) {
        // 先解除旧连接的room/seat绑定, 防止其close事件把新连接踢出座位(刷新竞态)
        const old = r.players[idx];
        old.room = null; old.seat = undefined;
        try { old.close(1000, 'replaced'); } catch {}
      }
      r.players[idx] = ws;
      ws.room = r; ws.seat = idx;
      send(ws, {
        type: 'resumed', room: rid, game: r.game, you: idx + 1,
        name: r.names[idx], capacity: r.capacity, state: buildView(r.state, idx, r.capacity),
        names: r.names, opponentNames: r.names.filter((n, i) => i !== idx && n),
      });
      const other = r.players.find((p, i) => i !== idx && p && p.readyState === WebSocket.OPEN);
      if (other) send(other, { type: 'opponentReconnected', seat: idx + 1 });
      break;
    }
    case 'move': {
      if (!room) return send(ws, { type: 'error', msg: '不在房间中' });
      if (!room.state) return send(ws, { type: 'error', msg: '对局尚未开始' });
      if (ws.seat == null) return send(ws, { type: 'error', msg: '座位信息异常，请重新进入房间' }); // 防御: seat缺失时player=NaN
      const seat = ws.seat;
      const mod = room.game ? GAMES[room.game].mod : null;
      if (mod) {
        const player = seat + 1;
        const res = mod.applyMove(room.state, player, msg.move || msg);
        if (!res.ok) return send(ws, { type: 'error', msg: res.errors.join('；') });
      }
      room.lastActive = Date.now();
      saveRoom(room);
      broadState(room);
      break;
    }
    case 'select': {
      if (!room || room.game !== 'xiangqi' || !room.state) return;
      const seat = ws.seat;
      const player = seat + 1;
      if (room.state.gameover || room.state.turn !== player) return;
      const fromObj = msg.from || {};
      const fx = +fromObj.x, fy = +fromObj.y;
      const h = GAMES.xiangqi.mod.hints(room.state.board, player)
        .filter(m => m.from.x === fx && m.from.y === fy);
      send(ws, { type: 'hints', from: { x: fx, y: fy }, to: h.map(m => m.to) });
      break;
    }
    case 'hint': {
      if (!room) return send(ws, { type: 'error', msg: '不在房间中' });
      if (!room.state) return send(ws, { type: 'error', msg: '对局尚未开始' });
      if (ws.seat == null) return send(ws, { type: 'error', msg: '座位信息异常，请重新进入房间' });
      const mod = room.game ? GAMES[room.game].mod : null;
      if (!mod || !mod.hint) return send(ws, { type: 'error', msg: '该游戏不支持提示' });
      const seat = ws.seat;
      const res = mod.hint(room.state, seat + 1);
      if (!res.ok) return send(ws, { type: 'error', msg: res.errors.join('；') });
      // 私发提示结果
      send(ws, { type: 'hintResult', cards: res.cards, seat: seat + 1 });
      // 全房广播提示使用 (防静默作弊)
      broadAll(room, { type: 'hintUsed', seat: seat + 1, name: room.names[seat] });
      break;
    }
    case 'pass': {
      if (!room || !room.state) return;
      const seat = ws.seat;
      const player = seat + 1;
      const mod = room.game ? GAMES[room.game].mod : null;
      if (!mod || !mod.pass) return; // 仅围棋支持pass消息; 牌类走move.action=pass
      const res = mod.pass(room.state, player);
      if (!res.ok) return send(ws, { type: 'error', msg: res.errors.join('；') });
      room.lastActive = Date.now();
      saveRoom(room);
      broadState(room);
      break;
    }
    case 'markDead': {
      if (!room || room.game !== 'go' || !room.state) return;
      const seat = ws.seat;
      const player = seat + 1;
      const res = GAMES.go.mod.markDead(room.state, player, msg);
      if (!res.ok) return send(ws, { type: 'error', msg: res.errors.join('；') });
      room.lastActive = Date.now();
      saveRoom(room);
      broadState(room);
      break;
    }
    case 'confirmScore': {
      if (!room || room.game !== 'go' || !room.state) return;
      const seat = ws.seat;
      const player = seat + 1;
      const res = GAMES.go.mod.confirmScore(room.state, player);
      if (!res.ok) return send(ws, { type: 'error', msg: res.errors.join('；') });
      saveRoom(room);
      broadState(room);
      break;
    }
    case 'resumeGame': {
      if (!room || room.game !== 'go' || !room.state) return;
      const seat = ws.seat;
      const player = seat + 1;
      const res = GAMES.go.mod.resume(room.state, player);
      if (!res.ok) return send(ws, { type: 'error', msg: res.errors.join('；') });
      saveRoom(room);
      broadState(room);
      break;
    }
    case 'resign': {
      if (!room) return send(ws, { type: 'error', msg: '不在房间中' });
      if (!room.state) return send(ws, { type: 'error', msg: '对局尚未开始' });
      const mod = room.game ? GAMES[room.game].mod : null;
      if (mod) {
        const seat = ws.seat;
        const player = seat + 1;
        const res = mod.resign(room.state, player);
        if (!res.ok) return send(ws, { type: 'error', msg: res.errors.join('；') });
      }
      room.lastActive = Date.now();
      saveRoom(room);
      broadState(room);
      break;
    }
    case 'rematch': {
      if (!room) return send(ws, { type: 'error', msg: '不在房间中' });
      if (!room.state || !room.state.gameover) return send(ws, { type: 'error', msg: '对局尚未结束' });
      const mod = room.game ? GAMES[room.game].mod : null;
      if (mod) room.state = mod.create(room.capacity, room.state); // 第二参数传旧局, 斗地主用于保留积分
      else room.state = null;
      saveRoom(room);
      for (let i = 0; i < room.capacity; i++) {
        const ws2 = room.players[i];
        if (ws2 && ws2.readyState === WebSocket.OPEN) {
          send(ws2, { type: 'rematch', state: buildView(room.state, i, room.capacity) });
        }
      }
      break;
    }
    case 'destroy': {
      if (!room) return send(ws, { type: 'error', msg: '不在房间中' });
      broadAll(room, { type: 'roomDestroyed' });
      for (const ws2 of room.players) {
        if (ws2) { ws2.room = null; ws2.seat = undefined; }
      }
      deleteRoomFile(room.id);
      rooms.delete(room.id);
      break;
    }
    case 'leave': {
      if (room) closeRoom(room, 'leave');
      break;
    }
  }
}

function closeRoom(room, reason) {
  // leave = 永久离开: 彻底销毁(内存+磁盘), 防止文件泄漏
  for (const ws of room.players) {
    if (ws) { ws.room = null; ws.seat = undefined; }
    if (ws && ws.readyState === WebSocket.OPEN) ws.close(1000, reason);
  }
  deleteRoomFile(room.id);
  rooms.delete(room.id);
}

function onClose(ws) {
  if (!ws.room) return;
  const room = ws.room;
  ws.room = null; ws.seat = undefined; // 防重复close
  const idx = room.players.indexOf(ws);
  if (idx >= 0 && idx < room.players.length) room.players[idx] = null;
  const others = room.players.filter((p, i) => i !== idx && p && p.readyState === WebSocket.OPEN);
  for (const o of others) send(o, { type: 'opponentLeft', who: idx + 1 });
  if (room.liveCount() === 0) {
    // 全员断开: 保留内存+磁盘(TTL统一清理), 支持断线重连resume
    saveRoom(room);
  }
}

// ---------- HTTP ----------
const server = http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent((req.url || '/').split('?')[0]); }
  catch { res.writeHead(400); res.end('Bad Request'); return; } // 畸形URL不致崩溃
  if (urlPath === '/' || urlPath === '/index.html') urlPath = '/index.html';
  let file;
  if (urlPath === '/lib/cards.js') file = path.join(ROOT, 'lib', 'cards.js'); // 仅放行客户端需要的同构引擎
  else if (urlPath.startsWith('/res/')) file = path.join(ROOT, urlPath);
  else file = path.join(PUB, urlPath);
  file = path.normalize(file);
  const allowLib = path.join(ROOT, 'lib', 'cards.js');
  if (!file.startsWith(PUB) && !file.startsWith(path.join(ROOT, 'res')) && file !== allowLib) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('404'); return; }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
});

const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  ws.on('message', (data) => { try { handleMessage(ws, data.toString()); } catch (e) { console.error(e); } });
  ws.on('close', () => onClose(ws));
  ws.on('error', () => {});
});

setInterval(() => { for (const ws of wss.clients) { if (ws.readyState === WebSocket.OPEN) try { ws.ping(); } catch {} } }, 20000);

loadAllRooms();

const ROOM_TTL_MS = 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, r] of rooms) {
    if (r.liveCount() === 0 && now - r.lastActive > ROOM_TTL_MS) {
      deleteRoomFile(id); rooms.delete(id);
      console.log('[cleanup] room ' + id + ' expired');
    }
  }
}, CLEANUP_INTERVAL_MS);

server.listen(PORT, () => { console.log('JiegeChess started: http://localhost:' + PORT); });