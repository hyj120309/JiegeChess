'use strict';
/*
 * 同构扑克牌引擎（Node require / 浏览器 window.Cards 共用）
 * 牌编码: 0..51 普通牌 = rank*4+suit, rank 0..12 = 3,4,5,6,7,8,9,10,J,Q,K,A,2
 *         suit 0..3 = ♠♥♣♦;  52=小王, 53=大王
 */

var RANK_NAMES = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
var SUIT_CHARS = ['♠', '♥', '♣', '♦'];

function rankOf(c) { return c >= 52 ? (c === 53 ? 14 : 13) : Math.floor(c / 4); }
function suitOf(c) { return c >= 52 ? -1 : (c % 4); }

function cardName(c) {
  if (c === 52) return '小王';
  if (c === 53) return '大王';
  return SUIT_CHARS[suitOf(c)] + RANK_NAMES[rankOf(c)];
}

// 统计手牌: {rank: [cards]}
function groupByRank(cards) {
  var g = {};
  for (var i = 0; i < cards.length; i++) {
    var r = rankOf(cards[i]);
    if (!g[r]) g[r] = [];
    g[r].push(cards[i]);
  }
  return g;
}

function sortedRanks(g) {
  var ks = Object.keys(g);
  var rs = [];
  for (var i = 0; i < ks.length; i++) rs.push(+ks[i]);
  rs.sort(function (a, b) { return a - b; });
  return rs;
}

// 连续 rank 序列检测（不含 2=12 和王）
function isConsecutive(ranks) {
  if (ranks.length === 0) return false;
  for (var i = 1; i < ranks.length; i++) {
    if (ranks[i] !== ranks[i - 1] + 1) return false;
  }
  return ranks[ranks.length - 1] < 12; // 2 不能进顺子
}

/*
 * 牌型识别 → { type, rank, len, cards }
 * type: 'single','pair','triple','triple1','triple2','straight','pairs',
 *       'plane','plane1','plane2','four2','bomb','rocket', null(无效)
 */
