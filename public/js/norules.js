/* 无规则扑克 前端模块 (Chrome 80 兼容) */
(function () {
  'use strict';
  var UI = window.CardsUI;
  var state = null, api = null;
  var handCtl = null;
  var els = {};

  function buildLayout(el) {
    el.innerHTML = '';
    var table = document.createElement('div');
    table.className = 'card-table';

    els.opponents = document.createElement('div');
    els.opponents.className = 'opponents-bar';
    table.appendChild(els.opponents);

    els.playArea = document.createElement('div');
    els.playArea.className = 'play-area';
    table.appendChild(els.playArea);

    els.hand = document.createElement('div');
    els.hand.className = 'hand';
    table.appendChild(els.hand);

    els.actions = document.createElement('div');
    els.actions.className = 'card-actions';
    table.appendChild(els.actions);

    el.appendChild(table);
  }

  function isMyTurn() {
    return state && !state.gameover && state.turn === api.you();
  }

  function buildActions() {
    els.actions.innerHTML = '';
    if (!state || state.gameover) return;

    var myTurn = isMyTurn();
    var passBtn = document.createElement('button');
    passBtn.className = 'btn ghost small';
    passBtn.textContent = '跳过';
    passBtn.disabled = !myTurn || state.freeTurn;
    passBtn.onclick = function () { api.send({ type: 'move', move: { action: 'pass' } }); };
    els.actions.appendChild(passBtn);

    var playBtn = document.createElement('button');
    playBtn.className = 'btn primary small';
    playBtn.textContent = '出牌';
    playBtn.disabled = !myTurn;
    playBtn.onclick = function () {
      if (!handCtl) return;
      var sel = handCtl.getSelected();
      if (!sel.length) { api.toast('请先选牌'); return; }
      api.send({ type: 'move', move: { action: 'play', cards: sel } });
    };
    els.actions.appendChild(playBtn);

    var tip = document.createElement('div');
    tip.className = 'turn-tip';
    var passNote = (!state.freeTurn && state.passCount > 0) ? '（已 ' + state.passCount + ' 人跳过）' : '';
    tip.textContent = myTurn
      ? (state.freeTurn ? '轮到你先出，出任意牌' : '轮到你：出牌或跳过' + passNote)
      : '等待其他玩家…' + passNote;
    els.actions.appendChild(tip);
  }

  function render() {
    if (!state) return;
    var you = api.you();           // 1-based
    var n = state.seatCount;
    var names = (api.names && api.names()) || [];
    function seatName(seat) {
      // names 为座位对齐数组(空串=未入座); 回退到通用名
      return names[seat - 1] || ('玩家' + seat);
    }

    // 对手区（按座位顺序，跳过自己）
    var opps = [];
    for (var i = 0; i < n; i++) {
      var seat = i + 1;
      if (seat === you) continue;
      opps.push({
        name: seatName(seat),
        count: state.counts[i],
        isTurn: state.turn === seat && !state.gameover,
        isWinner: state.gameover && state.winner === seat,
      });
    }
    UI.renderOpponents(els.opponents, opps, you);

    // 出牌区: 最近一次出牌（含出牌者），其余显示 pass 提示
    var plays = [];
    if (state.last) {
      plays.push({ name: seatName(state.last.seat + 1), cards: state.last.cards });
    }
    if (plays.length === 0) {
      var t = document.createElement('div');
      t.className = 'pass-text';
      t.textContent = state.freeTurn ? (isMyTurn() ? '你先出' : '等待先出') : '';
      els.playArea.innerHTML = '';
      els.playArea.appendChild(t);
    } else {
      UI.renderPlayArea(els.playArea, plays);
    }

    // 手牌
    handCtl = UI.renderHand(els.hand, state.hand, {
      selectable: isMyTurn(),
      onChange: function () {},
    });

    buildActions();
  }

  window.NorulesUI = {
    mount: function (el, a) {
      api = a;
      buildLayout(el);
      state = null;
    },
    onState: function (st) {
      state = st;
      render();
    },
    reset: function () {
      state = null;
      els.opponents.innerHTML = '';
      els.playArea.innerHTML = '';
      els.hand.innerHTML = '';
      els.actions.innerHTML = '';
    },
    title: '无规则扑克',
  };
})();