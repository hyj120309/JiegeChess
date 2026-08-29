const COLS = 9, ROWS = 10;
const M = 48, CELL = 62;
const W = M * 2 + (COLS - 1) * CELL;
const H = M * 2 + (ROWS - 1) * CELL;
const PIECE_NAMES = {
  K: '帅', k: '将', A: '仕', a: '士', E: '相', e: '象',
  H: '马', h: '马', R: '车', r: '车', C: '炮', c: '炮', P: '兵', p: '卒'
};

let canvas, ctx, api, state, sel = null, hints = [];

function setupScale() {
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function ptToCell(e) {
  const rect = canvas.getBoundingClientRect();
  const ax = (e.clientX - rect.left) * (W / rect.width);
  const ay = (e.clientY - rect.top) * (H / rect.height);
  const x = Math.round((ax - M) / CELL), y = Math.round((ay - M) / CELL);
  return (x < 0 || y < 0 || x >= COLS || y >= ROWS) ? null : { x, y };
}

function cellPt(x, y) { return [M + x * CELL, M + y * CELL]; }

function onClick(e) {
  const c = ptToCell(e);
  if (!c) return;
  if (!state || state.gameover) return;

  if (sel && hints.some(h => h.x === c.x && h.y === c.y)) {
    api.send({ type: 'move', move: { from: sel, to: c } });
    sel = null; hints = [];
    return;
  }
  const ch = state.board[c.y][c.x];
  if (ch === '.') { sel = null; hints = []; return; }
  const mine = (api.you === 1) ? /[A-Z]/ : /[a-z]/;
  if (!mine.test(ch)) { sel = null; hints = []; return; }
  sel = c;
  api.send({ type: 'select', from: c });
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#e9c98c'); g.addColorStop(1, '#d9ae64');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = '#7a4e21';
  ctx.lineWidth = 1.4;
  for (let x = 0; x < COLS; x++) line(M + x * CELL, M, M + x * CELL, M + 9 * CELL);
  for (let y = 0; y < ROWS; y++) {
    if (y === 4 || y === 5) continue;
    line(M, M + y * CELL, M + 8 * CELL, M + y * CELL);
  }
  ctx.lineWidth = 2.4;
  ctx.strokeRect(M, M, 8 * CELL, 9 * CELL);

  ctx.strokeStyle = '#b33434';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(M + 3 * CELL, M); ctx.lineTo(M + 5 * CELL, M + 2 * CELL);
  ctx.moveTo(M + 5 * CELL, M); ctx.lineTo(M + 3 * CELL, M + 2 * CELL);
  ctx.moveTo(M + 3 * CELL, M + 7 * CELL); ctx.lineTo(M + 5 * CELL, M + 9 * CELL);
  ctx.moveTo(M + 5 * CELL, M + 7 * CELL); ctx.lineTo(M + 3 * CELL, M + 9 * CELL);
  ctx.stroke();

  ctx.fillStyle = 'rgba(123,78,33,.5)';
  ctx.font = '700 30px "Noto Serif SC", serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('楚　河', M + 2.25 * CELL, M + 4.5 * CELL);
  ctx.fillText('漢　界', M + 6.25 * CELL, M + 4.5 * CELL);
  ctx.strokeStyle = 'rgba(123,78,33,.5)';
  ctx.lineWidth = 1;
  for (let x = 0; x < COLS; x++) {
    line(M + x * CELL, M + 4 * CELL, M + x * CELL, M + 5 * CELL);
  }

  if (!state) return;

  if (state.last) {
    const { from, to } = state.last;
    mark(from.x, from.y, '#e53935');
    mark(to.x, to.y, '#797fce');
  }

  ctx.fillStyle = 'rgba(30,120,60,.75)';
  if (sel) {
    for (const h of hints) {
      const [px, py] = cellPt(h.x, h.y);
      ctx.beginPath(); ctx.arc(px, py, 7, 0, 7); ctx.fill();
    }
  }

  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const ch = state.board[y][x];
    if (ch === '.') continue;
    piece(x, y, ch);
  }

  if (sel && state.board[sel.y] && state.board[sel.y][sel.x] !== '.') {
    const [px, py] = cellPt(sel.x, sel.y);
    ctx.strokeStyle = '#ffd54f';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(px, py, 23, 0, 7); ctx.stroke();
  }

  if (state.check && !state.gameover) {
    const side = state.turn === 1 ? 'k' : 'K';
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (state.board[y][x] === side) {
        const [px, py] = cellPt(x, y);
        ctx.strokeStyle = '#ff1744';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(px, py, 21, 0, 7); ctx.stroke();
      }
    }
  }
}

function mark(x, y, color) {
  const [px, py] = cellPt(x, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(px, py, 14, 0, 7); ctx.stroke();
}

function piece(x, y, ch) {
  const [px, py] = cellPt(x, y);
  const red = /[A-Z]/.test(ch);
  const r = 21.5;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.35)';
  ctx.shadowBlur = 5;
  const grad = ctx.createRadialGradient(px - 6, py - 8, 2, px, py, r);
  if (red) { grad.addColorStop(0, '#ef9a9a'); grad.addColorStop(1, '#b02727'); }
  else { grad.addColorStop(0, '#f7f7f7'); grad.addColorStop(1, '#d7d7db'); }
  ctx.beginPath(); ctx.arc(px, py, r, 0, 7);
  ctx.fillStyle = grad; ctx.fill();
  ctx.restore();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = red ? '#8e1c1c' : '#9a9aa2';
  ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.stroke();
  ctx.strokeStyle = red ? 'rgba(142,28,28,.55)' : 'rgba(120,120,132,.5)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(px, py, r - 3.4, 0, 7); ctx.stroke();
  ctx.fillStyle = red ? '#fff7f0' : '#3c4147';
  ctx.font = '700 26px "Noto Serif SC", "SimSun", serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(PIECE_NAMES[ch] || ch, px, py + 1);
}

function line(x1, y1, x2, y2) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

export const Xiangqi = {
  mount(el, a) {
    canvas = document.createElement('canvas');
    ctx = canvas.getContext('2d');
    api = a;
    el.innerHTML = '';
    el.appendChild(canvas);
    setupScale();
    canvas.addEventListener('click', onClick);
    sel = null; hints = [];
  },
  onHints(m) {
    sel = m.from; hints = m.to || [];
    if (state) draw();
  },
  onState(st) {
    state = st;
    const mine = (api.you === 1) ? /[A-Z]/ : /[a-z]/;
    // 如果已经轮到对手，清除选中
    if (st.gameover || st.turn !== api.you) {
      sel = null; hints = [];
    }
    draw();
  },
  reset() { state = null; sel = null; hints = []; draw(); },
  title: '中国象棋',
  myColorText: () => api.you === 1 ? '红方' : '黑方'
};
