const GO_SIZE = 19;
const M = 34, CELL = 34;
const W = M * 2 + (GO_SIZE - 1) * CELL;
const H = M * 2 + (GO_SIZE - 1) * CELL;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const STAR = [3, 9, 15];

let canvas, ctx, api, state, bar;

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
  if (x < 0 || y < 0 || x >= N || y >= N) return;
  if (!state) return;
  if (state.phase === 'scoring' && !state.gameover) {
    const v = state.board[y] && state.board[y][x];
    if (!v) return;
    const dead = !state.dead.some(d => d.x === x && d.y === y);
    api.send({ type: 'markDead', x, y, dead });
    return;
  }
  if (state.gameover) return;
  api.send({ type: 'move', x, y });
}

function rebar() {
  if (!bar) return;
while (bar.firstChild) bar.removeChild(bar.firstChild);
    if (!state) return;
  if (state.gameover) {
    bar.innerHTML = '';
    return;
  }
  const bt = document.createElement('div');
  bt.className = 'go-bar-buttons';
  bt.style.cssText = 'display:flex;gap:10px;justify-content:center;flex-wrap:wrap';

  if (state.phase === 'scoring') {
    const t = document.createElement('div');
    t.className = 'room-hint';
    t.style.cssText = 'color:#9aa0a6;font-size:13px;margin-bottom:8px';
    const me = state.confirmed[api.you];
    const opp = state.confirmed[api.you === 1 ? 2 : 1];
    t.textContent = '计分阶段：点击标记对手的死子' +
      (me ? '（你已确认）' : '') + (opp ? '（对方已确认）' : '');
    const ok = document.createElement('button');
    ok.className = 'btn primary small';
    ok.textContent = me ? '已确认 ✓' : '确认死子';
    ok.disabled = me;
    ok.onclick = () => api.send({ type: 'confirmScore' });
    const goBtn = document.createElement('button');
    goBtn.className = 'btn ghost small';
    goBtn.textContent = '继续对局';
    goBtn.onclick = () => api.send({ type: 'resumeGame' });
    bt.appendChild(ok); bt.appendChild(goBtn);
    bar.appendChild(t); bar.appendChild(bt);
    return;
  }
  const pass = document.createElement('button');
  pass.className = 'btn ghost small';
  pass.textContent = '停一手（Pass）';
  pass.onclick = () => api.send({ type: 'pass' });
  bt.appendChild(pass);
  bar.appendChild(bt);
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#e7bd72';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(90,60,25,.6)';
  ctx.lineWidth = 1;
  for (let i = 0; i < GO_SIZE; i++) {
    line(M + i * CELL, M + (GO_SIZE - 1) * CELL, M + i * CELL, M);
    line(M + (GO_SIZE - 1) * CELL, M + i * CELL, M, M + i * CELL);
  }
  ctx.fillStyle = '#6b4a1f';
  for (const p of STAR) for (const q of STAR) {
    ctx.beginPath(); ctx.arc(M + p * CELL, M + q * CELL, 3.6, 0, 7); ctx.fill();
  }

  if (!state) return;

  if (state.gameover && state.score) paintTerritory();
  for (const d of state.dead) {
    const px = M + d.x * CELL, py = M + d.y * CELL;
    ctx.save();
    ctx.globalAlpha = 0.28;
    stone(px, py, d.color);
    ctx.restore();
    ctx.strokeStyle = 'rgba(200,0,0,.8)';
    ctx.lineWidth = 2;
    const s = CELL * 0.30;
    line(px - s, py - s, px + s, py + s);
    line(px + s, py - s, px - s, py + s);
  }

  const b = state.board;
  for (let y = 0; y < GO_SIZE; y++) for (let x = 0; x < GO_SIZE; x++) {
    if (b[y][x]) stone(M + x * CELL, M + y * CELL, b[y][x]);
  }

  if (state.last) {
    const px = M + state.last.x * CELL, py = M + state.last.y * CELL;
    ctx.fillStyle = state.last.color === 1 ? '#ffd54f' : '#263238';
    ctx.beginPath(); ctx.arc(px, py, CELL * 0.12, 0, 7); ctx.fill();
  }
}

function paintTerritory() {
  const b = state.board.map(r => r.slice());
  for (const d of state.dead) b[d.y][d.x] = 0;
  const seen = new Set();
for (let y = 0; y < GO_SIZE; y++) for (let x = 0; x < GO_SIZE; x++) {
      const v = b[y][x];
      if (v !== 0 || seen.has(y * GO_SIZE + x)) continue;
    const queue = [[x, y]]; seen.add(y * GO_SIZE + x);
    const cells = []; const touched = new Set();
    while (queue.length) {
      const [cx, cy] = queue.shift(); cells.push([cx, cy]);
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= GO_SIZE || ny >= GO_SIZE) continue;
        const w = b[ny][nx];
        if (w === 0) { const k = ny * GO_SIZE + nx; if (!seen.has(k)) { seen.add(k); queue.push([nx, ny]); } }
        else touched.add(w);
      }
    }
    const owner = touched.size === 1 ? [...touched][0] : 0;
    if (!owner) continue;
    for (const [cx, cy] of cells) {
      ctx.fillStyle = owner === 1 ? 'rgba(30,60,120,.16)' : 'rgba(210,210,210,.16)';
      ctx.fillRect(M + cx * CELL - CELL / 2 + 1, M + cy * CELL - CELL / 2 + 1, CELL - 2, CELL - 2);
    }
  }
}

function stone(px, py, c) {
  const r = CELL * 0.46;
  const g = ctx.createRadialGradient(px - r * 0.4, py - r * 0.4, r * 0.15, px, py, r);
  if (c === 1) { g.addColorStop(0, '#000000'); g.addColorStop(1, '#22262a'); }
  else { g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#b9bdc2'); }
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.45)';
  ctx.shadowBlur = 4;
  ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fillStyle = g; ctx.fill();
  ctx.restore();
  ctx.strokeStyle = c === 1 ? 'rgba(0,0,0,.5)' : 'rgba(0,0,0,.25)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.stroke();
}

function line(x1, y1, x2, y2) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

export const Go = {
  mount(el, a) {
    api = a;
    canvas = document.createElement('canvas');
    ctx = canvas.getContext('2d');
    bar = document.createElement('div');
    bar.className = 'go-bar';
    el.innerHTML = '';
    el.appendChild(canvas);
    el.appendChild(bar);
    setupScale();
    rebar();
    canvas.addEventListener('click', onClick);
  },
  onState(st) {
    state = st;
    rebar();
    const info = document.getElementById('goInfo');
    const stats = document.getElementById('goStats');
    if (info && stats) {
      info.style.display = 'block';
      stats.innerHTML = '黑方提子 <b>' + (st.caps ? st.caps[1] : 0) + '</b> · 白方提子 <b>' + (st.caps ? st.caps[2] : 0) + '</b>' +
        (st.passCount ? ' · 连续停手 ' + st.passCount : '');
      if (st.score) stats.innerHTML += '<br>黑 <b>' + st.score.black + '</b> · 白 <b>' + st.score.white + '</b>' +
        '<span style="color:#9aa0a6">（贴目 ' + st.score.komi + '）</span>';
    }
    draw();
  },
  reset() {
    state = null;
    if (bar) while (bar.firstChild) bar.removeChild(bar.firstChild);
    const info = document.getElementById('goInfo');
    if (info) info.style.display = 'none';
    draw();
  },
  title: '围棋',
  myColorText: () => api.you === 1 ? '黑方' : '白方'
};
