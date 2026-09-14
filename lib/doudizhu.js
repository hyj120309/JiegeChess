'use strict';
/*
 * 斗地主 (3人)
 * 54张, 每人17张, 3张底牌
 * 叫地主/抢地主两轮制; 每抢一次倍数×2; 全不叫重新发牌
 * 地主得底牌(20张)先出; 炸弹/王炸×2; 春天/反春×2
 * 积分多局累计: 地主±2*倍数, 农民各±1*倍数
 */
const Cards = require('./cards');

function deal() {
  const deck = Cards.shuffle(); // 54张
  const hands = [deck.slice(0, 17), deck.slice(17, 34), deck.slice(34, 51)];
  const bottom = deck.slice(51);
  return { hands, bottom };
}

function create(seatCount, prev) {
  const n = 3;
  // prev: 上一局 state(保留积分) 或 积分数组
  const keep = Array.isArray(prev) ? prev.slice() : (prev && prev.scores ? prev.scores.slice() : null);
  const { hands, bottom } = deal();
  const firstClaim = Math.floor(Math.random() * 3);
  const state = {
    phase: 'claim',          // claim | play
    hands,
    bottom,
    scores: keep || [0, 0, 0],
    landlord: -1,            // 0-based
    firstClaim,              // 0-based 先叫者
    claimTurn: firstClaim,   // 0-based 当前叫/抢者
    claimStage: 'call',      // call(叫) | rob(抢) | done
    claimCount: 0,           // 已表态人数
    multiplier: 1,           // 倍数(底分1)
    turn: 0,                 // play 阶段 1-based
    last: null,
    lastSeat: -1,
    passCount: 0,
    freeTurn: true,
    bombCount: 0,
    landlordPlays: 0,        // 地主出牌手数(反春判定)
    gameover: false,
    winner: 0,               // 1-based 胜者
    winType: '',             // win | spring | antispring
    seatCount: n,
    _views: null,
  };
  buildViews(state);
  return state;
}

function buildViews(state) {
  const views = [];
  const claimOpen = state.phase === 'play'; // 定地主后底牌可见
  for (let i = 0; i < state.seatCount; i++) {
    views.push({
      phase: state.phase,
      hand: state.hands[i].slice().sort((a, b) => a - b),
      counts: state.hands.map(h => h.length),
      bottom: claimOpen ? state.bottom.slice() : [],
      bottomCount: state.bottom.length,
      scores: state.scores.slice(),
      landlord: state.landlord,
      firstClaim: state.firstClaim,
      claimTurn: state.claimTurn,
      claimStage: state.claimStage,
      claimCount: state.claimCount,
      multiplier: state.multiplier,
      turn: state.turn,
      last: state.last ? { seat: state.last.seat, cards: state.last.cards } : null,
      passCount: state.passCount,
      freeTurn: state.freeTurn,
      bombCount: state.bombCount,
      gameover: state.gameover,
      winner: state.winner,
      winType: state.winType,
      seatCount: state.seatCount,
      redealCount: state.redealCount || 0,
    });
  }
  state._views = views;
}

function applyMove(state, player, move) {
  if (state.gameover) return { ok: false, errors: ['对局已结束'] };
  if (!move || !move.action) return { ok: false, errors: ['参数错误'] };
  const seat = player - 1;
  const n = state.seatCount;

  // ---------- 叫/抢阶段 ----------
  if (state.phase === 'claim') {
    if (move.action !== 'claim') return { ok: false, errors: ['当前是叫地主阶段'] };
    if (state.claimTurn !== seat) return { ok: false, errors: ['还没轮到你表态'] };
    const take = !!move.take;

    if (state.claimStage === 'call') {
      state.claimCount += 1;
      if (take) {
        // 有人叫 → 进入抢阶段, 其余两家依次表态
        state.landlord = seat;
        state.claimStage = 'rob';
        state.claimCount = 0;
        state.claimTurn = (seat + 1) % n;
      } else {
        if (state.claimCount >= n) {
          // 全不叫 → 重新发牌(保留积分)
          const redealCount = (state.redealCount || 0) + 1;
          const fresh = create(n, state);
          Object.assign(state, fresh);
          state.redealCount = redealCount;
          buildViews(state);
          return { ok: true, redeal: true };
        }
        state.claimTurn = (seat + 1) % n;
      }
    } else if (state.claimStage === 'rob') {
      state.claimCount += 1;
      if (take) {
        state.landlord = seat;
        state.multiplier *= 2;
      }
      if (state.claimCount >= n - 1) {
        // 抢完 → 定地主
        finishClaim(state);
      } else {
        state.claimTurn = (state.claimTurn + 1) % n;
      }
    }
    buildViews(state);
    return { ok: true };
  }

  // ---------- 出牌阶段 ----------
  if (player !== state.turn) return { ok: false, errors: ['还没轮到你'] };

  if (move.action === 'pass') {
    if (state.freeTurn) return { ok: false, errors: ['轮到你先出牌，不能不要'] };
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
    const combo = Cards.parse(cards);
    if (!combo) return { ok: false, errors: ['不是合法牌型'] };
    if (!state.freeTurn) {
      const lastCombo = state.last ? state.last.combo : null;
      if (lastCombo && !Cards.beats(combo, lastCombo)) return { ok: false, errors: ['压不过上家的牌'] };
    }
    // 炸弹/王炸翻倍
    if (combo.type === 'bomb' || combo.type === 'rocket') state.multiplier *= 2;

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
    if (seat === state.landlord) state.landlordPlays += 1;

    if (newHand.length === 0) {
      finishGame(state, seat);
      buildViews(state);
      return { ok: true };
    }
    state.turn = nextSeat(state, seat);
    buildViews(state);
    return { ok: true };
  }

  return { ok: false, errors: ['未知操作'] };
}

function finishClaim(state) {
  state.claimStage = 'done';
  state.phase = 'play';
  // 地主拿底牌
  const lh = state.hands[state.landlord];
  state.bottom.forEach(c => lh.push(c));
  lh.sort((a, b) => a - b);
  state.turn = state.landlord + 1;
  state.freeTurn = true;
  state.last = null;
  state.lastSeat = state.landlord;
}

function finishGame(state, winnerSeat) {
  state.gameover = true;
  state.winner = winnerSeat + 1;
  const landlordWin = winnerSeat === state.landlord;
  // 春天: 地主赢且两农民一张未出(手牌仍17张)
  // 反春: 农民赢且地主只出过1手
  if (landlordWin) {
    const farmers = [0, 1, 2].filter(s => s !== state.landlord);
    const spring = farmers.every(s => state.hands[s].length === 17);
    state.winType = spring ? 'spring' : 'win';
    if (spring) state.multiplier *= 2;
  } else {
    const anti = state.landlordPlays <= 1;
    state.winType = anti ? 'antispring' : 'win';
    if (anti) state.multiplier *= 2;
  }
  // 积分: 底分1
  const m = state.multiplier;
  for (let s = 0; s < 3; s++) {
    if (s === state.landlord) state.scores[s] += landlordWin ? 2 * m : -2 * m;
    else state.scores[s] += landlordWin ? -m : m;
  }
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
  name: 'doudizhu', title: '斗地主',
  create, applyMove, resign,
  supportsResign: false,
  buildViews,
};