/* 跑得快 前端模块 (Chrome 80 兼容) */
(function () {
  'use strict';
  var UI = window.CardsUI;
  var C = window.Cards;
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

  function seatName(seat) {
    var names = (api.names && api.names()) || [];
    return names[seat - 1] || ('玩家' + seat);
  }

  function buildActions() {
    els.actions.innerHTML = '';
    if (!state || state.gameover) return;

    var myTurn = isMyTurn();

    var passBtn = document.createElement('button');
    passBtn.className = 'btn ghost small';
    passBtn.textContent = '不要';
    passBtn.disabled = !myTurn || state.freeTurn || state.firstMove;
    passBtn.onclick = function () { api.send({ type: 'move', move: { action: 'pass' } }); };
    els.actions.appendChild(passBtn);

    var hintBtn = document.createElement('button');
    hintBtn.className = 'btn ghost small';
    hintBtn.textContent = '提示';
    hintBtn.disabled = !myTurn;
    hintBtn.onclick = function () { api.send({ type: 'hint' }); };
    els.actions.appendChild(hintBtn);

    // 强制压牌预告: 轮到我且非首手/非自由时, 提示是否有牌可压
    var mustPlayNote = '';
    if (myTurn && !state.firstMove && !state.freeTurn && state.last) {
      if (C.findHint(state.hand, state.last.cards)) mustPlayNote = '· 你有牌可压必须出牌';
    }

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
    var passNote = (!state.freeTurn && state.passCount > 0) ? '（已 ' + state.passCount + ' 人不要）' : '';
    if (myTurn) {
      tip.textContent = state.firstMove ? '你持♠3先出，首手必须包含♠3'
        : (state.freeTurn ? '轮到你自由出牌' : '轮到你：出牌压过上家或「不要」' + passNote + mustPlayNote);
    } else {
      tip.textContent = '等待其他玩家…' + passNote;
    }
    els.actions.appendChild(tip);
  }

  function render() {
    if (!state) return;
    var you = api.you();
    var n = state.seatCount;

    var opps = [];
    for (var i = 0; i < n; i++) {
      var seat = i + 1;
      if (seat === you) continue;
      opps.push({
        name: seatName(seat) + (state.firstMove && state.firstSeat === i ? ' ♠3' : ''),
        count: state.counts[i],
        isTurn: state.turn === seat && !state.gameover,
        isWinner: state.gameover && state.winner === seat,
      });
    }
    UI.renderOpponents(els.opponents, opps, you);

    var plays = [];
    if (state.last) {
      plays.push({ name: seatName(state.last.seat + 1), cards: state.last.cards });
      UI.renderPlayArea(els.playArea, plays);
    } else {
      var t = document.createElement('div');
      t.className = 'pass-text';
      t.textContent = state.freeTurn ? (isMyTurn() ? (state.firstMove ? '你先出（须含♠3）' : '你自由出牌') : '等待先出') : '';
      els.playArea.innerHTML = '';
      els.playArea.appendChild(t);
    }

    handCtl = UI.renderHand(els.hand, state.hand, { selectable: isMyTurn() });
    buildActions();
  }

  window.PaodekuaiUI = {
    mount: function (el, a) {
      api = a;
      buildLayout(el);
      state = null;
    },
    onState: function (st) { state = st; render(); },
    onHint: function (cards) {
      if (!handCtl) return;
      if (!cards || !cards.length) { api.toast('没有能压过的牌，建议「不要」'); return; }
      handCtl.clearSelection();
      handCtl.selectCards(cards);
    },
    reset: function () {
      state = null;
      els.opponents.innerHTML = '';
      els.playArea.innerHTML = '';
      els.hand.innerHTML = '';
      els.actions.innerHTML = '';
    },
    title: '跑得快',
  };
})();