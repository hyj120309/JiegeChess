'use strict';
/* 斗地主 E2E: 三客户端AI对局 (states数组持久化, wait不消费视图) */
const { execFile } = require('child_process');
const wsLib = require('ws');
const C = require('../lib/cards');

const PORT = 8095;
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✔ ' + name); }
  else { fail++; console.log('  ✘ ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra) : '')); }
}
function cli() {
  const ws = new wsLib('ws://localhost:' + PORT + '/');
  const msgs = []; const waiters = []; const states = [];
  ws.on('message', d => {
    const m = JSON.parse(d);
    msgs.push(m);
    if (m.type === 'state' || m.type === 'start' || m.type === 'rematch') states.push(m.state); // 持久累积, 不被wait消费
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
    latest() { return states.length ? states[states.length - 1] : null; },
    clear() { msgs.length = 0; waiters.length = 0; }, // 不清states
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
    console.log('== 斗地主 (3人完整局) ==');
    const A = await open();
    A.send({ type: 'create', game: 'doudizhu', name: '甲' });
    const cre = await A.wait(m => m.type === 'created');
    const B = await open();
    B.send({ type: 'join', room: cre.room, game: 'doudizhu', name: '乙' });
    await B.wait(m => m.type === 'joined');
    const Cc = await open();
    Cc.send({ type: 'join', room: cre.room, game: 'doudizhu', name: '丙' });
    const stC = await Cc.wait(m => m.type === 'start');
    const stA = await A.wait(m => m.type === 'start');
    const stB = await B.wait(m => m.type === 'start');
    ok('满员开局进入叫牌阶段', stA.state.phase === 'claim');
    ok('每人17张', stA.state.counts.every(c => c === 17), stA.state.counts);
    ok('底牌3张且claim阶段不可见', stA.state.bottomCount === 3 && stA.state.bottom.length === 0);

    const players = [A, B, Cc];
    const anyLatest = () => {
      for (const p of players) { const s = p.latest(); if (s) return s; }
      return null;
    };

    // 非当前表态者叫牌被拒
    const ct0 = stA.state.claimTurn;
    const other = players[(ct0 + 1) % 3];
    other.send({ type: 'move', move: { action: 'claim', take: true } });
    const e1 = await other.wait(m => m.type === 'error');
    ok('非表态者叫牌被拒', !!e1.msg);

    // 出牌阶段发claim被拒
    // (延后到play阶段测)

    // ---------- 叫/抢: 全部take ----------
    let step = 0;
    while (step++ < 40) {
      const st = anyLatest();
      if (!st) { await sleep(40); continue; }
      if (st.phase !== 'claim') break;
      const me = players[st.claimTurn];
      me.send({ type: 'move', move: { action: 'claim', take: true } });
      await sleep(60);
    }
    const stPlay = anyLatest();
    ok('叫抢完成进入出牌阶段', stPlay && stPlay.phase === 'play');
    if (stPlay && stPlay.phase === 'play') {
      ok('地主手牌20张(含底牌)', stPlay.counts[stPlay.landlord] === 20, stPlay.counts);
      ok('地主先出', stPlay.turn === stPlay.landlord + 1);
      ok('底牌已公开', stPlay.bottom.length === 3);
      ok('1叫+2抢倍数=4(每抢×2)', stPlay.multiplier === 4, stPlay.multiplier);
    }

    // play阶段发claim → 未知操作
    const curP = players[(anyLatest().turn - 1)];
    curP.send({ type: 'move', move: { action: 'claim', take: true } });
    const e2 = await curP.wait(m => m.type === 'error');
    ok('出牌阶段发claim被拒', !!e2.msg);

    // ---------- AI 对局 ----------
    let errSeen = 0;
    let fin = null; step = 0; const maxSteps = 600;
    while (!fin && step++ < maxSteps) {
      const st = anyLatest();
      if (!st) { await sleep(30); continue; }
      if (st.gameover) { fin = st; break; }
      if (st.phase !== 'play') { await sleep(30); continue; }
      const me = players[st.turn - 1];
      const mySt = me.latest();
      if (!mySt || mySt.phase !== 'play') { await sleep(30); continue; }
      // 自愈: 若我有未消费错误(上次出牌失败), 本轮改发pass
      const myErr = me.msgs.find(m => m.type === 'error');
      if (myErr) {
        errSeen++;
        me.msgs.splice(me.msgs.indexOf(myErr), 1);
        if (mySt.freeTurn) {
          // freeTurn必须出牌: 出最小单张
          const h = mySt.hand.slice().sort((a, b) => a - b);
          me.send({ type: 'move', move: { action: 'play', cards: [h[0]] } });
        } else {
          me.send({ type: 'move', move: { action: 'pass' } });
        }
        await sleep(25);
        continue;
      }
      const lastCards = mySt.last ? mySt.last.cards : null;
      let play = mySt.freeTurn ? C.findHint(mySt.hand, null) : C.findHint(mySt.hand, lastCards);
      if (play) me.send({ type: 'move', move: { action: 'play', cards: play } });
      else me.send({ type: 'move', move: { action: 'pass' } });
      await sleep(25);
    }
    ok('对局正常结束', !!fin, step);
    ok('AI无非法出牌(errSeen=0)', errSeen === 0, errSeen);
    if (fin) {
      ok('胜者手牌为空', fin.counts[fin.winner - 1] === 0);
      const landlordWin = fin.winner - 1 === fin.landlord;
      const m = fin.multiplier;
      ok('地主积分=±2×倍数', fin.scores[fin.landlord] === (landlordWin ? 2 * m : -2 * m), { scores: fin.scores, m, landlord: fin.landlord, type: fin.winType });
      const farmers = [0, 1, 2].filter(s => s !== fin.landlord);
      ok('农民积分=∓1×倍数', farmers.every(s => fin.scores[s] === (landlordWin ? -m : m)), fin.scores);
      ok('总分守恒(和为0)', fin.scores.reduce((a, b) => a + b, 0) === 0, fin.scores);
    }

    // ---------- rematch 保留积分 ----------
    const finScores = fin ? fin.scores.slice() : null;
    players[0].send({ type: 'rematch' });
    const rm = await players[1].wait(m => m.type === 'rematch');
    ok('rematch保留积分', finScores && JSON.stringify(rm.state.scores) === JSON.stringify(finScores), { got: rm.state.scores, want: finScores });
    ok('rematch重新进入叫牌', rm.state.phase === 'claim');

    // ---------- 全不叫 → 重新发牌 ----------
    step = 0;
    while (step++ < 40) {
      const st = anyLatest();
      if (!st) { await sleep(40); continue; }
      if (st.phase !== 'claim') break;
      const me = players[st.claimTurn];
      me.send({ type: 'move', move: { action: 'claim', take: false } });
      await sleep(60);
    }
    const rdm = anyLatest();
    ok('全不叫触发重新发牌', rdm && rdm.phase === 'claim' && (rdm.redealCount || 0) >= 1, rdm && rdm.redealCount);
    ok('重新发牌保留积分', rdm && JSON.stringify(rdm.scores) === JSON.stringify(finScores), rdm && rdm.scores);

    // 认输被拒
    players[0].send({ type: 'resign' });
    const rj = await players[0].wait(m => m.type === 'error');
    ok('牌类认输被拒', !!rj.msg);

    players.forEach(p => p.ws.close());
    console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
  } finally {
    srv.kill();
    await sleep(300);
  }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('异常:', e.message); process.exit(2); });