function parse(cards) {
  if (!cards || cards.length === 0) return null;
  var cs = cards.slice().sort(function (a, b) { return a - b; });
  var n = cs.length;
  var g = groupByRank(cs);
  var ranks = sortedRanks(g);
  var counts = {};
  for (var i = 0; i < ranks.length; i++) counts[ranks[i]] = g[ranks[i]].length;

  // 王炸
  if (n === 2 && cs[0] === 52 && cs[1] === 53) return { type: 'rocket', rank: 100, len: 1, cards: cs };
  // 单张
  if (n === 1) return { type: 'single', rank: rankOf(cs[0]), len: 1, cards: cs };
  // 对子
  if (n === 2 && counts[ranks[0]] === 2 && ranks[0] < 13)
    return { type: 'pair', rank: ranks[0], len: 1, cards: cs };
  // 炸弹
  if (n === 4 && ranks.length === 1) return { type: 'bomb', rank: ranks[0], len: 1, cards: cs };
  // 三张
  if (n === 3 && ranks.length === 1) return { type: 'triple', rank: ranks[0], len: 1, cards: cs };
  // 三带一
  if (n === 4 && ranks.length === 2) {
    var t3 = -1, t1 = -1;
    for (i = 0; i < ranks.length; i++) { if (counts[ranks[i]] === 3) t3 = ranks[i]; else t1 = ranks[i]; }
    if (t3 >= 0 && t1 >= 0) return { type: 'triple1', rank: t3, len: 1, cards: cs };
  }
  // 三带二
  if (n === 5 && ranks.length === 2) {
    var t3b = -1, t2b = -1;
    for (i = 0; i < ranks.length; i++) { if (counts[ranks[i]] === 3) t3b = ranks[i]; else if (counts[ranks[i]] === 2) t2b = ranks[i]; }
    if (t3b >= 0 && t2b >= 0) return { type: 'triple2', rank: t3b, len: 1, cards: cs };
  }
  // 顺子 (≥5)
  if (n >= 5 && ranks.length === n && isConsecutive(ranks))
    return { type: 'straight', rank: ranks[0], len: n, cards: cs };
  // 连对 (≥3对)
  if (n >= 6 && n % 2 === 0 && ranks.length === n / 2) {
    var allPairs = true;
    for (i = 0; i < ranks.length; i++) if (counts[ranks[i]] !== 2) allPairs = false;
    if (allPairs && isConsecutive(ranks)) return { type: 'pairs', rank: ranks[0], len: ranks.length, cards: cs };
  }
  // 飞机: ≥2 组连续三张
  var tripRanks = [];
  for (i = 0; i < ranks.length; i++) if (counts[ranks[i]] >= 3) tripRanks.push(ranks[i]);
  // 找最长连续三张序列（贪心从每个起点）
  var best = null;
  for (i = 0; i < tripRanks.length; i++) {
    var seq = [tripRanks[i]];
    for (var j = i + 1; j < tripRanks.length; j++) {
      if (tripRanks[j] === seq[seq.length - 1] + 1 && tripRanks[j] < 12) seq.push(tripRanks[j]);
      else break;
    }
    if (seq.length >= 2 && (!best || seq.length > best.length)) best = seq;
  }
  if (best && best.length >= 2) {
    var planeLen = best.length;
    var planeCards = 3 * planeLen;
    if (n === planeCards) return { type: 'plane', rank: best[0], len: planeLen, cards: cs };
    if (n === planeCards + planeLen) {
      // 飞机带单翅（余牌为 planeLen 张单牌，不能含王炸部分？宽松处理）
      return { type: 'plane1', rank: best[0], len: planeLen, cards: cs };
    }
    if (n === planeCards + planeLen * 2) {
      // 飞机带对翅：余牌须全为对子
      var rest = {};
      var gCopy = groupByRank(cs);
      for (var k = 0; k < best.length; k++) gCopy[best[k]] = gCopy[best[k]].slice(3);
      var okWings = true;
      var rk = Object.keys(gCopy);
      for (k = 0; k < rk.length; k++) {
        var arr = gCopy[rk[k]];
        if (arr.length === 0) continue;
        if (arr.length !== 2 && !(arr.length === 4)) okWings = false; // 4张当两对（严格版应禁，宽松允许）
      }
      if (okWings) return { type: 'plane2', rank: best[0], len: planeLen, cards: cs };
    }
  }
  // 四带二（两单或两对）— 斗地主用
  if (n === 6 && ranks.length >= 2) {
    var t4 = -1; var restN = 0;
    for (i = 0; i < ranks.length; i++) {
      if (counts[ranks[i]] === 4) t4 = ranks[i];
      else restN += counts[ranks[i]];
    }
    if (t4 >= 0 && restN === 2) return { type: 'four2', rank: t4, len: 1, cards: cs };
  }
  if (n === 8) {
    var t4b = -1; var pairsN = 0; var ok = true;
    for (i = 0; i < ranks.length; i++) {
      if (counts[ranks[i]] === 4) t4b = ranks[i];
      else if (counts[ranks[i]] === 2) pairsN++;
      else if (counts[ranks[i]] !== 0) ok = false;
    }
    if (t4b >= 0 && ok && pairsN === 2) return { type: 'four2pair', rank: t4b, len: 1, cards: cs };
  }
  return null;
}

// a 能否压 b（b 为上家牌型；b=null 表示自由出牌）
function beats(a, b) {
  if (!a) return false;
  if (!b) return true;
  if (a.type === 'rocket') return true;
  if (b.type === 'rocket') return false;
  if (a.type === 'bomb' && b.type !== 'bomb') return true;
  if (b.type === 'bomb' && a.type !== 'bomb') return false;
  if (a.type !== b.type) return false;
  if (a.len !== b.len) return false;
  return a.rank > b.rank;
}

// 洗牌
function shuffle(rng) {
  var rand = rng || Math.random;
  var deck = [];
  for (var i = 0; i < 54; i++) deck.push(i);
  for (i = deck.length - 1; i > 0; i--) {
    var j = Math.floor(rand() * (i + 1));
    var t = deck[i]; deck[i] = deck[j]; deck[j] = t;
  }
  return deck;
}

