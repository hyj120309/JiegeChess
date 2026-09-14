'use strict';
/* 跑得快 E2E: 三客户端AI对局驱动完整局 */
const { execFile } = require('child_process');
const wsLib = require('ws');
const C = require('../lib/cards');

const PORT = 8094;
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✔ ' + name); }
  else { fail++; console.log('  ✘ ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra) : '')); }
}
function cli() {
  const ws = new wsLib('ws://localhost:' + PORT + '/');
  const msgs = []; const waiters = [];
  ws.on('message', d => {
    const m = JSON.parse(d);
    msgs.push(m);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].pred(m)) {
        const idx = msgs.indexOf(m);
        if (idx >= 0) msgs.splice(idx, 1);
        clearTimeout(waiters[i].t);
        waiters[i].res(m);
        waiters.splice(i, 1);
      }
    }
  });
  return {
    ws, msgs,
    send(o) { if (ws.readyState === 1) ws.send(JSON.stringify(o)); },
    wait(pred, ms = 5000) {
      const hit = msgs.find(pred);
      if (hit) { msgs.splice(msgs.indexOf(hit), 1); return Promise.resolve(hit); }
      return new Promise((res, rej) => {
        const t = setTimeout(() => { const i = waiters.findIndex(w => w.pred === pred); if (i >= 0) waiters.splice(i, 1); rej(new Error('timeout')); }, ms);
        waiters.push({ pred, res, t });
      });
    },
    latest() {
      for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].type === 'state') return msgs[i].state;
      return null;
    },
    clear() { msgs.length = 0; },
  };
}
function open() {
  return new Promise((res, rej) => {
    const c = cli();
    c.ws.on('open', () => res(c));
    c.ws.on('error', rej);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = execFile('node', ['server.js'], { env: { ...process.env, PORT: String(PORT) } });
  srv.stderr.on('data', d => console.error('[srv]', d.toString().trim()));
  await sleep(1000);

  try {
    console.log('== 跑得快 (3人完整局) ==');
    const A = await open();
    A.send({ type: 'create', game: 'paodekuai', name: '甲' });
    const cre = await A.wait(m => m.type === 'created');
    ok('创建3人房间', cre.capacity === 3);

    const B = await open();
    B.send({ type: 'join', room: cre.room, game: 'paodekuai', name: '乙' });
    await B.wait(m => m.type === 'joined');
    const Cc = await open();
    Cc.send({ type: 'join', room: cre.room, game: 'paodekuai', name: '丙' });

    const stC = await Cc.wait(m => m.type === 'start');
    const stA = await A.wait(m => m.type === 'start');
    const stB = await B.wait(m => m.type === 'start');
    ok('满员开局', !!stC.state);
    ok('每人16张', stA.state.counts.every(c => c === 16), stA.state.counts);
    ok('4张弃置', stA.state.discardedCount === 4);

    const players = [A, B, Cc]; // seat1=idx0
    const states0 = [stA.state, stB.state, stC.state];
    let firstSeat = -1;
    for (let i = 0; i < 3; i++) if (states0[i].hand.indexOf(0) >= 0) firstSeat = i;
    ok('持♠3者先出', stA.state.turn === firstSeat + 1, { turn: stA.state.turn, firstSeat: firstSeat + 1 });

    // 首手不含♠3被拒
    const fp = players[firstSeat];
    const noSpade = states0[firstSeat].hand.filter(c => c !== 0).slice(0, 1);
    fp.send({ type: 'move', move: { action: 'play', cards: noSpade } });
    const e1 = await fp.wait(m => m.type === 'error');
    ok('首手不含♠3被拒', !!e1.msg);

    // 散牌被拒: ♠3 + 两张散牌 (含♠3但不成型)
    const h0 = states0[firstSeat].hand;
    const g0 = C.groupByRank(h0);
    const rk0 = Object.keys(g0).map(Number).filter(r => r !== 0);
    let scatter = null;
    if (rk0.length >= 2) {
      const pick = [0, g0[rk0[0]][0], g0[rk0[1]][0]];
      if (C.parse(pick) === null) scatter = pick;
    }
    if (scatter) {
      fp.send({ type: 'move', move: { action: 'play', cards: scatter } });
      const e2 = await fp.wait(m => m.type === 'error');
      ok('散牌/非法牌型被拒', !!e2.msg && e2.msg.indexOf('合法牌型') >= 0, e2);
    } else ok('散牌/非法牌型被拒(手牌无法构造,跳过)', true);

    // AI 对局循环: 先驱动首手(持♠3者出♠3), 再轮询
    players.forEach(p => p.clear());
    fp.send({ type: 'move', move: { action: 'play', cards: [0] } });
    await sleep(50);
    let fin = null, steps = 0; const maxSteps = 400;
    let lastTurn = -1, stuck = 0;
    while (!fin && steps++ < maxSteps) {
      let st = null;
      for (const p of players) { const s = p.latest(); if (s) { st = s; break; } }
      if (!st) { await sleep(30); continue; }
      if (st.gameover) { fin = st; break; }
      if (st.turn === lastTurn) { stuck++; if (stuck > 15) { console.log('    [stuck] turn=', st.turn, 'free=', st.freeTurn, 'last=', JSON.stringify(st.last && st.last.cards), 'err=', JSON.stringify(players[st.turn-1].msgs.filter(m=>m.type==='error').slice(-1))); break; } }
      else { lastTurn = st.turn; stuck = 0; }
      if (steps % 40 === 0) console.log('    [step ' + steps + '] counts=', st.counts.join(','), 'turn=', st.turn, 'free=', st.freeTurn, 'pass=', st.passCount, 'last=', st.last ? JSON.stringify(st.last.cards) : 'null');
      const me = players[st.turn - 1];
      const mySt = me.latest() || st;
      if (mySt.gameover) { fin = mySt; break; }
      const hand = mySt.hand;
      const lastCards = mySt.last ? mySt.last.cards : null;
      let play = null;
      if (mySt.firstMove) play = [0];
      else if (mySt.freeTurn) play = C.findHint(hand, null);
      else play = C.findHint(hand, lastCards);
      if (play && mySt.firstMove && play.indexOf(0) < 0) play = null;
      if (play) {
        me.send({ type: 'move', move: { action: 'play', cards: play } });
      } else {
        me.send({ type: 'move', move: { action: 'pass' } });
      }
      await sleep(25);
    }
    ok('对局正常结束', !!fin, steps);
    if (fin) ok('胜者手牌为空', fin.counts[fin.winner - 1] === 0);
    ok('对局步数合理(<400)', steps < 400, steps);

    // 认输被拒
    players[0].send({ type: 'resign' });
    const rj = await players[0].wait(m => m.type === 'error');
    ok('牌类认输被拒', !!rj.msg);

    // rematch
    players[0].send({ type: 'rematch' });
    const rm = await players[1].wait(m => m.type === 'rematch');
    ok('rematch重新发牌16张', rm.state.counts.every(c => c === 16));

    A.ws.close(); B.ws.close(); Cc.ws.close();
    console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
  } finally {
    srv.kill();
    await sleep(300);
  }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('异常:', e.message); process.exit(2); });