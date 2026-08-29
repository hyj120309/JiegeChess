'use strict';
const COLS = 9, ROWS = 10;
const INIT = [
  'rheakaehr',
  '.........',
  '.c.....c.',
  'p.p.p.p.p',
  '.........',
  '.........',
  'P.P.P.P.P',
  '.C.....C.',
  '.........',
  'RHEAKAEHR'
];
const PIECE_NAMES = {
  K: '帅', k: '将',
  A: '仕', a: '士',
  E: '相', e: '象',
  H: '马', h: '马',
  R: '车', r: '车',
  C: '炮', c: '炮',
  P: '兵', p: '卒'
};

function empty() { return INIT.map(r => r.split('')); }

function create() {
  return {
    board: empty(),
    turn: 1,
    gameover: false,
    winner: 0,
    winType: '',
    check: false,
    last: null
  };
}

function sideOf(ch) { return ch === '.' ? null : (ch >= 'A' && ch <= 'Z' ? 'red' : 'black'); }
function otherSide(s) { return s === 'red' ? 'black' : 'red'; }
function sameSide(a, b) { return a !== '.' && b !== '.' && sideOf(a) === sideOf(b); }
function inBoard(x, y) { return x >= 0 && y >= 0 && x < COLS && y < ROWS; }
function inPalace(side, x, y) {
  return (side === 'red' ? y >= 7 && y <= 9 : y >= 0 && y <= 2) && x >= 3 && x <= 5;
}
function crossedRiver(ch, y) { return sideOf(ch) === 'red' ? y <= 4 : y >= 5; }

function genMoves(board, x, y) {
  const ch = board[y][x];
  const out = [];
  if (ch === '.') return out;
  const push = (tx, ty) => {
    if (inBoard(tx, ty) && !sameSide(ch, board[ty][tx])) out.push([tx, ty]);
  };
  const t = ch.toLowerCase();
  switch (t) {
    case 'k': {
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]])
        if (inPalace(sideOf(ch), x + dx, y + dy)) push(x + dx, y + dy);
      break;
    }
    case 'a': {
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]])
        if (inPalace(sideOf(ch), x + dx, y + dy)) push(x + dx, y + dy);
      break;
    }
    case 'e': {
      for (const [dx, dy] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) {
        const tx = x + dx, ty = y + dy, mx = x + dx / 2, my = y + dy / 2;
        if (!inBoard(tx, ty) || board[my][mx] !== '.') continue;
        const ok = sideOf(ch) === 'red' ? ty >= 5 : ty <= 4;
        if (ok) push(tx, ty);
      }
      break;
    }
    case 'h': {
      // leg directions: [legDx, legDy, dx, dy]
      const legs = [[0, 1, 1, 2], [0, 1, -1, 2], [0, -1, 1, -2], [0, -1, -1, -2],
        [1, 0, 2, 1], [1, 0, 2, -1], [-1, 0, -2, 1], [-1, 0, -2, -1]];
      for (const [lx, ly, dx, dy] of legs) {
        if (inBoard(x + lx, y + ly) && board[y + ly][x + lx] === '.') push(x + dx, y + dy);
      }
      break;
    }
    case 'r': {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let tx = x + dx, ty = y + dy;
        while (inBoard(tx, ty)) {
          if (board[ty][tx] === '.') push(tx, ty);
          else { if (!sameSide(ch, board[ty][tx])) push(tx, ty); break; }
          tx += dx; ty += dy;
        }
      }
      break;
    }
    case 'c': {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let tx = x + dx, ty = y + dy;
        while (inBoard(tx, ty) && board[ty][tx] === '.') { push(tx, ty); tx += dx; ty += dy; }
        tx += dx; ty += dy;
        while (inBoard(tx, ty)) {
          if (board[ty][tx] !== '.') { if (!sameSide(ch, board[ty][tx])) push(tx, ty); break; }
          tx += dx; ty += dy;
        }
      }
      break;
    }
    case 'p': {
      const rs = sideOf(ch);
      if (rs === 'red') {
        push(x, y - 1);
        if (crossedRiver(ch, y)) { push(x - 1, y); push(x + 1, y); }
      } else {
        push(x, y + 1);
        if (crossedRiver(ch, y)) { push(x - 1, y); push(x + 1, y); }
      }
      break;
    }
  }
  return out;
}