// 提示：从手里找能压过 last 的最小组合（返回牌数组或 null）
function findHint(hand, lastCards) {
  var last = lastCards ? parse(lastCards) : null;
  var need = last ? last : null;
  var cs = hand.slice().sort(function (a, b) { return a - b; });
  var g = groupByRank(cs);
  var ranks = sortedRanks(g);

  function tryTake(r, cnt) {
    var arr = g[r];
    if (!arr || arr.length < cnt) return null;
    return arr.slice(0, cnt);
  }

  // 自由出牌：出最小的单张
  if (!need) {
    return [cs[0]];
  }
  // 同型搜索
  if (need.type === 'single') {
    for (var i = 0; i < ranks.length; i++) {
      var one = tryTake(ranks[i], 1);
      if (one && rankOf(one[0]) > need.rank) return one;
    }
  }
  if (need.type === 'pair') {
    for (i = 0; i < ranks.length; i++) {
      var two = tryTake(ranks[i], 2);
      if (two && ranks[i] > need.rank) return two;
    }
  }
  if (need.type === 'triple' || need.type === 'triple1' || need.type === 'triple2') {
    for (i = 0; i < ranks.length; i++) {
      if (ranks[i] > need.rank && g[ranks[i]].length >= 3) {
        var base = g[ranks[i]].slice(0, 3);
        if (need.type === 'triple') return base;
        // 带牌：最小的单/对（从别的 rank 拿）
        if (need.type === 'triple1') {
          for (var k = 0; k < ranks.length; k++) {
            if (ranks[k] !== ranks[i]) { return base.concat([g[ranks[k]][0]]); }
          }
        }
        if (need.type === 'triple2') {
          for (k = 0; k < ranks.length; k++) {
            if (ranks[k] !== ranks[i] && g[ranks[k]].length >= 2) { return base.concat(g[ranks[k]].slice(0, 2)); }
          }
        }
      }
    }
  }
  if (need.type === 'straight' || need.type === 'pairs') {
    var unit = need.type === 'straight' ? 1 : 2;
    var L = need.type === 'straight' ? need.len : need.len;
    for (var start = 0; start < 12; start++) {
      if (start <= need.rank) continue;
      if (start + L - 1 >= 12) break;
      var ok = true; var combo = [];
      for (i = 0; i < L; i++) {
        var seg = tryTake(start + i, unit);
        if (!seg) { ok = false; break; }
        combo = combo.concat(seg);
      }
      if (ok) return combo;
    }
  }
  // 飞机同型搜索 (plane/plane1/plane2)
  if (need.type === 'plane' || need.type === 'plane1' || need.type === 'plane2') {
    var L = need.len;
    for (var ps = 0; ps < 12; ps++) {
      if (ps <= need.rank) continue;
      if (ps + L - 1 >= 12) break;
      // 主体: 连续 L 组三张
      var pOk = true; var pBase = [];
      for (i = 0; i < L; i++) {
        var seg3 = tryTake(ps + i, 3);
        if (!seg3) { pOk = false; break; }
        pBase = pBase.concat(seg3);
      }
      if (!pOk) continue;
      if (need.type === 'plane') return pBase;
      if (need.type === 'plane1') {
        // 翅膀池: 全手牌 - 主体每rank消耗3张 (同rank可多张/主体余牌/王均可用)
        // 拆炸弹的牌排池尾, 仅当必要 (G1/G2修复)
        var pool1 = [], bombPool1 = [];
        for (var pw = 0; pw < ranks.length; pw++) {
          var isBody1 = ranks[pw] >= ps && ranks[pw] < ps + L;
          var avail1 = g[ranks[pw]].length - (isBody1 ? 3 : 0);
          for (var pa = 0; pa < avail1; pa++) {
            if (g[ranks[pw]].length === 4) bombPool1.push(g[ranks[pw]][pa]);
            else pool1.push(g[ranks[pw]][pa]);
          }
        }
        var wings1 = pool1.concat(bombPool1).slice(0, L);
        if (wings1.length === L) {
          var cand1 = pBase.concat(wings1);
          // 与parse一致性校验: 防止翅膀组成更长三张序列等parse不接受的情况
          var pc1 = parse(cand1);
          if (pc1 && pc1.type === 'plane1' && beats(pc1, need)) return cand1;
        }
      } else {
        // plane2 翅膀对: 自然对(exactly2) → 拆三张 → 拆炸弹(每rank至多两对), 均升序
        // 拆炸仅最后手段 (G3修复, 按用户决策)
        var natural2 = [], triple2 = [], bomb2 = [];
        for (pw = 0; pw < ranks.length; pw++) {
          if (ranks[pw] >= ps && ranks[pw] < ps + L) continue; // 主体rank余牌(1张)无法成对
          var cnt2 = g[ranks[pw]].length;
          if (cnt2 === 2) natural2.push(ranks[pw]);
          else if (cnt2 === 3) triple2.push(ranks[pw]);
          else if (cnt2 === 4) bomb2.push(ranks[pw]);
        }
        var need2n = L * 2;
        var wings2 = [];
        for (pw = 0; pw < natural2.length && wings2.length < need2n; pw++)
          wings2 = wings2.concat(g[natural2[pw]].slice(0, 2));
        for (pw = 0; pw < triple2.length && wings2.length < need2n; pw++)
          wings2 = wings2.concat(g[triple2[pw]].slice(0, 2));
        for (pw = 0; pw < bomb2.length && wings2.length < need2n; pw++)
          for (var ba = 0; ba < 4 && wings2.length < need2n; ba++)
            wings2.push(g[bomb2[pw]][ba]);
        if (wings2.length === need2n) {
          var cand2 = pBase.concat(wings2);
          var pc2 = parse(cand2);
          if (pc2 && pc2.type === 'plane2' && beats(pc2, need)) return cand2;
        }
      }
    }
  }
  // 四带二同型搜索 (four2/four2pair)
  if (need.type === 'four2' || need.type === 'four2pair') {
    for (i = 0; i < ranks.length; i++) {
      if (ranks[i] > need.rank && g[ranks[i]].length === 4) {
        var fBase = g[ranks[i]].slice();
        if (need.type === 'four2') {
          // 带两张最小单牌(可拆对)
          var singles = [];
          for (var fk = 0; fk < ranks.length && singles.length < 2; fk++) {
            if (ranks[fk] === ranks[i]) continue;
            var fa = g[ranks[fk]];
            for (var fi = 0; fi < fa.length && singles.length < 2; fi++) singles.push(fa[fi]);
          }
          if (singles.length === 2) return fBase.concat(singles);
        } else {
          // 带两对 (prs按张计数: 2对=4张)
          var prs = [];
          for (fk = 0; fk < ranks.length && prs.length < 4; fk++) {
            if (ranks[fk] === ranks[i]) continue;
            if (g[ranks[fk]].length >= 2) { prs = prs.concat(g[ranks[fk]].slice(0, 2)); }
          }
          if (prs.length === 4) return fBase.concat(prs);
        }
      }
    }
  }
  // 炸弹兜底
  for (i = 0; i < ranks.length; i++) {
    if (g[ranks[i]].length === 4) {
      if (need.type !== 'bomb' || ranks[i] > need.rank) return g[ranks[i]].slice();
    }
  }
  // 王炸兜底
  if (cs.indexOf(52) >= 0 && cs.indexOf(53) >= 0) return [52, 53];
  return null;
}

var Cards = {
  RANK_NAMES: RANK_NAMES, SUIT_CHARS: SUIT_CHARS,
  rankOf: rankOf, suitOf: suitOf, cardName: cardName,
  groupByRank: groupByRank, parse: parse, beats: beats,
  shuffle: shuffle, findHint: findHint,
  DECK_NO_JOKER: (function () { var d = []; for (var i = 0; i < 52; i++) d.push(i); return d; })(),
};

if (typeof module !== 'undefined' && module.exports) module.exports = Cards;
if (typeof window !== 'undefined') window.Cards = Cards;