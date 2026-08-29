'use strict';
const SIZE = 15;
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

function empty() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function create() {
  return {
    board: empty(),
    turn: 1,
    gameover: false,
    winner: 0,
    win: null,
    last: null,
    winType: ''
  };
}

function checkWin(board, x, y) {
  const c = board[y][x];
  if (!c) return null;
  for (const [dx, dy] of DIRS) {
    const cells = [[x, y]];
    for (const s of [1, -1]) {
      let cx = x + dx * s, cy = y + dy * s;
      while (cx >= 0 && cy >= 0 && cx < SIZE && cy < SIZE && board[cy][cx] === c) {
        cells.push({ x: cx, y: cy });
        cx += dx * s;
        cy += dy * s;
      }
    }
    if (cells.length >= 5) return cells;
  }
  return null;
}

function applyMove(state, player, move) {
  const errs = [];
  if (state.gameover) errs.push('对局已结束');
  else if (player !== state.turn) errs.push('还没轮到你');
  if (errs.length) return { ok: false, errors: errs };

  const x = move.x, y = move.y;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= SIZE || y >= SIZE)
    return { ok: false, errors: ['坐标越界'] };
  if (state.board[y][x] !== 0) return { ok: false, errors: ['该位置已有棋子'] };

  state.board[y][x] = player;
  state.last = { x, y };
  const win = checkWin(state.board, x, y);
  state.turn = state.turn === 1 ? 2 : 1;
  if (win) {
    state.gameover = true;
    state.winner = player;
    state.win = win;
    state.winType = 'win';
  } else if (state.board.every(r => r.every(v => v !== 0))) {
    state.gameover = true;
    state.winner = 0;
    state.winType = 'draw';
  }
  return { ok: true };
}

function resign(state, player) {
  if (state.gameover) return { ok: false, errors: ['对局已结束'] };
  state.gameover = true;
  state.winner = player === 1 ? 2 : 1;
  state.winType = 'resign';
  return { ok: true };
}

module.exports = { name: 'gomoku', title: '五子棋', SIZE, create, applyMove, resign };