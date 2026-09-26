export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Drake Analytics</title>
<style>
:root {
  color-scheme: light;
  --surface-0: #f4f4f2;
  --surface-1: #fcfcfb;
  --border: #e2e1dc;
  --grid: #ecebe7;
  --text-primary: #0b0b0b;
  --text-secondary: #52514e;
  --text-muted: #7a7974;
  --series-1: #2a78d6;
  --series-1-hover: #1f5fae;
  --critical: #c9302c;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --surface-0: #111110;
    --surface-1: #1a1a19;
    --border: #2c2c2a;
    --grid: #262624;
    --text-primary: #ffffff;
    --text-secondary: #c3c2b7;
    --text-muted: #8f8e86;
    --series-1: #3987e5;
    --series-1-hover: #6aa5ee;
    --critical: #e66767;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --surface-0: #111110;
  --surface-1: #1a1a19;
  --border: #2c2c2a;
  --grid: #262624;
  --text-primary: #ffffff;
  --text-secondary: #c3c2b7;
  --text-muted: #8f8e86;
  --series-1: #3987e5;
  --series-1-hover: #6aa5ee;
  --critical: #e66767;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--surface-0); color: var(--text-primary); font: 14px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif; }
main { max-width: 1120px; margin: 0 auto; padding: 24px 16px 48px; }
header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
h1 { font-size: 22px; margin: 0; letter-spacing: -0.01em; }
h2 { font-size: 14px; margin: 0 0 12px; color: var(--text-secondary); font-weight: 600; }
.meta { color: var(--text-muted); font-size: 12px; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 16px; }
.tile, .panel { background: var(--surface-1); border: 1px solid var(--border); border-radius: 10px; }
.tile { padding: 14px 16px; }
.tile .label { color: var(--text-secondary); font-size: 12px; }
.tile .value { font-size: 28px; font-weight: 650; font-variant-numeric: tabular-nums; margin-top: 2px; }
.tile .sub { color: var(--text-muted); font-size: 12px; }
.panel { padding: 16px; margin-bottom: 16px; }
.panel-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
.grid2 .panel { margin-bottom: 0; }
.chart { position: relative; }
.chart svg { display: block; width: 100%; height: auto; overflow: visible; }
.chart .axis { fill: var(--text-muted); font-size: 11px; }
.chart .gridline { stroke: var(--grid); stroke-width: 1; }
.chart .bar { fill: var(--series-1); }
.chart .hit:hover + .bar, .chart .bar.active { fill: var(--series-1-hover); }
.tip { position: absolute; pointer-events: none; background: var(--surface-1); border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; font-size: 12px; box-shadow: 0 4px 14px rgba(0,0,0,.12); white-space: nowrap; transform: translate(-50%, -100%); display: none; }
.tip b { font-variant-numeric: tabular-nums; }
.hbars { display: grid; gap: 8px; }
.hbar { display: grid; grid-template-columns: minmax(70px, 30%) 1fr auto; gap: 10px; align-items: center; font-size: 13px; }
.hbar .name { color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hbar .track { height: 10px; }
.hbar .fill { height: 100%; background: var(--series-1); border-radius: 0 4px 4px 0; min-width: 2px; }
.hbar .num { font-variant-numeric: tabular-nums; color: var(--text-primary); min-width: 3ch; text-align: right; }
.sub-h { margin-top: 16px; }
.empty { color: var(--text-muted); font-size: 13px; }
button, input { font: inherit; }
button { background: transparent; color: var(--text-secondary); border: 1px solid var(--border); border-radius: 6px; padding: 4px 10px; cursor: pointer; }
button:hover { color: var(--text-primary); }
table { width: 100%; border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; margin-top: 8px; }
th, td { text-align: right; padding: 4px 6px; border-bottom: 1px solid var(--grid); }
th:first-child, td:first-child { text-align: left; }
th { color: var(--text-secondary); font-weight: 600; }
.login { max-width: 360px; margin: 18vh auto 0; }
.login form { display: flex; gap: 8px; margin-top: 12px; }
.login input { flex: 1; min-width: 0; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface-1); color: var(--text-primary); }
.login button { padding: 8px 14px; color: var(--text-primary); }
.error { color: var(--critical); font-size: 13px; margin-top: 8px; }
[hidden] { display: none !important; }
</style>
</head>
<body>
<main>
  <section id="login" class="panel login" hidden>
    <h1>Drake Analytics</h1>
    <form id="login-form">
      <input id="token" type="password" placeholder="Dashboard token" autocomplete="current-password" required>
      <button type="submit">Entrar</button>
    </form>
    <div id="login-error" class="error" hidden></div>
  </section>

  <section id="app" hidden>
    <header>
      <h1>Drake Analytics</h1>
      <div class="meta"><span id="updated"></span> · <button id="refresh" type="button">Atualizar</button> <button id="logout" type="button">Sair</button></div>
    </header>

    <div class="tiles">
      <div class="tile"><div class="label">Online agora</div><div class="value" id="t-online">–</div><div class="sub">heartbeat nos últimos 20 min</div></div>
      <div class="tile"><div class="label">Ativos hoje (DAU)</div><div class="value" id="t-dau">–</div><div class="sub">UTC</div></div>
      <div class="tile"><div class="label">Ativos 7 dias</div><div class="value" id="t-wau">–</div></div>
      <div class="tile"><div class="label">Ativos 30 dias</div><div class="value" id="t-mau">–</div></div>
      <div class="tile"><div class="label">Instalações</div><div class="value" id="t-total">–</div><div class="sub" id="t-new"></div></div>
      <div class="tile"><div class="label">Sessão média (7d)</div><div class="value" id="t-session">–</div></div>
    </div>

    <div class="panel">
      <div class="panel-head"><h2>Usuários ativos por dia (30 dias)</h2><button type="button" data-table="active">Tabela</button></div>
      <div class="chart" id="c-active"></div>
      <div id="tbl-active" hidden></div>
    </div>

    <div class="panel">
      <div class="panel-head"><h2>Novas instalações por dia (30 dias)</h2><button type="button" data-table="new">Tabela</button></div>
      <div class="chart" id="c-new"></div>
      <div id="tbl-new" hidden></div>
    </div>

    <div class="grid2">
      <div class="panel"><h2>Região do LoL (ativos 7d)</h2><div class="hbars" id="b-regions"></div></div>
      <div class="panel"><h2>Versão do Drake (ativos 7d)</h2><div class="hbars" id="b-versions"></div></div>
      <div class="panel"><h2>País (ativos 7d)</h2><div class="hbars" id="b-countries"></div></div>
      <div class="panel"><h2>Injeção (ativos 7d)</h2><div class="hbars" id="b-modes"></div><h2 class="sub-h">Modo streamer (ativos 7d)</h2><div class="hbars" id="b-streaming"></div></div>
    </div>
  </section>
</main>
<script>
(function () {
  var KEY = 'drake-analytics-token';
  var $ = function (id) { return document.getElementById(id); };
  var nf = new Intl.NumberFormat('pt-BR');
  var token = '';
  try { token = localStorage.getItem(KEY) || ''; } catch (e) {}
  var timer = null;

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function shortDay(d) { return d.slice(8, 10) + '/' + d.slice(5, 7); }

  function showLogin(msg) {
    $('app').hidden = true; $('login').hidden = false;
    $('login-error').hidden = !msg; $('login-error').textContent = msg || '';
    if (timer) { clearInterval(timer); timer = null; }
  }

  function niceMax(v) {
    if (v <= 4) return 4;
    var p = Math.pow(10, Math.floor(Math.log10(v)));
    var steps = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < steps.length; i++) if (steps[i] * p >= v) return steps[i] * p;
    return 10 * p;
  }

  function barChart(el, rows, field, label) {
    var W = 1000, H = 240, L = 40, R = 8, T = 10, B = 26;
    var max = niceMax(Math.max.apply(null, rows.map(function (r) { return r[field]; }).concat([1])));
    var n = rows.length, slot = (W - L - R) / n, bw = Math.max(4, slot - 2);
    var y = function (v) { return T + (H - T - B) * (1 - v / max); };
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(label) + '">';
    for (var g = 0; g <= 4; g++) {
      var gv = max * g / 4, gy = y(gv);
      svg += '<line class="gridline" x1="' + L + '" x2="' + (W - R) + '" y1="' + gy + '" y2="' + gy + '"/>';
      svg += '<text class="axis" x="' + (L - 6) + '" y="' + (gy + 4) + '" text-anchor="end">' + nf.format(gv) + '</text>';
    }
    rows.forEach(function (r, i) {
      var x = L + i * slot + (slot - bw) / 2, v = r[field], top = y(v), h = Math.max(0, y(0) - top), rad = Math.min(4, bw / 2, h);
      svg += '<rect class="hit" data-i="' + i + '" x="' + (L + i * slot) + '" y="' + T + '" width="' + slot + '" height="' + (H - T - B) + '" fill="transparent"/>';
      if (h > 0) {
        svg += '<path class="bar" data-i="' + i + '" d="M' + x + ',' + y(0) + 'V' + (top + rad) + 'Q' + x + ',' + top + ' ' + (x + rad) + ',' + top + 'H' + (x + bw - rad) + 'Q' + (x + bw) + ',' + top + ' ' + (x + bw) + ',' + (top + rad) + 'V' + y(0) + 'Z"/>';
      }
      if (i % 5 === 4 || i === n - 1) svg += '<text class="axis" x="' + (x + bw / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + shortDay(r.day) + '</text>';
    });
    svg += '</svg><div class="tip"></div>';
    el.innerHTML = svg;
    var tip = el.querySelector('.tip'), svgEl = el.querySelector('svg');
    el.querySelectorAll('.hit').forEach(function (hit) {
      hit.addEventListener('mouseenter', function () {
        var i = +hit.getAttribute('data-i'), r = rows[i];
        var bar = el.querySelector('.bar[data-i="' + i + '"]');
        el.querySelectorAll('.bar.active').forEach(function (b) { b.classList.remove('active'); });
        if (bar) bar.classList.add('active');
        var scale = svgEl.getBoundingClientRect().width / W;
        tip.innerHTML = shortDay(r.day) + ' · <b>' + nf.format(r[field]) + '</b> ' + esc(label);
        tip.style.left = ((L + (i + 0.5) * slot) * scale) + 'px';
        tip.style.top = (y(r[field]) * scale - 6) + 'px';
        tip.style.display = 'block';
      });
    });
    el.addEventListener('mouseleave', function () {
      tip.style.display = 'none';
      el.querySelectorAll('.bar.active').forEach(function (b) { b.classList.remove('active'); });
    });
  }

  function table(el, rows, field, label) {
    el.innerHTML = '<table><thead><tr><th>Dia</th><th>' + esc(label) + '</th></tr></thead><tbody>' +
      rows.slice().reverse().map(function (r) { return '<tr><td>' + r.day + '</td><td>' + nf.format(r[field]) + '</td></tr>'; }).join('') +
      '</tbody></table>';
  }

  function hbars(el, items) {
    if (!items.length) { el.innerHTML = '<div class="empty">Sem dados ainda</div>'; return; }
    var max = Math.max.apply(null, items.map(function (b) { return b.count; }));
    el.innerHTML = items.map(function (b) {
      return '<div class="hbar" title="' + esc(b.key) + ': ' + nf.format(b.count) + '"><span class="name">' + esc(b.key) + '</span>' +
        '<span class="track"><span class="fill" style="display:block;width:' + (100 * b.count / max) + '%"></span></span>' +
        '<span class="num">' + nf.format(b.count) + '</span></div>';
    }).join('');
  }

  function render(s) {
    $('t-online').textContent = nf.format(s.online);
    $('t-dau').textContent = nf.format(s.dau);
    $('t-wau').textContent = nf.format(s.wau);
    $('t-mau').textContent = nf.format(s.mau);
    $('t-total').textContent = nf.format(s.total_installs);
    $('t-new').textContent = '+' + nf.format(s.new_installs_7d) + ' nos últimos 7 dias';
    $('t-session').textContent = s.avg_session_minutes_7d == null ? '–' : nf.format(s.avg_session_minutes_7d) + ' min';
    barChart($('c-active'), s.daily, 'active', 'ativos');
    barChart($('c-new'), s.daily, 'new_installs', 'novas');
    table($('tbl-active'), s.daily, 'active', 'Ativos');
    table($('tbl-new'), s.daily, 'new_installs', 'Novas instalações');
    hbars($('b-regions'), s.regions);
    hbars($('b-versions'), s.versions);
    hbars($('b-countries'), s.countries);
    hbars($('b-modes'), s.modes);
    hbars($('b-streaming'), s.streaming);
    $('updated').textContent = 'Atualizado ' + new Date(s.generated_at * 1000).toLocaleTimeString('pt-BR');
  }

  function load() {
    return fetch('/api/stats', { headers: { authorization: 'Bearer ' + token } }).then(function (res) {
      if (res.status === 401) { try { localStorage.removeItem(KEY); } catch (e) {} token = ''; showLogin('Token inválido'); return; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json().then(function (s) {
        $('login').hidden = true; $('app').hidden = false;
        render(s);
        if (!timer) timer = setInterval(load, 60000);
      });
    }).catch(function (e) { $('updated').textContent = 'Erro ao carregar: ' + e.message; });
  }

  $('login-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    token = $('token').value.trim();
    try { localStorage.setItem(KEY, token); } catch (e) {}
    load();
  });
  $('refresh').addEventListener('click', load);
  $('logout').addEventListener('click', function () { try { localStorage.removeItem(KEY); } catch (e) {} token = ''; showLogin(''); });
  document.querySelectorAll('[data-table]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var el = $('tbl-' + btn.getAttribute('data-table'));
      el.hidden = !el.hidden;
      btn.textContent = el.hidden ? 'Tabela' : 'Ocultar';
    });
  });

  if (token) load(); else showLogin('');
})();
</script>
</body>
</html>`;