function flyingFace(board, side) {
  // enemy general faces own general on empty column
  const k = side === 'red' ? 'k' : 'K';
  const K = side === 'red' ? 'K' : 'k';
  for (let x = 0; x < COLS; x++) {
    const occ = [];
    for (let y = 0; y < ROWS; y++) if (board[y][x] === k || board[y][x] === K) occ.push([x, y]);
    if (occ.length === 2) {
      const [a, b] = occ.sort((p, q) => p[1] - q[1]);
      let clear = true;
      for (let y = a[1] + 1; y < b[1]; y++) if (board[y][x] !== '.') { clear = false; break; }
      if (clear) return true;
    }
  }
  return false;
}

function isAttacked(board, tx, ty, bySide) {
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const ch = board[y][x];
    if (ch === '.' || sideOf(ch) !== bySide) continue;
    if (ch.toLowerCase() === 'k' && flyingFace(board, bySide)) return true;
    if (genMoves(board, x, y).some(([xx, yy]) => xx === tx && yy === ty)) return true;
  }
  return false;
}

function findKing(board, side) {
  const k = side === 'red' ? 'K' : 'k';
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++)
    if (board[y][x] === k) return { x, y };
  return null;
}

function legalMoves(board, side) {
  const moves = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const ch = board[y][x];
    if (ch === '.' || sideOf(ch) !== side) continue;
    for (const [tx, ty] of genMoves(board, x, y)) {
      const b = board.map(r => r.slice());
      b[ty][tx] = ch; b[y][x] = '.';
      const king = findKing(b, side);
      if (!isAttacked(b, king.x, king.y, otherSide(side)) && !flyingFace(b, side))
        moves.push({ from: { x, y }, to: { x: tx, y: ty }, piece: ch, captured: board[ty][tx] });
    }
  }
  return moves;
}

function hints(board, player) {
  const side = player === 1 ? 'red' : 'black';
  return legalMoves(board, side).map(m => ({ from: m.from, to: m.to }));
}

function applyMove(state, player, move) {
  const errs = [];
  if (state.gameover) errs.push('对局已结束');
  else if (player !== state.turn) errs.push('还没轮到你');
  if (errs.length) return { ok: false, errors: errs };

  const { from, to } = move;
  const side = player === 1 ? 'red' : 'black';
  if (!from || !to) return { ok: false, errors: ['参数错误'] };
  const ch = state.board[from.y]?.[from.x];
  if (!ch || ch === '.' || sideOf(ch) !== side) return { ok: false, errors: ['请选择自己的棋子'] };
  if (!inBoard(to.x, to.y)) return { ok: false, errors: ['目标位置越界'] };

  const mv = legalMoves(state.board, side).find(
    m => m.from.x === from.x && m.from.y === from.y && m.to.x === to.x && m.to.y === to.y
  );
  if (!mv) return { ok: false, errors: ['该走法不符合象棋规则'] };

  state.board[to.y][to.x] = ch;
  state.board[from.y][from.x] = '.';
  state.last = { from, to, piece: ch };
  state.turn = player === 1 ? 2 : 1;

  const opp = otherSide(side);
  const oppMoves = legalMoves(state.board, opp);
  const oppKing = findKing(state.board, opp);
  state.check = !!(oppKing && isAttacked(state.board, oppKing.x, oppKing.y, side));
  if (oppMoves.length === 0) {
    state.gameover = true;
    state.winner = player;
    state.winType = state.check ? 'checkmate' : 'stalemate';
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

module.exports = {
  name: 'xiangqi', title: '中国象棋', COLS, ROWS, PIECE_NAMES,
  create, applyMove, resign, hints, legalMoves, genMoves, isAttacked, sideOf
};