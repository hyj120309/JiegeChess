'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const GAMES = {
  gomoku: require('./lib/gomoku'),
  xiangqi: require('./lib/xiangqi'),
  go: require('./lib/go'),
};
const ROOT = __dirname;
const PUB = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data', 'rooms');
const PORT = process.env.PORT || 8080;

fs.mkdirSync(DATA_DIR, { recursive: true });

const rooms = new Map();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

function send(ws, payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcast(room, payload, except) {
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

function broadState(room) {
  broadcast(room, { type: 'state', state: room.state });
}

// ---------- file persistence ----------
function roomPath(id) { return path.join(DATA_DIR, id + '.json'); }

function saveRoom(room) {
  const data = {
    id: room.id,
    game: room.game,
    names: room.names,
    tokens: room.tokens,
    state: room.state,
    lastActive: room.lastActive,
  };
  try {
    fs.writeFileSync(roomPath(room.id), JSON.stringify(data), 'utf8');
  } catch (e) {
    console.error('[persist] 写入失败', room.id, e.message);
  }
}

function loadRoom(id) {
  try {
    const raw = fs.readFileSync(roomPath(id), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
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
    if (!data) continue;
    if (!GAMES[data.game]) continue;
    const r = new Room(id, data.game, null, data.names[0]);
    r.names = data.names;
    r.tokens = data.tokens;
    r.state = data.state;
    r.lastActive = data.lastActive;
    rooms.set(id, r);
    count++;
  }
  console.log(`[persist] 从磁盘恢复了 ${count} 个房间`);
}

class Room {
  constructor(id, game, ws, name) {
    this.id = id;
    this.game = game;
    this.players = [ws, null];
    this.tokens = [genToken(), genToken()];
    this.names = [name || '房主', name ? `玩家${name}` : '玩家2'];
    this.state = GAMES[game].create();
    this.lastActive = Date.now();
  }
  liveCount() {
    return this.players.filter(p => p && p.readyState === WebSocket.OPEN).length;
  }
}

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
      const nr = new Room(genRoomId(), game, ws, msg.name);
      rooms.set(nr.id, nr);
      ws.room = nr;
      saveRoom(nr);
      send(ws, {
        type: 'created', room: nr.id, game, player: 1,
        token: nr.tokens[0], name: nr.names[0],
      });
      break;
    }
    case 'join': {
      const rid = String(msg.room || '').trim();
      const r = rooms.get(rid);
      if (!r) return send(ws, { type: 'notfound', room: rid });
      if (msg.game && r.game !== msg.game) return send(ws, { type: 'wronggame', room: rid, game: r.game });
      if (r.players[1] && r.players[1].readyState === WebSocket.OPEN)
        return send(ws, { type: 'full', room: rid });
      if (r.players[0] && r.players[0].readyState === WebSocket.OPEN && r.players[0] === ws)
        return send(ws, { type: 'error', msg: '你已在房间中' });
      r.players[1] = ws;
      r.names[1] = msg.name || '玩家2';
      r.tokens[1] = genToken();
      ws.room = r;
      r.lastActive = Date.now();
      saveRoom(r);
      send(ws, {
        type: 'joined', room: rid, game: r.game, player: 2,
        token: r.tokens[1], name: r.names[1], state: r.state,
        opponentName: r.names[0],
      });
      send(r.players[0], {
        type: 'opponentJoined', game: r.game, opponentName: r.names[1], state: r.state,
      });
      break;
    }
    case 'resume': {
      const rid = String(msg.room || '').trim();
      const r = rooms.get(rid);
      if (!r) return send(ws, { type: 'notfound', room: rid });
      let idx = r.tokens[0] === msg.token ? 0 : r.tokens[1] === msg.token ? 1 : -1;
      if (idx < 0) return send(ws, { type: 'forbidden' });
      // 强制替换旧连接（支持刷新页面重连）
      if (r.players[idx] && r.players[idx] !== ws) {
        try { r.players[idx].close(1000, 'replaced'); } catch {}
      }
      r.players[idx] = ws;
      ws.room = r;
      send(ws, {
        type: 'resumed', room: rid, game: r.game, you: idx + 1,
        name: r.names[idx], state: r.state,
        opponentName: r.names[idx === 0 ? 1 : 0],
      });
      const other = r.players[idx === 0 ? 1 : 0];
      if (other && other.readyState === WebSocket.OPEN)
        send(other, { type: 'opponentReconnected' });
      break;
    }
    case 'move': {
      if (!room) return send(ws, { type: 'error', msg: '不在房间中' });
      const mod = GAMES[room.game];
      const player = room.players[0] === ws ? 1 : 2;
      const res = mod.applyMove(room.state, player, msg.move || msg);
      if (!res.ok) return send(ws, { type: 'error', msg: res.errors.join('；'), errors: res.errors });
      room.lastActive = Date.now();
      saveRoom(room);
      broadState(room);
      break;
    }
    case 'select': {
      if (!room || room.game !== 'xiangqi') return;
      const player = room.players[0] === ws ? 1 : 2;
      if (room.state.gameover || room.state.turn !== player) return;
      const allMoves = GAMES.xiangqi.hints(room.state.board, player);
      const h = allMoves.filter(m => m.from.x === msg.from?.x && m.from.y === msg.from?.y);
      console.log(`[xiangqi] select: player=${player} turn=${room.state.turn} from=(${msg.from?.x},${msg.from?.y}) piece=${room.state.board[msg.from?.y]?.[msg.from?.x]} allMoves=${allMoves.length} filtered=${h.length}`);
      send(ws, { type: 'hints', from: msg.from, to: h.map(m => m.to) });
      break;
    }
    case 'pass': {
      if (!room || room.game !== 'go') return;
      const player = room.players[0] === ws ? 1 : 2;
      const res = GAMES.go.pass(room.state, player);
      if (!res.ok) return send(ws, { type: 'error', msg: res.errors.join('；') });
      room.lastActive = Date.now();
      saveRoom(room);
      broadState(room);
      break;
    }
    case 'markDead': {
      if (!room || room.game !== 'go') return;
      const player = room.players[0] === ws ? 1 : 2;
      const res = GAMES.go.markDead(room.state, player, msg);
      if (!res.ok) return send(ws, { type: 'error', msg: res.errors.join('；') });
      room.lastActive = Date.now();
      saveRoom(room);
      broadState(room);
      break;
    }
    case 'confirmScore': {
      if (!room || room.game !== 'go') return;
      const player = room.players[0] === ws ? 1 : 2;
      const res = GAMES.go.confirmScore(room.state, player);
      if (!res.ok) return send(ws, { type: 'error', msg: res.errors.join('；') });
      saveRoom(room);
      broadState(room);
      break;
    }
    case 'resumeGame': {
      if (!room || room.game !== 'go') return;
      const player = room.players[0] === ws ? 1 : 2;
      const res = GAMES.go.resume(room.state, player);
      if (!res.ok) return send(ws, { type: 'error', msg: res.errors.join('；') });
      saveRoom(room);
      broadState(room);
      break;
    }
    case 'resign': {
      if (!room) return send(ws, { type: 'error', msg: '不在房间中' });
      const mod = GAMES[room.game];
      const player = room.players[0] === ws ? 1 : 2;
      const res = mod.resign(room.state, player);
      if (!res.ok) return send(ws, { type: 'error', msg: res.errors.join('；') });
      saveRoom(room);
      broadState(room);
      break;
    }
    case 'rematch': {
      if (!room) return send(ws, { type: 'error', msg: '不在房间中' });
      if (!room.state.gameover) return send(ws, { type: 'error', msg: '对局尚未结束' });
      room.state = GAMES[room.game].create();
      room.lastActive = Date.now();
      saveRoom(room);
      broadcast(room, { type: 'rematch', state: room.state });
      break;
    }
    case 'destroy': {
      if (!room) return send(ws, { type: 'error', msg: '不在房间中' });
      broadcast(room, { type: 'roomDestroyed' });
      for (const ws2 of room.players) {
        if (ws2) { ws2.room = null; ws2.close(1000, 'destroyed'); }
      }
      deleteRoomFile(room.id);
      rooms.delete(room.id);
      console.log(`[destroy] 房间 ${room.id} 被用户主动销毁`);
      break;
    }
    case 'leave': {
      if (room) closeRoom(room, 'leave');
      break;
    }
    default:
      break;
  }
}

