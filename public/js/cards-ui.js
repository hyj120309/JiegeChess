/* 扑克牌共享 UI 组件 (Chrome 80 兼容: 无 append 多参/无 replaceChildren/无 ?. ??) */
(function () {
  'use strict';
  var C = window.Cards;
  if (!C) throw new Error('cards.js 未加载');

  var RANK_NAMES = C.RANK_NAMES;
  var SUIT_CHARS = C.SUIT_CHARS;

  function rankOf(c) { return C.rankOf(c); }
  function suitOf(c) { return C.suitOf(c); }

  // 创建一张牌 DOM。c: 0..53; opts: {small:bool, back:bool, selected:bool}
  function createCardEl(c, opts) {
    opts = opts || {};
    var el = document.createElement(opts.small ? 'div' : 'div');
    el.className = 'pcard';
    if (opts.small) el.className += ' pcard-small';
    if (opts.back) { el.className += ' back'; return el; }

    if (c === 52 || c === 53) {
      el.className += c === 53 ? ' joker-big' : ' joker-small';
      var j = document.createElement('div');
      j.className = 'center-suit';
      j.textContent = c === 53 ? '★' : '☆';
      el.appendChild(j);
      var jc = document.createElement('div');
      jc.className = 'corner top';
      jc.textContent = c === 53 ? '大王' : '小王';
      jc.style.fontSize = '9px';
      el.appendChild(jc);
      return el;
    }

    var r = RANK_NAMES[rankOf(c)];
    var s = SUIT_CHARS[suitOf(c)];
    var red = (suitOf(c) === 1 || suitOf(c) === 3);
    el.className += red ? ' red' : ' black';

    var t = document.createElement('div');
    t.className = 'corner top';
    t.textContent = s + r;
    el.appendChild(t);

    var b = document.createElement('div');
    b.className = 'corner bottom';
    b.textContent = s + r;
    el.appendChild(b);

    var mid = document.createElement('div');
    mid.className = 'center-suit';
    mid.textContent = s;
    el.appendChild(mid);
    return el;
  }

  // 渲染一手牌到容器（可点击选择）。返回选中牌数组 getter
  function renderHand(container, hand, opts) {
    opts = opts || {};
    container.innerHTML = '';
    var selected = {};
    var sorted = hand.slice().sort(function (a, b) { return b - a; }); // 大→小 显示
    for (var i = 0; i < sorted.length; i++) {
      (function (card) {
        var el = createCardEl(card, {});
        if (opts.selectable) {
          el.className += ' selectable';
          el.onclick = function () {
            if (selected[card]) { delete selected[card]; el.classList.remove('selected'); }
            else { selected[card] = true; el.classList.add('selected'); }
            if (opts.onChange) opts.onChange(getSelected());
          };
        }
        container.appendChild(el);
      })(sorted[i]);
    }
    function getSelected() {
      var out = [];
      var sorted2 = hand.slice().sort(function (a, b) { return b - a; });
      for (var i = 0; i < sorted2.length; i++) {
        if (selected[sorted2[i]]) out.push(sorted2[i]);
      }
      return out;
    }
    function clearSelection() {
      selected = {};
      var kids = container.children;
      for (var i = 0; i < kids.length; i++) kids[i].classList.remove('selected');
    }
    return { getSelected: getSelected, clearSelection: clearSelection };
  }

  // 渲染对手区（顶部一排）：data: [{name, count, isTurn, isWinner}]
  function renderOpponents(container, opps, you) {
    container.innerHTML = '';
    for (var i = 0; i < opps.length; i++) {
      (function (o) {
        var slot = document.createElement('div');
        slot.className = 'opp-slot' + (o.isTurn ? ' active' : '');
        var nm = document.createElement('div');
        nm.className = 'opp-name';
        nm.textContent = o.name + (o.isWinner ? ' 👑' : '');
        slot.appendChild(nm);
        var cardsRow = document.createElement('div');
        cardsRow.className = 'opp-cards';
        var show = Math.min(o.count, 4);
        for (var k = 0; k < show; k++) {
          cardsRow.appendChild(createCardEl(0, { back: true, small: true }));
        }
        slot.appendChild(cardsRow);
        var cnt = document.createElement('div');
        cnt.className = 'card-count' + (o.count === 1 ? ' alert' : '');
        cnt.textContent = o.count + ' 张';
        slot.appendChild(cnt);
        container.appendChild(slot);
      })(opps[i]);
    }
  }

  // 渲染出牌区：plays: [{name, cards|null(pass), isYou}]
  function renderPlayArea(container, plays) {
    container.innerHTML = '';
    for (var i = 0; i < plays.length; i++) {
      (function (p) {
        var slot = document.createElement('div');
        slot.className = 'play-slot';
        var nm = document.createElement('div');
        nm.className = 'play-name';
        nm.textContent = p.name;
        slot.appendChild(nm);
        if (p.cards && p.cards.length) {
          var row = document.createElement('div');
          row.className = 'play-cards';
          var sorted = p.cards.slice().sort(function (a, b) { return b - a; });
          for (var k = 0; k < sorted.length; k++) {
            row.appendChild(createCardEl(sorted[k], {}));
          }
          slot.appendChild(row);
        } else {
          var pt = document.createElement('div');
          pt.className = 'pass-text';
          pt.textContent = p.isPass ? '不要' : '';
          slot.appendChild(pt);
        }
        container.appendChild(slot);
      })(plays[i]);
    }
  }

  window.CardsUI = {
    createCardEl: createCardEl,
    renderHand: renderHand,
    renderOpponents: renderOpponents,
    renderPlayArea: renderPlayArea,
  };
})();