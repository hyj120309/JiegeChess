'use strict';
/*
 * 无规则扑克 (2-5人)
 * 服务器发牌: 54张尽量均分(余牌弃置), 座位0先出
 * 出牌: 任意非空子集(无牌型校验); 跳过: pass
 * 连续 N-1 家跳过后重新自由领出; 先出完手牌者胜
 */
const Cards = require('./cards');

function dealDeck(n) {
  const deck = Cards.shuffle();
  const per = Math.floor(deck.length / n);
  const hands = [];
  for (let i = 0; i < n; i++) hands.push(deck.slice(i * per, (i + 1) * per));
  return hands; // 余牌 (deck.length % n) 弃置
}

function create(seatCount) {
  const n = Math.max(2, Math.min(5, seatCount || 3));
  const hands = dealDeck(n);
  const state = {
    hands,
    turn: 1,          // 1-based player
    last: null,       // {seat, cards}
    lastSeat: 0,      // 最后出牌者座位 (0-based)
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

// 按人生成视图: 自己手牌明文, 他人只有张数
function buildViews(state) {
  const views = [];
  for (let i = 0; i < state.seatCount; i++) {
    views.push({
      hand: state.hands[i].slice().sort((a, b) => a - b),
      counts: state.hands.map(h => h.length),
      turn: state.turn,
      last: state.last,
      lastSeat: state.lastSeat,
      passCount: state.passCount,
      freeTurn: state.freeTurn,
      gameover: state.gameover,
      winner: state.winner,
      winType: state.winType,
      seatCount: state.seatCount,
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
    state.passCount += 1;
    if (state.passCount >= n - 1) {
      // 其余玩家都不要 → 最后出牌者重新领出
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
    // 校验: 牌必须都在自己手里
    const handSet = {};
    for (const c of state.hands[seat]) handSet[c] = (handSet[c] || 0) + 1;
    for (const c of cards) {
      if (!handSet[c]) return { ok: false, errors: ['所选牌不在你的手牌中'] };
      handSet[c] -= 1;
      if (handSet[c] < 0) return { ok: false, errors: ['所选牌不在你的手牌中'] };
    }
    // 从手里移除
    const played = cards.slice().sort((a, b) => a - b);
    const newHand = [];
    const rm = played.slice();
    for (const c of state.hands[seat]) {
      const idx = rm.indexOf(c);
      if (idx >= 0) rm.splice(idx, 1);
      else newHand.push(c);
    }
    state.hands[seat] = newHand;
    state.last = { seat, cards: played };
    state.lastSeat = seat;
    state.passCount = 0;
    state.freeTurn = false;

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

// 牌类不支持认输 (用销毁房间代替)
function resign(state, player) {
  return { ok: false, errors: ['扑克游戏不支持认输，请销毁房间'] };
}

module.exports = {
  name: 'norules', title: '无规则扑克',
  create, applyMove, resign,
  supportsResign: false,
  buildViews,
};