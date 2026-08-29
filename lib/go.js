'use strict';
const SIZE = 19;
const KOMI = 0.5;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function empty() { return Array.from({ length: SIZE }, () => Array(SIZE).fill(0)); }

function create() {
  return {
    board: empty(),
    turn: 1,
    caps: { 1: 0, 2: 0 },
    passCount: 0,
    ko: null,
    last: null,
    phase: 'play',            // 'play' | 'scoring'
    dead: [],                 // [{x,y,color}]
    confirmed: { 1: false, 2: false },
    gameover: false,
    winner: 0,
    winType: '',
    score: null,
    resign: null
  };
}

function clone(b) { return b.map(r => r.slice()); }

function group(board, x, y) {
  const color = board[y][x];
  if (!color) return null;
  const cells = [], libs = new Set(), seen = new Set();
  const stack = [[x, y]];
  seen.add(y * SIZE + x);
  while (stack.length) {
    const [cx, cy] = stack.pop();
    cells.push([cx, cy]);
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
      const v = board[ny][nx];
      if (v === color) { const k = ny * SIZE + nx; if (!seen.has(k)) { seen.add(k); stack.push([nx, ny]); } }
      else if (v === 0) libs.add(ny * SIZE + nx);
    }
  }
  return { cells, libs };
}

function applyMove(state, player, move) {
  const errs = [];
  if (state.gameover) errs.push('对局已结束');
  else if (state.phase !== 'play') errs.push('当前不是落子阶段');
  else if (player !== state.turn) errs.push('还没轮到你');
  if (errs.length) return { ok: false, errors: errs };

  const { x, y } = move;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= SIZE || y >= SIZE)
    return { ok: false, errors: ['坐标越界'] };
  if (state.board[y][x] !== 0) return { ok: false, errors: ['该位置已有棋子'] };
  if (state.ko && state.ko.x === x && state.ko.y === y) return { ok: false, errors: ['劫争：暂时不能在此落子'] };

  const b = clone(state.board);
  b[y][x] = player;
  const opp = player === 1 ? 2 : 1;
  const captured = [];
  for (const [dx, dy] of DIRS) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
    if (b[ny][nx] === opp) {
      const g = group(b, nx, ny);
      if (g && g.libs.size === 0) captured.push(...g.cells);
    }
  }
  for (const [cx, cy] of captured) b[cy][cx] = 0;
  const own = group(b, x, y);
  if (own && own.libs.size === 0) return { ok: false, errors: ['禁入点：自杀'] };

  state.board = b;
  state.last = { x, y, color: player };
  state.caps[player] += captured.length;
  state.ko = captured.length === 1 ? { x: captured[0][0], y: captured[0][1] } : null;
  state.passCount = 0;
  state.turn = opp;
  state.confirmed = { 1: false, 2: false };
  return { ok: true };
}

function pass(state, player) {
  const errs = [];
  if (state.gameover) errs.push('对局已结束');
  else if (state.phase !== 'play') errs.push('当前不是落子阶段');
  else if (player !== state.turn) errs.push('还没轮到你');
  if (errs.length) return { ok: false, errors: errs };

  state.ko = null;
  state.passCount += 1;
  state.last = null;
  state.turn = player === 1 ? 2 : 1;
  if (state.passCount >= 2) state.phase = 'scoring';
  return { ok: true };
}

function markDead(state, player, point) {
  const errs = [];
  if (state.gameover) errs.push('对局已结束');
  else if (state.phase !== 'scoring') errs.push('当前不是计分阶段');
  else if (point.x === undefined || point.y === undefined) errs.push('参数错误');
  if (errs.length) return { ok: false, errors: errs };

  const { x, y, dead } = point;
  const v = state.board[y]?.[x];
  if (!v) return { ok: false, errors: ['该位置没有棋子'] };
  const idx = state.dead.findIndex(d => d.x === x && d.y === y);
  const isDead = idx >= 0;
  if (dead === isDead) return { ok: false, errors: ['状态未变化'] };
  if (dead) state.dead.push({ x, y, color: v });
  else state.dead.splice(idx, 1);
  state.confirmed = { 1: false, 2: false };
  return { ok: true };
}

function confirmScore(state, player) {
  if (state.phase !== 'scoring') return { ok: false, errors: ['当前不是计分阶段'] };
  state.confirmed[player] = true;
  if (state.confirmed[1] && state.confirmed[2]) {
    computeScore(state);
    state.gameover = true;
    state.winType = 'score';
  }
  return { ok: true };
}

function resume(state, player) {
  if (state.phase !== 'scoring') return { ok: false, errors: ['当前不是计分阶段'] };
  state.phase = 'play';
  state.passCount = 0;
  state.ko = null;
  state.confirmed = { 1: false, 2: false };
  // turn remains the player whose turn it was after the double pass
  return { ok: true };
}

function resign(state, player) {
  if (state.gameover) return { ok: false, errors: ['对局已结束'] };
  state.gameover = true;
  state.winner = player === 1 ? 2 : 1;
  state.winType = 'resign';
  state.resign = player;
  return { ok: true };
}

function computeScore(state) {
  const b = clone(state.board);
  for (const d of state.dead) b[d.y][d.x] = 0;
  const seen = new Set();
  let stone1 = 0, stone2 = 0, terr1 = 0, terr2 = 0;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const v = b[y][x];
    if (v === 1) stone1++;
    else if (v === 2) stone2++;
    else if (v === 0 && !seen.has(y * SIZE + x)) {
      const queue = [[x, y]];
      seen.add(y * SIZE + x);
      const touched = new Set();
      let n = 0;
      while (queue.length) {
        const [cx, cy] = queue.shift();
        n++;
        for (const [dx, dy] of DIRS) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
          const w = b[ny][nx];
          if (w === 0) { const k = ny * SIZE + nx; if (!seen.has(k)) { seen.add(k); queue.push([nx, ny]); } }
          else touched.add(w);
        }
      }
      if (touched.size === 1) { const o = [...touched][0]; if (o === 1) terr1 += n; else terr2 += n; }
    }
  }
  const black = stone1 + terr1;
  const white = stone2 + terr2 + KOMI;
  state.score = { black, white, stone1, stone2, terr1, terr2, komi: KOMI };
  state.winner = black > white ? 1 : white > black ? 2 : 0;
}

module.exports = {
  name: 'go', title: '围棋', SIZE, KOMI,
  create, applyMove, pass, markDead, confirmScore, resume, resign, computeScore
};