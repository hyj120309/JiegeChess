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
// 首手玩家一定能出含♠3的牌
const st1 = PDK.create(3);
const fh1 = st1.hands[st1.firstSeat];
ok('首手玩家持有♠3', fh1.indexOf(0) >= 0);
ok('首手玩家出♠3单张被接受', PDK.applyMove(st1, st1.firstSeat + 1, { action: 'play', cards: [0] }).ok);

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);