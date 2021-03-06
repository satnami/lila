var m = require('mithril');
var winningChances = require('../winningChances');
var util = require('../util');
var defined = util.defined;
var classSet = require('chessground').util.classSet;
var pv2san = require('./pv2san');

var gaugeLast = 0;
var gaugeTicks = [];
for (var i = 1; i < 8; i++) gaugeTicks.push(m(i === 4 ? 'tick.zero' : 'tick', {
  style: {
    height: (i * 12.5) + '%'
  }
}));

function localEvalInfo(ctrl, evs) {
  if (!evs.client) {
    if (evs.server && ctrl.nextNodeBest()) return 'Using server analysis';
    return 'Loading engine...';
  }
  if (evs.client.dict) return 'Book move';
  var t = 'Depth ' + (evs.client.depth || 0) + '/' + evs.client.maxDepth;
  if (evs.client.nps) t += ', ' + Math.round(evs.client.nps / 1000) + ' knodes/s';
  return t;
}

function threatInfo(threat) {
  if (!threat) return 'Loading engine...';
  if (threat.dict) return 'Book move';
  var t = 'Depth ' + (threat.depth || 0) + '/' + threat.maxDepth;
  if (threat.nps) t += ', ' + Math.round(threat.nps / 1000) + ' knodes/s';
  return t;
}

function threatButton(ctrl) {
  return m('a', {
    class: classSet({
      'show-threat': true,
      active: ctrl.vm.threatMode,
      hidden: ctrl.vm.node.check
    }),
    'data-icon': '7',
    title: 'Show threat (x)',
    config: util.bindOnce('click', ctrl.toggleThreatMode)
  });
}

module.exports = {
  renderGauge: function(ctrl) {
    if (ctrl.ongoing || !ctrl.showEvalGauge()) return;
    var eval, evs = ctrl.currentEvals();
    if (evs) {
      eval = winningChances.povChances('white', evs.fav);
      gaugeLast = eval;
    } else eval = gaugeLast;
    var height = 100 - (eval + 1) * 50;
    return m('div', {
      class: classSet({
        eval_gauge: true,
        empty: eval === null,
        reverse: ctrl.data.orientation === 'black'
      })
    }, [
      m('div', {
        class: 'black',
        style: {
          height: height + '%'
        }
      }),
      gaugeTicks
    ]);
  },
  renderCeval: function(ctrl) {
    if (!ctrl.ceval.allowed() || !ctrl.ceval.possible || !ctrl.vm.showComputer()) return;
    var enabled = ctrl.ceval.enabled();
    var evs = ctrl.currentEvals() || {};
    var threatMode = ctrl.vm.threatMode;
    var threat = threatMode && ctrl.vm.node.threat;
    var pearl, percent;
    if (defined(evs.fav) && defined(evs.fav.cp)) {
      pearl = util.renderEval(evs.fav.cp);
      percent = ctrl.nextNodeBest() ?
        100 :
        (evs.client ? Math.min(100, Math.round(100 * evs.client.depth / evs.client.maxDepth)) : 0)
    } else if (defined(evs.fav) && defined(evs.fav.mate)) {
      pearl = '#' + evs.fav.mate;
      percent = 100;
    } else if (ctrl.gameOver()) {
      pearl = '-';
      percent = 0;
    } else {
      pearl = m('span.cpu', 'CPU');
      percent = 0;
    }
    if (threatMode) {
      if (threat) percent = Math.min(100, Math.round(100 * threat.depth / threat.maxDepth));
      else percent = 0;
    }
    return m('div.ceval_box',
      enabled ? m('div.bar', m('span', {
        class: threatMode ? 'threat' : '',
        style: {
          width: percent + '%'
        },
        config: function(el, isUpdate, ctx) {
          // reinsert the node to avoid downward animation
          if (isUpdate && (ctx.percent > percent || ctx.threatMode !== threatMode)) {
            var p = el.parentNode;
            p.removeChild(el);
            p.appendChild(el);
          }
          ctx.percent = percent;
          ctx.threatMode = threatMode;
        }
      })) : null,
      enabled ? [
        m('pearl', pearl),
        m('div.engine', [
          threatMode ? 'Show threat' : 'Local Stockfish',
          m('span.info', threatMode ? threatInfo(threat) : localEvalInfo(ctrl, evs))
        ])
      ] : [
        pearl ? m('pearl', pearl) : null,
        m('help',
          'Local computer evaluation',
          m('br'),
          'for variation analysis'
        )
      ],
      m('div.switch', {
        title: 'Toggle local evaluation (l)'
      }, [
        m('input', {
          id: 'analyse-toggle-ceval',
          class: 'cmn-toggle cmn-toggle-round',
          type: 'checkbox',
          checked: enabled,
          config: util.bindOnce('change', ctrl.toggleCeval)
        }),
        m('label', {
          'for': 'analyse-toggle-ceval'
        })
      ]),
      threatButton(ctrl)
    )
  },
  renderPvs: function(ctrl) {
    if (!ctrl.ceval.allowed() || !ctrl.ceval.possible || !ctrl.ceval.enabled()) return;
    var multiPv = ctrl.ceval.multiPv();
    var pvs, threat = false;
    if (ctrl.vm.threatMode && ctrl.vm.node.threat && ctrl.vm.node.threat.pvs) {
      pvs = ctrl.vm.node.threat.pvs;
      threat = true;
    } else if (ctrl.currentEvals() && ctrl.currentEvals().client && ctrl.currentEvals().client.pvs)
      pvs = ctrl.currentEvals().client.pvs;
    else
      pvs = [];
    return m('div.pv_box', {
      config: function(el, isUpdate, ctx) {
        if (!isUpdate) {
          el.addEventListener('mouseover', function(e) {
            ctrl.ceval.setHoveringUci($(e.target).closest('div.pv').attr('data-uci'));
          });
          el.addEventListener('mouseout', function(e) {
            ctrl.ceval.setHoveringUci(null);
          });
          el.addEventListener('mousedown', function(e) {
            var uci = $(e.target).closest('div.pv').attr('data-uci');
            if (uci) ctrl.playUci(uci);
          });
        }
        setTimeout(function() {
          ctrl.ceval.setHoveringUci($(el).find('div.pv:hover').attr('data-uci'));
        }, 100);
      }
    }, util.range(multiPv).map(function(i) {
      if (!pvs[i]) return m('div.pv');
      else return m('div.pv', threat ? {} : {
        'data-uci': pvs[i].best
      }, [
        multiPv > 1 ? m('strong', util.defined(pvs[i].mate) ? ('#' + pvs[i].mate) : util.renderEval(pvs[i].cp)) : null,
        m('span', pv2san(ctrl.data.game.variant.key, ctrl.vm.node.fen, threat, pvs[i].pv, pvs[i].mate))
      ]);
    }));
  }
};
