const BOARD_SIZE = 15;
const M = 30, CELL = 34;
const W = M * 2 + (BOARD_SIZE - 1) * CELL;
const H = M * 2 + (BOARD_SIZE - 1) * CELL;

let canvas, ctx, api, state, myColor;

function setupScale() {
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function cellFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const lgx = (e.clientX - rect.left) * (W / rect.width);
  const lgy = (e.clientY - rect.top) * (H / rect.height);
  return [Math.round((lgx - M) / CELL), Math.round((lgy - M) / CELL)];
}

function onClick(e) {
  const [x, y] = cellFromEvent(e);
  if (x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) return;
  if (!state || state.gameover) return;
  api.send({ type: 'move', x, y });
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#e3b872';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(90,60,25,.55)';
  ctx.lineWidth = 1;
  for (let i = 0; i < BOARD_SIZE; i++) {
    line(M + i * CELL, M, M + i * CELL, M + (BOARD_SIZE - 1) * CELL);
    line(M, M + i * CELL, M + (BOARD_SIZE - 1) * CELL, M + i * CELL);
  }
  ctx.strokeStyle = 'rgba(90,60,25,.8)';
  ctx.lineWidth = 2.2;
  ctx.strokeRect(M, M, (BOARD_SIZE - 1) * CELL, (BOARD_SIZE - 1) * CELL);

  ctx.fillStyle = '#6b4a1f';
  for (const p of [3, 7, 11]) for (const q of [3, 7, 11]) {
    ctx.beginPath(); ctx.arc(M + p * CELL, M + q * CELL, 3.4, 0, 7); ctx.fill();
  }

  if (!state) return;
  const b = state.board;
  for (let y = 0; y < BOARD_SIZE; y++) for (let x = 0; x < BOARD_SIZE; x++) {
    if (b[y][x]) stone(x, y, b[y][x]);
  }
  if (state.last) {
    const { x, y } = state.last;
    ctx.fillStyle = '#e53935';
    const d = 4.2;
    ctx.fillRect(M + x * CELL - d / 2, M + y * CELL - d / 2, d, d);
  }
  if (state.win) {
    ctx.strokeStyle = '#e53935';
    ctx.lineWidth = 3;
    ctx.beginPath();
    const [a, z] = [state.win[0], state.win[state.win.length - 1]];
    ctx.moveTo(M + a.x * CELL, M + a.y * CELL);
    ctx.lineTo(M + z.x * CELL, M + z.y * CELL);
    ctx.stroke();
  }
}

function stone(x, y, c) {
  const px = M + x * CELL, py = M + y * CELL, r = CELL * 0.42;
  const g = ctx.createRadialGradient(px - r * 0.35, py - r * 0.35, r * 0.15, px, py, r);
  if (c === 1) { g.addColorStop(0, '#555a60'); g.addColorStop(1, '#101215'); }
  else { g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#b9bdc2'); }
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.4)';
  ctx.shadowBlur = 4;
  ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fillStyle = g; ctx.fill();
  ctx.restore();
  ctx.strokeStyle = c === 1 ? 'rgba(0,0,0,.35)' : 'rgba(0,0,0,.25)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.stroke();
}

function line(x1, y1, x2, y2) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

export const Gomoku = {
  mount(el, a) {
    canvas = document.createElement('canvas');
    ctx = canvas.getContext('2d');
    api = a;
    el.replaceChildren(canvas);
    setupScale();
    canvas.addEventListener('click', onClick);
  },
  onState(st) {
    state = st;
    myColor = api.you === 1 ? '黑方' : '白方';
    draw();
  },
  reset() { state = null; draw(); },
  title: '五子棋',
  myColorText: () => myColor
};
