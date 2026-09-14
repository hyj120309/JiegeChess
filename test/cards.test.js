'use strict';
/* 牌型引擎单元测试: node test/cards.test.js */
const C = require('../lib/cards');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✔ ' + name); }
  else { fail++; console.log('  ✘ ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra) : '')); }
}
function T(cards) { return cards.map(c => C.cardName(c)).join(' '); }
// 构造: rank*4+suit, suit 0=♠ 1=♥ 2=♣ 3=♦
const R = r => r * 4; // ♠

// ---------- 牌型识别 ----------
console.log('== parse 牌型识别 ==');
ok('单张', C.parse([R(0)]).type === 'single');
ok('对子', C.parse([R(5), R(5) + 1]).type === 'pair');
ok('三张', C.parse([R(7), R(7) + 1, R(7) + 2]).type === 'triple');
ok('三带一', C.parse([R(7), R(7) + 1, R(7) + 2, R(3)]).type === 'triple1');
ok('三带二', C.parse([R(7), R(7) + 1, R(7) + 2, R(3), R(3) + 1]).type === 'triple2');
ok('顺子5张', C.parse([R(0), R(1), R(2), R(3), R(4)]).type === 'straight');
ok('顺子含2无效', C.parse([R(8), R(9), R(10), R(11), R(12)]) === null);
ok('顺子4张无效', C.parse([R(0), R(1), R(2), R(3)]) === null);
ok('连对3对', C.parse([R(3), R(3) + 1, R(4), R(4) + 1, R(5), R(5) + 1]).type === 'pairs');
ok('连对2对无效', C.parse([R(3), R(3) + 1, R(4), R(4) + 1]) === null);
ok('炸弹', C.parse([R(9), R(9) + 1, R(9) + 2, R(9) + 3]).type === 'bomb');
ok('王炸', C.parse([52, 53]).type === 'rocket');
ok('飞机不带', C.parse([R(3), R(3) + 1, R(3) + 2, R(4), R(4) + 1, R(4) + 2]).type === 'plane');
ok('飞机带单', C.parse([R(3), R(3) + 1, R(3) + 2, R(4), R(4) + 1, R(4) + 2, R(8), R(9)]).type === 'plane1');
ok('飞机带对', C.parse([R(3), R(3) + 1, R(3) + 2, R(4), R(4) + 1, R(4) + 2, R(8), R(8) + 1, R(9), R(9) + 1]).type === 'plane2');
ok('四带二单', C.parse([R(9), R(9) + 1, R(9) + 2, R(9) + 3, R(2), R(5)]).type === 'four2');
ok('四带二对', C.parse([R(9), R(9) + 1, R(9) + 2, R(9) + 3, R(2), R(2) + 1, R(5), R(5) + 1]).type === 'four2pair');
ok('大小王混出无效', C.parse([52, R(3)]) === null);
ok('散牌无效', C.parse([R(0), R(2), R(5)]) === null);

// ---------- 大小比较 ----------
console.log('== beats 大小比较 ==');
const P = cs => C.parse(cs);
ok('单张大压小', C.beats(P([R(5)]), P([R(3)])));
ok('单张小不能压大', !C.beats(P([R(3)]), P([R(5)])));
ok('2最大压A', C.beats(P([R(12)]), P([R(11)])));
ok('王压任何单牌', C.beats(P([53]), P([R(12)])));
ok('对子压对子', C.beats(P([R(6), R(6) + 1]), P([R(5), R(5) + 1])));
ok('对子不能压单张', !C.beats(P([R(3), R(3) + 1]), P([R(12)])));
ok('炸弹压单张', C.beats(P([R(3), R(3) + 1, R(3) + 2, R(3) + 3]), P([R(12)])));
ok('炸弹压炸弹', C.beats(P([R(6), R(6) + 1, R(6) + 2, R(6) + 3]), P([R(3), R(3) + 1, R(3) + 2, R(3) + 3])));
ok('王炸压炸弹', C.beats(P([52, 53]), P([R(3), R(3) + 1, R(3) + 2, R(3) + 3])));
ok('炸弹不能压王炸', !C.beats(P([R(3), R(3) + 1, R(3) + 2, R(3) + 3]), P([52, 53])));
ok('顺子同长比较', C.beats(P([R(4), R(5), R(6), R(7), R(8)]), P([R(3), R(4), R(5), R(6), R(7)])));
ok('顺子不同长不能压', !C.beats(P([R(4), R(5), R(6), R(7), R(8)]), P([R(2), R(3), R(4), R(5), R(6), R(7)])));
ok('三带一比三带一', C.beats(P([R(8), R(8) + 1, R(8) + 2, R(0)]), P([R(7), R(7) + 1, R(7) + 2, R(11)])));
ok('三带一不能压三带二', !C.beats(P([R(8), R(8) + 1, R(8) + 2, R(0)]), P([R(7), R(7) + 1, R(7) + 2, R(3), R(3) + 1])));

// ---------- 提示 ----------
console.log('== findHint 提示 ==');
ok('自由出牌给最小单张', JSON.stringify(C.findHint([R(5), R(9), R(2)], null)) === JSON.stringify([R(2)]));
ok('压单张给最小可压', JSON.stringify(C.findHint([R(2), R(5), R(9)], [R(4)])) === JSON.stringify([R(5)]));
ok('压对子', JSON.stringify(C.findHint([R(5), R(5) + 1, R(9), R(9) + 1], [R(4), R(4) + 1])) === JSON.stringify([R(5), R(5) + 1]));
ok('无牌可压返回null', C.findHint([R(2), R(3)], [R(4), R(4) + 1]) === null);
ok('压不过时给炸弹', C.parse(C.findHint([R(3), R(3) + 1, R(3) + 2, R(3) + 3, R(2)], [R(11), R(11) + 1])).type === 'bomb');
ok('压不过时给王炸', JSON.stringify(C.findHint([52, 53, R(2)], [R(11), R(11) + 1])) === JSON.stringify([52, 53]));
ok('压顺子', C.parse(C.findHint([R(4), R(5), R(6), R(7), R(8), R(9)], [R(3), R(4), R(5), R(6), R(7)])) !== null
  && C.parse(C.findHint([R(4), R(5), R(6), R(7), R(8), R(9)], [R(3), R(4), R(5), R(6), R(7)])).type === 'straight');
ok('无顺可压返回null', C.findHint([R(0), R(1), R(2)], [R(3), R(4), R(5), R(6), R(7)]) === null);

// ---------- 编码 ----------
console.log('== 编码 ==');
ok('rankOf 3♠=0', C.rankOf(0) === 0);
ok('rankOf 2♠=12', C.rankOf(48) === 12);
ok('rankOf 小王=13', C.rankOf(52) === 13);
ok('rankOf 大王=14', C.rankOf(53) === 14);
ok('cardName 大王', C.cardName(53) === '大王');
ok('牌库无王52张', C.DECK_NO_JOKER.length === 52);
ok('洗牌保持54张', C.shuffle().length === 54);

// ---------- 跑得快发牌死锁回归 ----------
console.log('== 跑得快 ♠3 死锁回归 ==');
const PDK = require('../lib/paodekuai');
let sp3InHand = 0;
for (let i = 0; i < 10000; i++) {
  const st = PDK.create(3);
  const all = st.hands[0].concat(st.hands[1], st.hands[2]);
  if (all.indexOf(0) >= 0) sp3InHand++;
}
ok('♠3必在玩家手中(10000次)', sp3InHand === 10000, sp3InHand);
const st1 = PDK.create(3);
const fh1 = st1.hands[st1.firstSeat];
ok('首手玩家持有♠3', fh1.indexOf(0) >= 0);
ok('首手玩家出♠3单张被接受', PDK.applyMove(st1, st1.firstSeat + 1, { action: 'play', cards: [0] }).ok);

// ---------- 强制压牌 ----------
console.log('== 跑得快强制压牌 ==');
// 场景1: 有炸弹能压过时pass被拒 (A出了5, B手牌含炸弹可压)
{
  const st = PDK.create(3);
  st.hands = [[20], [0, 1, 2, 3], [8, 12, 16]]; // A出8(20), B有炸弹(四张3)
  st.firstMove = false; st.firstSeat = 0; st.freeTurn = false;
  st.turn = 2; st.passCount = 0; st.lastSeat = 0;
  st.last = { seat: 0, cards: [20], combo: C.parse([20]) }; // A出了8
  const r1 = PDK.applyMove(st, 2, { action: 'pass' });
  ok('有炸弹能压过时pass被拒', !r1.ok && r1.errors.join('').indexOf('必须出牌') >= 0, r1.errors);
}
// 场景2: 无牌可压时pass通过 (A出了2, B手中只有3)
{
  const st = PDK.create(3);
  st.hands = [[48], [0, 1, 2], [4, 5, 6]]; // B有三张3(rank0), 无法压2(rank12)
  st.firstMove = false; st.firstSeat = 0; st.freeTurn = false;
  st.turn = 2; st.passCount = 1; st.lastSeat = 0;
  st.last = { seat: 0, cards: [48], combo: C.parse([48]) };
  const r2 = PDK.applyMove(st, 2, { action: 'pass' });
  ok('无牌能压2时pass通过', r2.ok === true, r2.errors);
}
// 场景3: hint() 校验
{
  const st = PDK.create(3);
  st.turn = st.firstSeat + 1; st.firstMove = true;
  const h1 = PDK.hint(st, st.firstSeat + 1);
  ok('轮到出牌时hint返回♠3', h1.ok && JSON.stringify(h1.cards) === '[0]', h1);
  const h2 = PDK.hint(st, ((st.firstSeat + 1) % 3) + 1);
  ok('非轮到者hint被拒', !h2.ok, h2);
}
console.log('== 跑得快 ♠3 死锁回归 ==');

// ---------- 提示: 飞机/四带二同型搜索 (M2回归) ----------
console.log('== findHint 飞机/四带二 ==');
// 飞机不带 (rank映射: 12-15=6s, 16-19=7s, 20-23=8s, 24-27=9s)
const oppPlane = [12, 13, 14, 16, 17, 18]; // 666 777 (rank3)
const myPlane = [20, 21, 22, 24, 25, 26, 8]; // 888 999 + 5
const hPlane = C.findHint(myPlane, oppPlane);
ok('同型飞机可提示', hPlane && C.parse(hPlane) && C.parse(hPlane).type === 'plane', hPlane);
ok('提示飞机rank正确(5>3)', hPlane && C.parse(hPlane).rank === C.rankOf(20), hPlane && C.parse(hPlane));
// 飞机带单
const oppP1 = [12, 13, 14, 16, 17, 18, 30, 40]; // 666777+10+K
const myP1 = [20, 21, 22, 24, 25, 26, 34, 44]; // 888999+Q+A
const hP1 = C.findHint(myP1, oppP1);
ok('同型飞机带单可提示', hP1 && C.parse(hP1) && C.parse(hP1).type === 'plane1', hP1);
ok('飞机带单张数正确(6+2=8)', hP1 && hP1.length === 8, hP1 && hP1.length);
// 飞机带对
const oppP2 = [12, 13, 14, 16, 17, 18, 30, 31, 40, 41]; // 666777+1010+KK
const myP2 = [20, 21, 22, 24, 25, 26, 34, 35, 44, 45]; // 888999+QQ+AA
const hP2 = C.findHint(myP2, oppP2);
ok('同型飞机带对可提示', hP2 && C.parse(hP2) && C.parse(hP2).type === 'plane2', hP2);
// 四带二(两单): K=rank10, A=rank11
const oppF2 = [40, 41, 42, 43, 8, 12]; // KKKK+5+6
const myF2 = [44, 45, 46, 47, 20, 24]; // AAAA+8+9
const hF2 = C.findHint(myF2, oppF2);
ok('同型四带二可提示', hF2 && C.parse(hF2) && C.parse(hF2).type === 'four2', hF2);
ok('四带二不再浪费炸弹', hF2 && C.parse(hF2).type === 'four2', hF2 && C.parse(hF2) && C.parse(hF2).type);
// 四带二对
const oppF4 = [40, 41, 42, 43, 8, 9, 12, 13]; // KKKK+55+66
const myF4 = [44, 45, 46, 47, 20, 21, 24, 25]; // AAAA+88+99
const hF4 = C.findHint(myF4, oppF4);
ok('同型四带二对可提示', hF4 && C.parse(hF4) && C.parse(hF4).type === 'four2pair', hF4);
// 无同型时仍走炸弹兜底
const noPlane = [8, 12, 16]; // 无三张
const hNo = C.findHint(noPlane, oppPlane);
ok('无飞机可压返回null', hNo === null, hNo);
// 压不过更大飞机 → 炸弹兜底
const hBomb = C.findHint([48, 49, 50, 51, 0], oppPlane); // 2222炸弹
ok('压不过时给炸弹', hBomb && C.parse(hBomb).type === 'bomb', hBomb);

// ---------- 翅膀池重构回归 (G1/G2/G3) ----------
console.log('== findHint 翅膀池重构 ==');
// G1: plane1翅膀同rank两张单牌 (此前误报无解)
const hG1 = C.findHint([20, 21, 22, 24, 25, 26, 34, 35], [12, 13, 14, 16, 17, 18, 28, 32]); // 888999+JJ 压 666777+10+J
ok('G1同rank双单翅膀可提示', hG1 && C.parse(hG1) && C.parse(hG1).type === 'plane1', hG1);
ok('G1翅膀为两张J', hG1 && hG1.indexOf(34) >= 0 && hG1.indexOf(35) >= 0 && hG1.length === 8, hG1);
// G2: plane1主体rank第4张作翅膀 (此前浪费炸弹)
const hG2 = C.findHint([8, 9, 10, 11, 12, 13, 14, 28], [0, 1, 2, 4, 5, 6, 24, 28]); // 5555+666+10 压 333444+9+10
ok('G2主体余牌作翅膀不再出炸弹', hG2 && C.parse(hG2) && C.parse(hG2).type === 'plane1', hG2);
ok('G2翅膀含第4张5', hG2 && hG2.filter(c => c >= 8 && c <= 11).length === 4, hG2); // 主体3张+翅膀1张=4张5
// G3: plane2翅膀4张同rank当两对 (此前浪费炸弹)
const hG3 = C.findHint([20, 21, 22, 24, 25, 26, 0, 1, 2, 3], [8, 9, 10, 12, 13, 14, 16, 17, 20, 21]); // 888999+3333 压 555666+77+88
ok('G3拆炸两对翅膀可提示', hG3 && C.parse(hG3) && C.parse(hG3).type === 'plane2', hG3);
// G3b: 有自然对时优先自然对, 不拆炸弹
const hG3b = C.findHint([20, 21, 22, 24, 25, 26, 8, 9, 12, 13, 0, 1, 2, 3], [8, 9, 10, 12, 13, 14, 16, 17, 20, 21]); // 888999+55+66+3333
ok('G3b优先自然对', hG3b && C.parse(hG3b) && C.parse(hG3b).type === 'plane2', hG3b);
ok('G3b不拆炸弹(不含3)', hG3b && hG3b.filter(c => c < 4).length === 0, hG3b);
// 邻接翅膀安全网: 翅膀3张同rank且与主体相邻 → parse视为更长飞机 → 提示应为null
const hAdj = C.findHint([20, 21, 22, 24, 25, 26, 28, 29, 30, 32, 33, 34], [12, 13, 14, 16, 17, 18, 20, 21, 22, 0, 4, 8]); // 888999+101010+JJJ 压 666777888+3+4+5
ok('邻接翅膀parse一致性返回null', hAdj === null, hAdj);

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);