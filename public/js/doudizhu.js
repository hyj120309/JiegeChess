/* 斗地主 前端模块 (Chrome 80 兼容) */
(function () {
  'use strict';
  var UI = window.CardsUI;
  var C = window.Cards;
  var state = null, api = null;
  var handCtl = null;
  var els = {};
  var lastRedeal = 0;

  function buildLayout(el) {
    el.innerHTML = '';
    var table = document.createElement('div');
    table.className = 'card-table';

    els.opponents = document.createElement('div');
    els.opponents.className = 'opponents-bar';
    table.appendChild(els.opponents);

    els.bottom = document.createElement('div');
    els.bottom.className = 'bottom-cards';
    els.bottom.style.cssText = 'display:flex;justify-content:center;min-height:54px;margin-top:6px';
    table.appendChild(els.bottom);

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
    return state && !state.gameover && state.phase === 'play' && state.turn === api.you();
  }
  function isMyClaim() {
    return state && !state.gameover && state.phase === 'claim' && state.claimTurn === api.you() - 1;
  }
  function seatName(seat) {
    var names = (api.names && api.names()) || [];
    return names[seat - 1] || ('玩家' + seat);
  }

  function renderBottom() {
    els.bottom.innerHTML = '';
    if (!state) return;
    if (state.phase === 'claim') {
      var label = document.createElement('div');
      label.className = 'pass-text';
      label.textContent = '底牌 ×' + state.bottomCount;
      els.bottom.appendChild(label);
      return;
    }
    var row = document.createElement('div');
    row.className = 'play-cards';
    var sorted = state.bottom.slice().sort(function (a, b) { return b - a; });
    for (var i = 0; i < sorted.length; i++) row.appendChild(UI.createCardEl(sorted[i], {}));
    els.bottom.appendChild(row);
  }

  function renderScores() {
    var label = els.bottom.querySelector('.score-line');
    if (!label) {
      label = document.createElement('div');
      label.className = 'score-line';
      label.style.cssText = 'color:#9aa0a6;font-size:12px;margin-top:4px;text-align:center';
      els.bottom.parentNode.insertBefore(label, els.bottom.nextSibling);
    }
    var parts = [];
    for (var i = 0; i < state.seatCount; i++) {
      var s = state.scores ? state.scores[i] : 0;
      parts.push(seatName(i + 1) + ' ' + (s > 0 ? '+' : '') + s);
    }
    label.textContent = '积分 · ' + parts.join(' · ') + ' · 倍数 ×' + state.multiplier;
  }

  function buildClaimActions() {
    els.actions.innerHTML = '';
    var my = isMyClaim();

    if (my) {
      var yes = document.createElement('button');
      yes.className = 'btn primary small';
      yes.textContent = state.claimStage === 'call' ? '叫地主' : '抢地主';
      yes.onclick = function () { api.send({ type: 'move', move: { action: 'claim', take: true } }); };
      els.actions.appendChild(yes);

      var no = document.createElement('button');
      no.className = 'btn ghost small';
      no.textContent = state.claimStage === 'call' ? '不叫' : '不抢';
      no.onclick = function () { api.send({ type: 'move', move: { action: 'claim', take: false } }); };
      els.actions.appendChild(no);
    }

    var tip = document.createElement('div');
    tip.className = 'turn-tip';
    var who = seatName(state.claimTurn + 1);
    tip.textContent = state.claimStage === 'call'
      ? (my ? '你要叫地主吗？' : '等待 ' + who + ' 叫地主…')
      : (my ? '你要抢地主吗？（倍数×2）' : '等待 ' + who + ' 是否抢地主…');
    els.actions.appendChild(tip);
  }

  function buildPlayActions() {
    els.actions.innerHTML = '';
    var myTurn = isMyTurn();

    var passBtn = document.createElement('button');
    passBtn.className = 'btn ghost small';
    passBtn.textContent = '不要';
    passBtn.disabled = !myTurn || state.freeTurn;
    passBtn.onclick = function () { api.send({ type: 'move', move: { action: 'pass' } }); };
    els.actions.appendChild(passBtn);

    var hintBtn = document.createElement('button');
    hintBtn.className = 'btn ghost small';
    hintBtn.textContent = '提示';
    hintBtn.disabled = !myTurn || state.freeTurn;
    hintBtn.onclick = function () {
      if (!handCtl) return;
      var lastCards = state.last ? state.last.cards : null;
      var hint = C.findHint(state.hand, lastCards);
      if (!hint) { api.toast('没有能压过的牌，建议「不要」'); return; }
      handCtl.clearSelection();
      handCtl.selectCards(hint);
    };
    els.actions.appendChild(hintBtn);

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
    tip.textContent = myTurn
      ? (state.freeTurn ? '你自由出牌' : '出牌压过上家或「不要」' + passNote)
      : '等待其他玩家…' + passNote;
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
        name: seatName(seat)
          + (state.landlord === i ? ' 👑地主' : (state.phase === 'play' ? ' 农民' : '')),
        count: state.counts[i],
        isTurn: (state.phase === 'play' && state.turn === seat && !state.gameover)
          || (state.phase === 'claim' && state.claimTurn === i),
        isWinner: state.gameover && (state.winner - 1 === i
          || (state.winner - 1 !== state.landlord && i !== state.landlord)),
      });
    }
    UI.renderOpponents(els.opponents, opps, you);
    renderBottom();
    renderScores();

    if (state.phase === 'claim') {
      els.playArea.innerHTML = '';
      var ct = document.createElement('div');
      ct.className = 'pass-text';
      ct.textContent = '叫地主阶段 · 倍数 ×' + state.multiplier;
      els.playArea.appendChild(ct);
      handCtl = UI.renderHand(els.hand, state.hand, { selectable: false });
      buildClaimActions();
      return;
    }

    var plays = [];
    if (state.last) {
      plays.push({ name: seatName(state.last.seat + 1), cards: state.last.cards });
      UI.renderPlayArea(els.playArea, plays);
    } else {
      var t = document.createElement('div');
      t.className = 'pass-text';
      t.textContent = '倍数 ×' + state.multiplier + (state.freeTurn ? (isMyTurn() ? ' · 你自由出牌' : '') : '');
      els.playArea.innerHTML = '';
      els.playArea.appendChild(t);
    }

    handCtl = UI.renderHand(els.hand, state.hand, { selectable: isMyTurn() });
    buildPlayActions();
  }

  window.DoudizhuUI = {
    mount: function (el, a) {
      api = a;
      buildLayout(el);
      state = null;
    },
    onState: function (st) {
      var rc = st.redealCount || 0;
      if (rc > lastRedeal) { api.toast('无人叫地主，重新发牌'); }
      lastRedeal = rc;
      state = st; render();
    },
    reset: function () {
      state = null;
      els.opponents.innerHTML = '';
      els.bottom.innerHTML = '';
      els.playArea.innerHTML = '';
      els.hand.innerHTML = '';
      els.actions.innerHTML = '';
    },
    title: '斗地主',
  };
})();