function closeRoom(room, reason) {
  saveRoom(room);
  for (const ws of room.players) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.close(1000, reason);
  }
  rooms.delete(room.id);
}

function onClose(ws) {
  if (!ws.room) return;
  const room = ws.room;
  const idx = room.players.indexOf(ws);
  if (idx >= 0) room.players[idx] = null;
  const other = room.players[idx === 0 ? 1 : 0];
  if (other && other.readyState === WebSocket.OPEN)
    send(other, { type: 'opponentLeft', who: idx + 1 });
  if (!room.players[0] && !room.players[1]) {
    saveRoom(room);
    rooms.delete(room.id);
  }
}

// ---------- HTTP static server ----------
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/' || urlPath === '/index.html') urlPath = '/index.html';

  let file;
  if (urlPath.startsWith('/res/')) {
    file = path.join(ROOT, urlPath);
  } else {
    file = path.join(PUB, urlPath);
  }
  file = path.normalize(file);

  if (!file.startsWith(PUB) && !file.startsWith(path.join(ROOT, 'res'))) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  });
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    try { handleMessage(ws, data.toString()); } catch (e) { console.error(e); }
  });
  ws.on('close', () => onClose(ws));
  ws.on('error', () => {});
});

// keepalive
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.ping(); } catch {}
    }
  }
}, 20000);

// restore persisted rooms
loadAllRooms();

// TTL cleanup
const ROOM_TTL_MS = 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms) {
    const live = room.liveCount();
    if (live === 0 && now - room.lastActive > ROOM_TTL_MS) {
      deleteRoomFile(id);
      rooms.delete(id);
      console.log(`[cleanup] 房间 ${id} (${room.game}) 已过期销毁`);
    }
  }
}, CLEANUP_INTERVAL_MS);

server.listen(PORT, () => {
  console.log(`JiegeChess 服务器已启动: http://localhost:${PORT}`);
});
