'use strict';
/* 无规则扑克 E2E: node test/norules-e2e.js (自动起停服务器) */
const { execFile } = require('child_process');
const wsLib = require('ws');

const PORT = 8092;
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
    for (let i = waiters.length - 1; i >= 0; i--) if (waiters[i](m)) { waiters.splice(i, 1); }
  });
  return {
    ws,
    send(o) { if (ws.readyState === 1) ws.send(JSON.stringify(o)); },
    wait(pred, ms = 5000) {
      const hit = msgs.find(pred);
      if (hit) { msgs.splice(msgs.indexOf(hit), 1); return Promise.resolve(hit); }
      return new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error('timeout')), ms);
        waiters.push(m => { if (pred(m)) { clearTimeout(t); res(m); return true; } return false; });
      });
    },
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
    console.log('== 无规则扑克 (3人) ==');
    const A = await open();
    A.send({ type: 'create', game: 'norules', name: '甲', playerCount: 3 });
    const cre = await A.wait(m => m.type === 'created');
    ok('创建3人房间', cre.capacity === 3, cre);

    const B = await open();
    B.send({ type: 'join', room: cre.room, game: 'norules', name: '乙' });
    await B.wait(m => m.type === 'joined');
    ok('B加入(未开局)', true);

    const C = await open();
    C.send({ type: 'join', room: cre.room, game: 'norules', name: '丙' });
    const stC = await C.wait(m => m.type === 'start');
    const stA = await A.wait(m => m.type === 'start');
    const stB = await B.wait(m => m.type === 'start');
    ok('满员自动开局', !!stC.state);
    ok('视图按人过滤: A只看到自己手牌', Array.isArray(stA.state.hand) && Array.isArray(stA.state.counts) && stA.state.counts.length === 3);
    ok('A/B/C手牌互不相同', JSON.stringify(stA.state.hand) !== JSON.stringify(stB.state.hand) && JSON.stringify(stB.state.hand) !== JSON.stringify(stC.state.hand));
    ok('张数均分(54/3=18)', stA.state.counts.every(c => c === 18), stA.state.counts);
    ok('座位1先出', stA.state.turn === 1);

    // A 先出 2 张
    const playCards = stA.state.hand.slice(0, 2);
    A.send({ type: 'move', move: { action: 'play', cards: playCards } });
    const afterPlay = await B.wait(m => m.type === 'state' && m.state.last);
    ok('A出2张后轮到B', afterPlay.state.turn === 2 && afterPlay.state.last.cards.length === 2, afterPlay.state.turn);

    // B 出不在手中的牌 → 拒绝
    const fake = [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52].filter(c => !afterPlay.state.hand.includes(c));
    if (fake.length >= 3) {
      B.send({ type: 'move', move: { action: 'play', cards: fake.slice(0, 3) } });
      const err = await B.wait(m => m.type === 'error');
      ok('出不在手中的牌被拒', !!err.msg);
    } else ok('出不在手中的牌被拒(跳过-构造失败)', false);

    // B 跳过
    B.send({ type: 'move', move: { action: 'pass' } });
    const afterPass = await C.wait(m => m.type === 'state' && m.state.turn === 3);
    ok('B跳过后轮到C', afterPass.state.turn === 3);

    // C 也跳过 → A 自由领出
    C.send({ type: 'move', move: { action: 'pass' } });
    const afterFree = await A.wait(m => m.type === 'state' && m.state.freeTurn === true);
    ok('其余人全跳过后A自由领出', afterFree.state.freeTurn === true && afterFree.state.turn === 1);

    // A 打光所有牌获胜
    const all = afterFree.state.hand;
    A.send({ type: 'move', move: { action: 'play', cards: all } });
    const fin = await B.wait(m => m.type === 'state' && m.state.gameover);
    ok('A出完获胜', fin.state.gameover && fin.state.winner === 1);
    ok('结束时counts[0]=0', fin.state.counts[0] === 0);

    // 认输被拒
    B.send({ type: 'resign' });
    const rj = await B.wait(m => m.type === 'error');
    ok('牌类认输被拒', !!rj.msg);

    // 再来一局
    A.send({ type: 'rematch' });
    const rm = await C.wait(m => m.type === 'rematch');
    ok('rematch重新发牌', rm.state && !rm.state.gameover && Array.isArray(rm.state.hand));
    ok('rematch后每人仍18张', rm.state.counts.every(c => c === 18));

    A.ws.close(); B.ws.close(); C.ws.close();
    console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
  } finally {
    srv.kill();
    await sleep(300);
  }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('异常:', e.message); process.exit(2); });