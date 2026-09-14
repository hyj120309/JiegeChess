'use strict';
/*
 * 跑得快 (16张版, 3人)
 * 52张(无王), 每人16张, 余4张弃置
 * 持♠3(编码0)者先出, 首手必须含♠3
 * 出牌须为合法牌型且压过上家; 不强制压牌(可随时pass)
 * 其余人都pass后, 最后出牌者自由领出
 * 注意: 跑得快无王炸(无王), 无四带二(部分规则), 此处按常见规则:
 *   允许: 单/对/三张/三带一/三带二/顺子/连对/飞机(含翅膀)/炸弹
 */
const Cards = require('./cards');

function deal() {
  const deck = Cards.shuffle().filter(c => c < 52); // 去王
  const hands = [deck.slice(0, 16), deck.slice(16, 32), deck.slice(32, 48)];
  const discarded = deck.slice(48); // 4张弃置
  // 保证♠3在玩家手中: 若落入弃牌, 与第一手牌随机一张交换 (否则首手规则无人满足→死锁)
  const idx3 = discarded.indexOf(0);
  if (idx3 >= 0) {
    const swapIdx = Math.floor(Math.random() * 16);
    const tmp = hands[0][swapIdx];
    hands[0][swapIdx] = 0;
    discarded[idx3] = tmp;
  }
  return { hands, discarded };
}

function find3Spade(hands) {
  for (let i = 0; i < hands.length; i++) {
    if (hands[i].indexOf(0) >= 0) return i;
  }
  return 0;
}

function create(seatCount) {
  const n = 3; // 固定3人
  const { hands, discarded } = deal();
  const first = find3Spade(hands);
  const state = {
    hands,
    discarded,
    turn: first + 1,
    firstSeat: first,      // 0-based, 持♠3者
    firstMove: true,       // 首手必须含♠3
    last: null,            // {seat, combo}
    lastSeat: -1,
    passCount: 0,
    freeTurn: true,
    gameover: false,
    winner: 0,
    winType: '',
    seatCount: n,
    _views: null,
  };
  buildViews(state);
  return state;
}

function buildViews(state) {
  const views = [];
  for (let i = 0; i < state.seatCount; i++) {
    views.push({
      hand: state.hands[i].slice().sort((a, b) => a - b),
      counts: state.hands.map(h => h.length),
      turn: state.turn,
      firstSeat: state.firstSeat,
      firstMove: state.firstMove,
      last: state.last ? { seat: state.last.seat, cards: state.last.cards } : null,
      passCount: state.passCount,
      freeTurn: state.freeTurn,
      gameover: state.gameover,
      winner: state.winner,
      winType: state.winType,
      seatCount: state.seatCount,
      discardedCount: state.discarded.length,
    });
  }
  state._views = views;
}

function applyMove(state, player, move) {
  if (state.gameover) return { ok: false, errors: ['对局已结束'] };
  if (player !== state.turn) return { ok: false, errors: ['还没轮到你'] };
  if (!move || !move.action) return { ok: false, errors: ['参数错误'] };
  const seat = player - 1;
  const n = state.seatCount;

  if (move.action === 'pass') {
    if (state.freeTurn) return { ok: false, errors: ['轮到你先出牌，不能跳过'] };
    if (state.firstMove) return { ok: false, errors: ['首手必须出牌（含♠3）'] };
    state.passCount += 1;
    if (state.passCount >= n - 1) {
      state.freeTurn = true;
      state.last = null;
      state.passCount = 0;
      state.turn = state.lastSeat + 1;
    } else {
      state.turn = nextSeat(state, seat);
    }
    buildViews(state);
    return { ok: true };
  }

  if (move.action === 'play') {
    const cards = move.cards;
    if (!Array.isArray(cards) || cards.length === 0) return { ok: false, errors: ['请选择要出的牌'] };
    // 牌必须在手 (多重集校验, 防重复牌作弊)
    const hand = state.hands[seat];
    const need = {};
    for (const c of cards) need[c] = (need[c] || 0) + 1;
    const have = {};
    for (const c of hand) have[c] = (have[c] || 0) + 1;
    for (const k in need) {
      if ((have[k] || 0) < need[k]) return { ok: false, errors: ['所选牌不在你的手牌中'] };
    }
    const rm = cards.slice();
    // 必须是合法牌型 (跑得快: 不允许 four2/four2pair/rocket)
    const combo = Cards.parse(cards);
    if (!combo) return { ok: false, errors: ['不是合法牌型'] };
    if (combo.type === 'four2' || combo.type === 'four2pair' || combo.type === 'rocket')
      return { ok: false, errors: ['跑得快不允许该牌型'] };
    // 首手必须含♠3
    if (state.firstMove) {
      if (cards.indexOf(0) < 0) return { ok: false, errors: ['首手必须包含♠3'] };
      if (seat !== state.firstSeat) return { ok: false, errors: ['首手由持♠3者先出'] };
    } else if (!state.freeTurn) {
      // 压牌校验
      const lastCombo = state.last ? state.last.combo : null;
      if (lastCombo && !Cards.beats(combo, lastCombo))
        return { ok: false, errors: ['压不过上家的牌'] };
    }
    // 执行
    const played = cards.slice().sort((a, b) => a - b);
    const newHand = [];
    for (const c of hand) {
      const idx = rm.indexOf(c);
      if (idx >= 0) rm.splice(idx, 1);
      else newHand.push(c);
    }
    state.hands[seat] = newHand;
    state.last = { seat, cards: played, combo };
    state.lastSeat = seat;
    state.passCount = 0;
    state.freeTurn = false;
    state.firstMove = false;

    if (newHand.length === 0) {
      state.gameover = true;
      state.winner = player;
      state.winType = 'win';
      buildViews(state);
      return { ok: true };
    }
    state.turn = nextSeat(state, seat);
    buildViews(state);
    return { ok: true };
  }

  return { ok: false, errors: ['未知操作'] };
}

function nextSeat(state, seat) {
  const n = state.seatCount;
  let s = seat;
  for (let i = 0; i < n; i++) {
    s = (s + 1) % n;
    if (state.hands[s].length > 0) return s + 1;
  }
  return seat + 1;
}

function resign(state) {
  return { ok: false, errors: ['扑克游戏不支持认输，请销毁房间'] };
}

module.exports = {
  name: 'paodekuai', title: '跑得快',
  create, applyMove, resign,
  supportsResign: false,
  buildViews,
};