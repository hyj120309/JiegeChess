'use strict';
const wsLib = require('ws');

const HOST = process.env.HOST || 'localhost';
const PORT = process.env.PORT || 8080;
const URL = `ws://${HOST}:${PORT}/`;

let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('  ✔', name); }
  else { failed++; console.log('  ✘', name, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); }
}

function client() {
  const ws = new wsLib(URL);
  const msgs = [];
  const waiters = [];
  ws.on('message', d => {
    const m = JSON.parse(d);
    msgs.push(m);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i](m)) { waiters.splice(i, 1); }
    }
  });
  return {
    ws,
    send(o) { if (ws.readyState === 1) ws.send(JSON.stringify(o)); },
    wait(pred, ms = 5000) {
      for (let i = 0; i < msgs.length; i++) {
        if (pred(msgs[i])) { msgs.splice(i, 1); return Promise.resolve(msgs[i]); }
      }
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout: ' + (pred.name || 'pred'))), ms);
        waiters.push(m => { if (pred(m)) { clearTimeout(t); resolve(m); return true; } return false; });
      });
    },
    drain() { msgs.length = 0; waiters.length = 0; }
  };
}

function open() {
  return new Promise((resolve, reject) => {
    const c = client();
    c.ws.on('open', () => resolve(c));
    c.ws.on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  // ========== 五子棋 ==========
  console.log('== 五子棋 ==');
  {
    const a = await open();
    a.send({ type: 'create', game: 'gomoku', name: '甲' });
    const cre = await a.wait(m => m.type === 'created');
    check('created room', /^\d{6}$/.test(cre.room));

    const b = await open();
    b.send({ type: 'join', room: cre.room, game: 'gomoku', name: '乙' });
    await b.wait(m => m.type === 'joined');
    await b.wait(m => m.type === 'start');
    await a.wait(m => m.type === 'start');

    // Black (player1=A) wins: y=7, x=7,8,9,10,11
    // White (player2=B) fills y=8 non-blocking
    const moves = [
      ['black', [7,7]], ['white', [7,8]],
      ['black', [8,7]], ['white', [8,8]],
      ['black', [9,7]], ['white', [9,8]],
      ['black', [10,7]], ['white', [10,8]],
      ['black', [11,7]]
    ];
    let result;
    for (const [side, [mx, my]] of moves) {
      const sender = side === 'black' ? a : b;
      // drain everyone to avoid stale matches
      a.drain(); b.drain();
      sender.send({ type: 'move', x: mx, y: my });
      // wait for state where last.x==mx && last.y==my
      result = await sender.wait(m => m.type === 'state' && m.state.last && m.state.last.x === mx && m.state.last.y === my);
      if (result.state.gameover) break;
    }
    check('gomoku gameover', result.state.gameover);
    check('gomoku winner=1', result.state.winner === 1);
    check('gomoku win=5', result.state.win && result.state.win.length === 5);
    a.ws.close(); b.ws.close();
  }

  // ========== 中国象棋 ==========
  console.log('\n== 中国象棋 ==');
  {
    const a = await open();  // red
    a.send({ type: 'create', game: 'xiangqi', name: '红' });
    const cre = await a.wait(m => m.type === 'created');
    const b = await open();  // black
    b.send({ type: 'join', room: cre.room, game: 'xiangqi', name: '黑' });
    await b.wait(m => m.type === 'joined');
    await b.wait(m => m.type === 'start');
    await a.wait(m => m.type === 'start');

    // Helper: xiangqi move with exact match
    async function xMove(sender, from, to) {
      a.drain(); b.drain();
      sender.send({ type: 'move', move: { from, to } });
      return sender.wait(m =>
        m.type === 'state' &&
        m.state.last &&
        m.state.last.from.x === from.x && m.state.last.from.y === from.y &&
        m.state.last.to.x === to.x && m.state.last.to.y === to.y
      );
    }

    // select soldier (4,6)
    a.drain(); b.drain();
    a.send({ type: 'select', from: { x: 4, y: 6 } });
    const h = await a.wait(m => m.type === 'hints');
    check('select soldier -> hints', h.to.length > 0);
    check('soldier forward (4,5)', h.to.some(t => t.x === 4 && t.y === 5));

    // red soldier (4,6)->(4,5)
    const s1 = await xMove(a, { x: 4, y: 6 }, { x: 4, y: 5 });
    check('red soldier -> (4,5)', s1.state.board[5][4] === 'P' && s1.state.board[6][4] === '.');

    // black cannon (7,2)->(7,5)
    const s2 = await xMove(b, { x: 7, y: 2 }, { x: 7, y: 5 });
    check('black cannon -> (7,5)', s2.state.board[5][7] === 'c');

    // red soldier (4,5)->(4,4) crosses river
    const s3 = await xMove(a, { x: 4, y: 5 }, { x: 4, y: 4 });
    check('soldier crosses river', s3.state.board[4][4] === 'P');

    // black must move before red can select again
    await xMove(b, { x: 1, y: 2 }, { x: 1, y: 5 });

    // select crossed soldier -> sideways
    a.drain(); b.drain();
    a.send({ type: 'select', from: { x: 4, y: 4 } });
    const h2 = await a.wait(m => m.type === 'hints');
    check('crossed soldier sideways', h2.to.some(t => t.x === 3 && t.y === 4) && h2.to.some(t => t.x === 5 && t.y === 4));

    // red moves rook
    const s5 = await xMove(a, { x: 8, y: 9 }, { x: 8, y: 8 });
    check('red rook (8,9)->(8,8)', s5.state.board[8][8] === 'R');

    // black resigns
    a.drain(); b.drain();
    b.send({ type: 'resign' });
    const rs = await b.wait(m => m.type === 'state' && m.state.gameover);
    check('xiangqi resign gameover', rs.state.gameover && rs.state.winner === 1);

    // rematch
    a.drain(); b.drain();
    a.send({ type: 'rematch' });
    const rm = await a.wait(m => m.type === 'rematch');
    check('rematch resets', !rm.state.gameover && rm.state.board[9][4] === 'K' && rm.state.board[0][4] === 'k');
    a.ws.close(); b.ws.close();
  }

  // ========== 围棋 ==========
  console.log('\n== 围棋 ==');
  {
    const a = await open();
    a.send({ type: 'create', game: 'go', name: '黑' });
    const cre = await a.wait(m => m.type === 'created');
    const b = await open();
    b.send({ type: 'join', room: cre.room, game: 'go', name: '白' });
    await b.wait(m => m.type === 'joined');
    await b.wait(m => m.type === 'start');
    await a.wait(m => m.type === 'start');

    async function goMove(sender, x, y) {
      a.drain(); b.drain();
      sender.send({ type: 'move', x, y });
      return sender.wait(m => m.type === 'state' && m.state.last && m.state.last.x === x && m.state.last.y === y);
    }

    // Capture: B(1,0), W(0,0), B(0,1) -> captures W(0,0)
    await goMove(a, 1, 0);
    await goMove(b, 0, 0);
    const cap = await goMove(a, 0, 1);
    check('go capture caps=1', cap.state.caps[1] === 1);
    check('go ko=(0,0)', cap.state.ko && cap.state.ko.x === 0 && cap.state.ko.y === 0);

    // Ko recapture forbidden
    a.drain(); b.drain();
    b.send({ type: 'move', x: 0, y: 0 });
    const koErr = await b.wait(m => m.type === 'error');
    check('ko rejected', koErr.msg.includes('劫'));

    // Play elsewhere to clear ko
    await goMove(b, 18, 18);

    // Double pass -> scoring
    a.drain(); b.drain();
    a.send({ type: 'pass' });
    await a.wait(m => m.type === 'state' && m.state.passCount >= 1);
    a.drain(); b.drain();
    b.send({ type: 'pass' });
    const sc = await b.wait(m => m.type === 'state' && m.state.phase === 'scoring');
    check('scoring phase', sc.state.phase === 'scoring');

    // Mark dead
    a.drain(); b.drain();
    b.send({ type: 'markDead', x: 18, y: 18, dead: true });
    const md = await b.wait(m => m.type === 'state' && m.state.dead.length > 0);
    check('mark dead', md.state.dead.length === 1);

    // Confirm score
    a.drain(); b.drain();
    a.send({ type: 'confirmScore' });
    await a.wait(m => m.type === 'state');
    a.drain(); b.drain();
    b.send({ type: 'confirmScore' });
    const fin = await b.wait(m => m.type === 'state' && m.state.gameover);
    check('score settled', fin.state.winType === 'score');
    check('score numbers', typeof fin.state.score.black === 'number' && typeof fin.state.score.white === 'number');
    console.log('    score:', JSON.stringify(fin.state.score));

    // Resign in fresh room
    const c2 = await open();
    c2.send({ type: 'create', game: 'go', name: 'X' });
    const cre2 = await c2.wait(m => m.type === 'created');
    const d2 = await open();
    d2.send({ type: 'join', room: cre2.room, game: 'go', name: 'Y' });
    await d2.wait(m => m.type === 'joined');
    await d2.wait(m => m.type === 'start');
    await c2.wait(m => m.type === 'start');
    c2.drain(); d2.drain();
    c2.send({ type: 'resign' });
    const rs2 = await c2.wait(m => m.type === 'state');
    check('go resign', rs2.state.gameover && rs2.state.winner === 2);
    c2.ws.close(); d2.ws.close();
    a.ws.close(); b.ws.close();
  }

  console.log(`\n============================`);
  console.log(`结果: ${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('测试异常:', e.message); process.exit(2); });