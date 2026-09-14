'use strict';
/* 韧性与安全 E2E: 断线重连/磁盘恢复/路由安全/昵称清洗/畸形URL */
const { execFile } = require('child_process');
const http = require('http');
const wsLib = require('ws');

const PORT = 8099;
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
      if (waiters[i].p(m)) { clearTimeout(waiters[i].t); waiters[i].r(m); waiters.splice(i, 1); }
    }
  });
  return {
    ws, msgs,
    send(o) { if (ws.readyState === 1) ws.send(JSON.stringify(o)); },
    wait(p, ms = 4000) {
      const h = msgs.find(p);
      if (h) return Promise.resolve(h);
      return new Promise((r, j) => {
        const t = setTimeout(() => j(new Error('timeout')), ms);
        waiters.push({ p, r, t });
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
const get = p => new Promise(r => http.get('http://localhost:' + PORT + p, res => { res.resume(); r(res.statusCode); }).on('error', () => r(0)));
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = execFile('node', ['server.js'], { env: { ...process.env, PORT: String(PORT) } });
  srv.stderr.on('data', d => console.error('[srv]', d.toString().trim()));
  await sleep(1000);
  try {
    console.log('== 韧性与安全 ==');
    // 1. 畸形URL不崩溃
    let code = await get('/%zz');
    ok('畸形URL返回400', code === 400, code);
    code = await get('/%');
    ok('百分号URL不崩溃', code === 400 || code === 404, code);
    code = await get('/');
    ok('服务器仍存活', code === 200, code);
    // 2. lib路由
    ok('cards.js放行', (await get('/lib/cards.js')) === 200);
    let c2 = await get('/lib/xiangqi.js');
    ok('xiangqi.js不可访问', c2 === 403 || c2 === 404, c2);
    c2 = await get('/lib/gomoku.js');
    ok('gomoku.js不可访问', c2 === 403 || c2 === 404, c2);
    c2 = await get('/lib/../server.js');
    ok('路径穿越被拒', c2 === 403 || c2 === 404, c2);
    // 3. XSS昵称清洗
    const a = await open();
    a.send({ type: 'create', game: 'norules', name: '<img src=x onerror=alert(1)>甲', playerCount: 3 });
    const cre = await a.wait(m => m.type === 'created');
    ok('create昵称被清洗', cre.name.indexOf('<') < 0 && cre.name.indexOf('>') < 0, cre.name);
    const b = await open();
    b.send({ type: 'join', room: cre.room, game: 'norules', name: '<script>"&\'乙' });
    const jn = await b.wait(m => m.type === 'joined');
    ok('join昵称被清洗', jn.name.indexOf('<') < 0 && jn.name.indexOf('"') < 0, jn.name);
    // 4. 断线重连(全员断开→resume)
    const c3 = await open();
    c3.send({ type: 'join', room: cre.room, game: 'norules', name: '丙' });
    const st = await a.wait(m => m.type === 'start');
    ok('3人开局', !!st.state && st.state.counts.every(x => x === 18));
    a.send({ type: 'move', move: { action: 'play', cards: [st.state.hand[0]] } });
    const st2 = await b.wait(m => m.type === 'state' && m.state.last);
    ok('A出牌成功', st2.state.counts[0] === 17, st2.state.counts);
    a.ws.close(); b.ws.close(); c3.ws.close();
    await sleep(400);
    const a2 = await open();
    a2.send({ type: 'resume', room: cre.room, token: cre.token });
    const rs = await a2.wait(m => m.type === 'resumed');
    ok('全员断开后resume成功', rs.you === 1 && rs.state && Array.isArray(rs.state.hand));
    ok('手牌状态保留', rs.state.counts[0] === 17, rs.state.counts);
    // 6. 空座位可被新玩家补位(第一个空位=座位1)
    a2.ws.close();
    await sleep(300);
    const nb = await open();
    nb.send({ type: 'join', room: cre.room, game: 'norules', name: '新人' });
    const jn2 = await nb.wait(m => m.type === 'joined' || m.type === 'full');
    ok('空座位可被新玩家补位', jn2.type === 'joined' && jn2.player === 1, jn2.type + '/' + jn2.player);
    // 7. 重复牌作弊: 2人房间A先手, 出手里唯一一张牌的两倍
    const d1 = await open();
    d1.send({ type: 'create', game: 'norules', name: 'P1', playerCount: 2 });
    const cr2 = await d1.wait(m => m.type === 'created');
    const d2 = await open();
    d2.send({ type: 'join', room: cr2.room, game: 'norules', name: 'P2' });
    const stD = await d1.wait(m => m.type === 'start');
    const hand = stD.state.hand;
    const dup = hand.find(x => hand.filter(y => y === x).length === 1);
    if (dup !== undefined) {
      d1.send({ type: 'move', move: { action: 'play', cards: [dup, dup] } });
      const err = await d1.wait(m => m.type === 'error');
      ok('重复牌出牌被拒', err.msg.indexOf('手牌') >= 0, err.msg);
    } else ok('重复牌出牌被拒(无单张可构造)', true);
    // 8. 未开局时发move → 优雅错误
    const x1 = await open();
    x1.send({ type: 'create', game: 'norules', name: 'X', playerCount: 3 });
    const cre2b = await x1.wait(m => m.type === 'created');
    x1.send({ type: 'move', move: { action: 'play', cards: [0] } });
    const e1 = await x1.wait(m => m.type === 'error');
    ok('未开局时move优雅报错', e1.msg.indexOf('尚未开始') >= 0, e1.msg);
    console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
    process.exit(fail ? 1 : 0);
  } finally {
    srv.kill();
    await sleep(300);
  }
})().catch(e => { console.error('异常:', e.message); process.exit(2); });