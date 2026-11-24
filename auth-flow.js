/* VoxelSpase — entry flow v1.2 (max): welcome, sign-up wizard, sign-in, reset, first-run onboarding.
   Real Supabase calls only through the client from init(). Every success comes from a real response. */
(function () {
  var deps = null;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var S = {
    screen: 'welcome', lastScreen: '', dir: 'fwd',
    email: '', displayName: '', username: '', pwPreview: '', password: '',
    usernameState: 'idle', usernameTimer: 0,
    busy: false, error: '', info: '', shakeForm: '',
    cooldownUntil: 0, cooldownTimer: 0,
    demo: 0, eggCount: 0, eggTimer: 0, egg: false,
    onb: 0, onbLast: -1, onbChan: 0, pins: {}, chat: [], typing: false,
    draft: {},
  };
  var PASSWORD_MIN = 8;
  var USER_RE = /^[a-z0-9_.]{3,20}$/;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var esc = function (x) {
    return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  // ---------- messages & rules ----------
  function mapError(err) {
    var m = String((err && err.message) || '').toLowerCase();
    if (m.indexOf('invalid login') >= 0) return 'Неверная почта или пароль.';
    if (m.indexOf('email not confirmed') >= 0) return 'Почта ещё не подтверждена. Проверь письмо или отправим его ещё раз.';
    if (m.indexOf('already registered') >= 0 || m.indexOf('already been registered') >= 0) return 'Аккаунт с этой почтой уже есть. Попробуй войти.';
    if (m.indexOf('rate') >= 0 || m.indexOf('too many') >= 0 || m.indexOf('seconds') >= 0) return 'Слишком много попыток. Подожди немного и попробуй снова.';
    if (m.indexOf('password') >= 0 && m.indexOf('least') >= 0) return 'Пароль слишком простой. Сделай его длиннее.';
    if (m.indexOf('network') >= 0 || m.indexOf('fetch') >= 0) return 'Нет связи с сервером. Проверь интернет и попробуй ещё раз.';
    return 'Не получилось. Попробуй ещё раз немного позже.';
  }
  function rules(pw) {
    return { len: pw.length >= PASSWORD_MIN, letter: /[A-Za-zА-Яа-яЁё]/.test(pw), digit: /\d/.test(pw) };
  }
  function strength(pw) {
    var r = rules(pw), s = 0;
    if (pw.length >= PASSWORD_MIN) s++;
    if (pw.length >= 12) s++;
    if (r.letter && r.digit) s++;
    if (/[^A-Za-zА-Яа-яЁё0-9]/.test(pw) || (/[a-z]/.test(pw) && /[A-Z]/.test(pw))) s++;
    return s; // 0..4
  }
  function meterLevel(pw) { return pw ? Math.max(1, strength(pw)) : 0; } // any input shows at least one step
  var STRENGTH_LABEL = ['Слабый', 'Слабый', 'Средний', 'Хороший', 'Надёжный'];
  function cooldownLeft() { return Math.max(0, Math.ceil((S.cooldownUntil - Date.now()) / 1000)); }
  function startCooldown(sec) {
    S.cooldownUntil = Date.now() + sec * 1000;
    clearInterval(S.cooldownTimer);
    S.cooldownTimer = setInterval(function () {
      if (cooldownLeft() === 0) clearInterval(S.cooldownTimer);
      tickCooldown();
    }, 1000);
  }
  function tickCooldown() {
    var btn = document.querySelector('[data-cooldown]');
    if (!btn) return;
    var left = cooldownLeft();
    if (left > 0) { btn.disabled = true; btn.textContent = btn.dataset.cooldown.replace('{s}', left); }
    else { btn.disabled = false; btn.textContent = btn.dataset.label; }
  }

  // ---------- painting & motion ----------
  function cubeRect() {
    var el = document.querySelector('.cube-wrap');
    return el ? el.getBoundingClientRect() : null;
  }
  function flipCube(from) {
    if (reduce || !from) return;
    var el = document.querySelector('.cube-wrap');
    if (!el || !el.animate) return;
    var to = el.getBoundingClientRect();
    var dx = (from.left + from.width / 2) - (to.left + to.width / 2);
    var dy = (from.top + from.height / 2) - (to.top + to.height / 2);
    var s = from.width / to.width;
    el.animate(
      [{ transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + s + ')' }, { transform: 'none' }],
      { duration: 760, easing: 'cubic-bezier(.2,.8,.2,1)' }
    );
  }
  function shakeForm(name) {
    S.shakeForm = name;
    requestAnimationFrame(function () {
      var f = document.querySelector('[data-auth-form="' + name + '"]');
      if (!f || reduce) return;
      f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
    });
  }
  function paint(opts) {
    var from = opts && opts.morph ? cubeRect() : null;
    if (deps && deps.rerender) deps.rerender();
    if (from) requestAnimationFrame(function () { flipCube(from); });
  }
  function go(to, dir) {
    S.dir = dir || 'fwd';
    S.screen = to; S.error = ''; S.info = ''; S.shakeForm = '';
    paint({ morph: S.screen !== 'welcome' && (S.lastScreen === 'welcome' || to === 'welcome') });
  }
  function fail(msg, form) { S.error = msg; paint(); if (form) shakeForm(form); }

  // ---------- pieces ----------
  var CUBE = '<svg class="cube-svg" viewBox="0 0 128 128" aria-hidden="true"><defs><linearGradient id="vsg" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#7C3AED"/><stop offset="1" stop-color="#2563EB"/></linearGradient></defs><rect width="128" height="128" rx="33" fill="url(#vsg)"/><path class="f f1" d="M27 37 64 58 101 37 64 16Z" fill="#D4CCFF"/><path class="f f2" d="M27 37v45l37 22V58Z" fill="#F3E8FF"/><path class="f f3" d="M101 37v45l-37 22V58Z" fill="#B7A4FF"/><path class="inner" pathLength="1" d="m44 51 20 12 20-12" stroke="#6D28D9" stroke-width="5" stroke-linecap="round" fill="none"/></svg>';
  function notice() {
    if (S.error) return '<p class="notice err" role="alert">' + esc(S.error) + '</p>';
    if (S.info) return '<p class="notice ok" role="status">' + esc(S.info) + '</p>';
    return '';
  }
  function field(o) {
    var v = S.draft[o.name] != null ? S.draft[o.name] : o.value;
    var valid = o.kind === 'email' && v && EMAIL_RE.test(v);
    return '<label class="field ' + (o.cls || '') + (valid ? ' valid' : '') + '"><span class="lbl">' + esc(o.label) + '</span>' +
      '<span class="ctl"><input name="' + o.name + '" type="' + (o.type || 'text') + '" ' +
      (o.autocomplete ? 'autocomplete="' + o.autocomplete + '" ' : '') +
      (o.maxlength ? 'maxlength="' + o.maxlength + '" ' : '') +
      (o.placeholder ? 'placeholder="' + esc(o.placeholder) + '" ' : '') +
      (v != null && v !== '' ? 'value="' + esc(v) + '" ' : '') +
      (o.required === false ? '' : 'required ') + (o.extra || '') + '>' +
      (o.kind === 'email' ? '<i class="tick" aria-hidden="true"></i>' : '') + '</span>' +
      (o.toggle ? '<button type="button" class="eye" data-auth-act="toggle-pass" aria-label="Показать или скрыть пароль">Показать</button>' : '') +
      (o.hint ? '<small class="hint">' + o.hint + '</small>' : '') + '</label>';
  }
  function backBtn(to, label) {
    return '<button type="button" class="back" data-auth-act="go" data-to="' + to + '" data-dir="back">← ' + (label || 'Назад') + '</button>';
  }
  function cubeHead(mini) {
    return '<div class="cube-wrap ' + (mini ? 'mini' : '') + '" data-auth-act="egg" role="presentation">' + CUBE +
      (S.egg ? '<span class="egg">GPT сделает хуже 😂</span>' : '') + '</div>';
  }
  function steps(n) {
    var labels = ['Почта', 'Пароль', 'Профиль', 'Письмо'];
    return '<ol class="steps" aria-label="Шаг ' + n + ' из 4">' + labels.map(function (l, i) {
      var cls = i + 1 < n ? 'done' : i + 1 === n ? 'now' : '';
      return '<li class="' + cls + '"><i><b></b></i><span>' + l + '</span></li>';
    }).join('') + '</ol>';
  }
  function pwMeter(pw) {
    var s = meterLevel(pw);
    var bars = [0, 1, 2, 3].map(function (i) { return '<b class="' + (i < s ? 'on' : '') + '"></b>'; }).join('');
    return '<div class="pwmeter" aria-live="polite"><div class="bars">' + bars + '</div><span>' + (pw ? STRENGTH_LABEL[s] : 'Надёжность пароля') + '</span></div>';
  }
  function rulesList(pw) {
    var r = rules(pw);
    function row(ok, text) { return '<li class="' + (ok ? 'ok' : '') + '"><i></i>' + text + '</li>'; }
    return '<ul class="rules" id="rules">' + row(r.len, 'Не короче ' + PASSWORD_MIN + ' символов') + row(r.letter, 'Есть буквы') + row(r.digit, 'Есть цифры') + '</ul>';
  }
  function submitBtn(label, disabled) {
    return '<button type="submit" class="btn primary full' + (S.busy ? ' is-busy' : '') + '" ' + (disabled || S.busy ? 'disabled' : '') + '>' +
      (S.busy ? '<span class="spin" aria-hidden="true"></span>' : '') + '<span>' + label + '</span></button>';
  }

  // ---------- screens ----------
  function welcome() {
    var demos = [
      '<div class="demo-card"><b>Андрей</b><span>Го в #мемы? 😄</span><em>Мария печатает…</em></div>',
      '<div class="demo-card"><b>Сервер «Квантумец»</b><span># общий · # мемы · 🔊 голос</span><em>Роли: Админ, Участник</em></div>',
      '<div class="demo-card"><b>Твой профиль</b><span>Аватар, баннер, значки</span><em>Alpha-Number № 7</em></div>',
    ];
    return '<main class="auth-page welcome">' +
      '<div class="orbs" aria-hidden="true"><i></i><i></i><i></i></div>' +
      cubeHead(false) +
      '<h1>Добро пожаловать в VoxelSpase</h1>' +
      '<p class="lead">Твоё пространство для общения, друзей и сообществ.</p>' +
      '<div class="demo">' + demos.map(function (d, i) {
        return '<div class="demo-slide' + (i === S.demo ? ' on' : '') + '">' + d + '</div>';
      }).join('') + '</div>' +
      '<div class="dots" role="group" aria-label="Что умеет VoxelSpase">' + [0, 1, 2].map(function (i) {
        return '<button type="button" class="dot' + (i === S.demo ? ' on' : '') + '" data-auth-act="demo" data-i="' + i + '" aria-label="Показать ' + (i + 1) + '"></button>';
      }).join('') + '</div>' +
      '<div class="actions">' +
        '<button type="button" class="btn primary" data-auth-act="go" data-to="signup-email">Создать аккаунт</button>' +
        '<button type="button" class="btn ghost" data-auth-act="go" data-to="login">У меня уже есть аккаунт</button>' +
      '</div>' +
      '<p class="fine">Серверы, голосовые комнаты и личные сообщения в одном месте.</p>' +
    '</main>';
  }
  function signupEmail() {
    return '<main class="auth-page">' + cubeHead(true) + backBtn('welcome', 'В начало') + steps(1) +
      '<h2>Какая у тебя почта?</h2><p class="lead">Она нужна для входа и восстановления доступа.</p>' + notice() +
      '<form class="form" data-auth-form="email" novalidate>' +
        field({ label: 'Почта', name: 'email', type: 'email', kind: 'email', autocomplete: 'email', placeholder: 'you@example.com', value: S.email }) +
        submitBtn('Дальше') +
      '</form>' +
      '<p class="fine">Уже есть аккаунт? <button type="button" class="link" data-auth-act="go" data-to="login">Войти</button></p></main>';
  }
  function signupPassword() {
    return '<main class="auth-page">' + cubeHead(true) + backBtn('signup-email') + steps(2) +
      '<h2>Придумай пароль</h2><p class="lead">Минимум ' + PASSWORD_MIN + ' символов, буквы и цифры.</p>' + notice() +
      '<form class="form" data-auth-form="password" novalidate>' +
        field({ label: 'Пароль', name: 'password', type: 'password', autocomplete: 'new-password', toggle: true, extra: 'data-auth-live="pw"', placeholder: 'Не короче ' + PASSWORD_MIN }) +
        '<div class="pwrow" id="pwrow">' + pwMeter(S.pwPreview) + '</div>' + rulesList(S.pwPreview) +
        field({ label: 'Повтори пароль', name: 'password2', type: 'password', autocomplete: 'new-password', toggle: true, placeholder: 'Ещё раз' }) +
        submitBtn('Дальше') +
      '</form></main>';
  }
  function signupProfile() {
    var st = S.usernameState;
    var msg = { idle: 'Латиница, цифры, точка и _ · от 3 до 20 символов', checking: 'Проверяем…', free: 'Имя свободно', taken: 'Это имя уже занято', invalid: 'От 3 до 20 символов: a–z, 0–9, точка, _', unknown: 'Проверим при создании аккаунта' }[st];
    var cls = { free: 'good', taken: 'bad', invalid: 'bad' }[st] || '';
    return '<main class="auth-page">' + cubeHead(true) + backBtn('signup-password') + steps(3) +
      '<h2>Как тебя увидят?</h2><p class="lead">Имя видят все, @username — для поиска друзей.</p>' + notice() +
      '<form class="form" data-auth-form="profile" novalidate>' +
        field({ label: 'Отображаемое имя', name: 'displayName', autocomplete: 'nickname', maxlength: 50, placeholder: 'Как к тебе обращаться', value: S.displayName }) +
        '<label class="field"><span class="lbl">@username</span><span class="ctl prefix"><b>@</b><input name="username" autocomplete="username" maxlength="20" placeholder="username" value="' + esc(S.username) + '" required data-auth-live="username"><i class="tick ' + cls + '" aria-hidden="true"></i></span>' +
        '<small class="hint ' + cls + '" id="uhint" role="status">' + msg + '</small></label>' +
        '<label class="field optional"><span class="lbl">О себе <em>(необязательно)</em></span><span class="ctl"><input name="bio" maxlength="120" placeholder="Пока можно пропустить"></span></label>' +
        submitBtn('Создать аккаунт', st === 'taken' || st === 'invalid' || st === 'checking') +
      '</form></main>';
  }
  function confirmEmail() {
    return '<main class="auth-page confirm">' + cubeHead(true) + steps(4) +
      '<div class="mailfx" aria-hidden="true"><div class="env"><span></span></div><svg class="plane" viewBox="0 0 24 24"><path d="M2 11l19-8-6 18-3-7-7-3z"/></svg></div>' +
      '<h2>Проверь почту</h2>' +
      '<p class="lead">Мы отправили письмо на <b>' + esc(S.email) + '</b>. Открой ссылку из письма — и аккаунт готов.</p>' + notice() +
      '<button type="button" class="btn primary full" data-auth-act="resend" data-cooldown="Отправить ещё раз через {s} с" data-label="Отправить письмо ещё раз" ' + (cooldownLeft() || S.busy ? 'disabled' : '') + '>' +
        (cooldownLeft() ? 'Отправить ещё раз через ' + cooldownLeft() + ' с' : 'Отправить письмо ещё раз') + '</button>' +
      '<ul class="tips"><li>Письмо может попасть в «Спам» или «Промоакции».</li><li>Опечатка в почте? <button type="button" class="link" data-auth-act="go" data-to="signup-email" data-dir="back">Изменить адрес</button></li><li>Ссылка действует ограниченное время — запроси новую.</li></ul>' +
      '<p class="fine"><button type="button" class="link" data-auth-act="go" data-to="login">Уже подтвердил? Войти</button></p></main>';
  }
  function login() {
    var left = cooldownLeft();
    return '<main class="auth-page">' + cubeHead(true) + backBtn('welcome', 'В начало') +
      '<h2>С возвращением</h2><p class="lead">Войди, чтобы вернуться к друзьям.</p>' + notice() +
      '<form class="form" data-auth-form="login" novalidate>' +
        field({ label: 'Почта', name: 'email', type: 'email', kind: 'email', autocomplete: 'email', placeholder: 'you@example.com', value: S.email }) +
        field({ label: 'Пароль', name: 'password', type: 'password', autocomplete: 'current-password', toggle: true, placeholder: 'Твой пароль' }) +
        submitBtn(S.busy ? 'Входим…' : 'Войти') +
      '</form>' +
      '<div class="row-between"><button type="button" class="link" data-auth-act="go" data-to="reset">Забыли пароль?</button>' +
      '<button type="button" class="link" data-auth-act="go" data-to="signup-email">Создать аккаунт</button></div>' +
      (S.error && S.error.indexOf('не подтверждена') >= 0 ? '<button type="button" class="btn ghost full" data-auth-act="resend" data-cooldown="Письмо можно запросить через {s} с" data-label="Отправить письмо для подтверждения" ' + (left ? 'disabled' : '') + '>' + (left ? 'Письмо можно запросить через ' + left + ' с' : 'Отправить письмо для подтверждения') + '</button>' : '') +
    '</main>';
  }
  function reset() {
    var left = cooldownLeft();
    return '<main class="auth-page">' + cubeHead(true) + backBtn('login', 'Ко входу') +
      '<h2>Восстановить доступ</h2><p class="lead">Пришлём ссылку, если аккаунт с такой почтой есть.</p>' + notice() +
      '<form class="form" data-auth-form="reset" novalidate>' +
        field({ label: 'Почта', name: 'email', type: 'email', kind: 'email', autocomplete: 'email', placeholder: 'you@example.com', value: S.email }) +
        '<button type="submit" class="btn primary full" data-cooldown="Попробуй через {s} с" data-label="Отправить ссылку" ' + (left || S.busy ? 'disabled' : '') + '><span>' + (left ? 'Попробуй через ' + left + ' с' : 'Отправить ссылку') + '</span></button>' +
      '</form></main>';
  }
  function newPassword() {
    return '<main class="auth-page">' + cubeHead(true) +
      '<h2>Новый пароль</h2><p class="lead">Придумай пароль, которого ещё не было.</p>' + notice() +
      '<form class="form" data-auth-form="newpw" novalidate>' +
        field({ label: 'Новый пароль', name: 'password', type: 'password', autocomplete: 'new-password', toggle: true, extra: 'data-auth-live="pw"', placeholder: 'Не короче ' + PASSWORD_MIN }) +
        '<div class="pwrow" id="pwrow">' + pwMeter(S.pwPreview) + '</div>' + rulesList(S.pwPreview) +
        submitBtn('Сохранить пароль') +
      '</form></main>';
  }

  // ---------- onboarding ----------
  var ONB = ['Общайся', 'Создавай сообщества', 'Настрой профиль', 'Добро пожаловать!'];
  function onbPending(uid) {
    try { return localStorage.getItem('vs.onb.pending') === '1' && localStorage.getItem('vs.onb.done.' + uid) !== '1'; }
    catch (e) { return false; }
  }
  function onbFinish(uid, celebrateNow) {
    if (celebrateNow) celebrate();
    try {
      localStorage.setItem('vs.onb.done.' + uid, '1');
      localStorage.removeItem('vs.onb.pending');
    } catch (e) {}
    S.draft = {}; S.password = ''; S.pwPreview = ''; S.onb = 0; S.onbLast = -1; S.chat = []; S.typing = false;
    if (deps && deps.rerender) deps.rerender();
  }
  function onboardingHtml(uid) {
    var i = S.onb, last = i === ONB.length - 1;
    var changed = S.onbLast !== i; S.onbLast = i;
    var chatHtml = '<div class="chat-demo" id="chatdemo">' +
      '<div class="bubble them">Го в #мемы? 😄</div>' +
      S.chat.map(function (m) { return '<div class="bubble ' + (m.me ? 'me' : 'them') + '">' + esc(m.t) + '</div>'; }).join('') +
      (S.typing ? '<div class="bubble them typing" aria-label="Печатает"><i></i><i></i><i></i></div>' : '') +
      '</div>';
    var body = [
      chatHtml + '<form class="chat-input" data-auth-form="onb-chat"><input name="msg" maxlength="120" placeholder="Напиши что-нибудь" aria-label="Сообщение"><button type="submit" class="btn primary sm">Отправить</button></form>',
      '<div class="server-demo"><div class="srv-head"><span class="srv-ico">К</span><b>Квантумец</b></div>' +
        '<div class="chan-list">' + ['# общий', '# мемы', '🔊 Голосовая комната'].map(function (c, j) {
          return '<button type="button" class="chan' + (S.onbChan === j ? ' on' : '') + '" data-auth-act="onb-chan" data-i="' + j + '">' + c + '</button>';
        }).join('') + '</div>' +
        '<div class="roles"><span class="role admin">Админ</span><span class="role">Модератор</span><span class="role">Участник</span></div></div>',
      '<div class="profile-demo"><div class="pbanner"></div><div class="pavatar">🚀</div><b>Андрей</b><span>@andrei</span>' +
        '<div class="pbadges">' + [['alpha-gold', '№ 7'], ['crew', 'Crew'], ['legend', 'Legend']].map(function (b) {
          return '<button type="button" class="pbadge' + (S.pins[b[0]] ? ' pinned' : '') + '" data-auth-act="pin" data-k="' + b[0] + '">' + b[1] + '</button>';
        }).join('') + '</div><small>Нажми на значок, чтобы закрепить. До трёх у имени.</small></div>',
      '<div class="final-demo"><div class="burst" aria-hidden="true"></div>' + CUBE + '<p>Всё готово. Серверы, друзья и голос ждут.</p></div>',
    ][i];
    var nav = '<div class="onb-nav">' +
      (i > 0 ? '<button type="button" class="btn ghost" data-auth-act="onb-prev">Назад</button>' : '<span></span>') +
      (last ? '<button type="button" class="btn primary" data-auth-act="onb-finish">Перейти в VoxelSpase</button>'
            : '<button type="button" class="btn primary" data-auth-act="onb-next">Дальше</button>') +
      '</div>';
    var dirCls = S.dir === 'back' ? ' enter-back' : ' enter-fwd';
    return '<main class="auth-page onb' + (changed ? ' enter' + dirCls : '') + '" data-uid="' + esc(uid) + '">' +
      '<div class="onb-top"><span class="onb-count">' + (i + 1) + ' / ' + ONB.length + '</span>' +
      '<button type="button" class="link" data-auth-act="onb-skip">Пропустить</button></div>' +
      '<div class="onb-progress" aria-hidden="true">' + ONB.map(function (_, j) { return '<i class="' + (j <= i ? 'on' : '') + '"></i>'; }).join('') + '</div>' +
      '<h2 class="onb-title' + (changed ? ' enter' : '') + '">' + esc(ONB[i]) + '</h2>' +
      '<div class="onb-body' + (changed ? ' enter' : '') + '">' + body + '</div>' + nav +
    '</main>';
  }
  function renderOnboardingShell(uid) { return shell(onboardingHtml(uid)); }
  function celebrate() {
    if (reduce) return;
    var c = document.createElement('canvas');
    c.className = 'celebrate';
    c.width = innerWidth; c.height = innerHeight;
    document.body.appendChild(c);
    var x = c.getContext('2d');
    var cols = ['#7C3AED', '#A78BFA', '#38BDF8', '#F5F3FF'];
    var P = [];
    for (var k = 0; k < 150; k++) {
      var a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 9;
      P.push({ x: c.width / 2, y: c.height * 0.38, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 4, r: 2 + Math.random() * 4, rot: Math.random() * 6, vr: (Math.random() - .5) * .3, c: cols[k % cols.length], life: 1 });
    }
    var t0 = performance.now();
    (function frame(now) {
      var t = (now - t0) / 1000;
      x.clearRect(0, 0, c.width, c.height);
      P.forEach(function (p) {
        p.vy += 0.22; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 0.008;
        if (p.life <= 0) return;
        x.save(); x.globalAlpha = Math.max(0, p.life); x.translate(p.x, p.y); x.rotate(p.rot);
        x.fillStyle = p.c; x.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); x.restore();
      });
      if (t < 2.4) requestAnimationFrame(frame); else c.remove();
    })(t0);
  }

  // ---------- desktop shell: brand panel on the left, form card on the right ----------
  function brandPanel() {
    return '<aside class="auth-brand" aria-hidden="true">' +
      '<div class="ab-orbs"><i></i><i></i><i></i></div>' +
      '<div class="ab-cube">' + CUBE + '</div>' +
      '<h2>VoxelSpase</h2>' +
      '<p>Серверы, голосовые комнаты и личные сообщения. Один аккаунт — все твои сообщества.</p>' +
      '<ul><li><i></i>Голос в один клик</li><li><i></i>Точки возврата для важных сообщений</li><li><i></i>Premium-темы и рамки для профиля</li></ul>' +
      '<small>Альфа-версия 1.4</small>' +
    '</aside>';
  }
  function shell(inner) {
    return '<div class="auth-shell">' + brandPanel() + inner + '</div>';
  }

  // ---------- render ----------
  function screenHtml() {
    switch (S.screen) {
      case 'signup-email': return signupEmail();
      case 'signup-password': return signupPassword();
      case 'signup-profile': return signupProfile();
      case 'confirm': return confirmEmail();
      case 'login': return login();
      case 'reset': return reset();
      case 'newpw': return newPassword();
      default: return welcome();
    }
  }
  function render(mode) {
    if (mode === 'reset') S.screen = 'reset';
    if (mode === 'new-password') S.screen = 'newpw';
    if (!deps) return '';
    var fresh = S.screen !== S.lastScreen;
    S.lastScreen = S.screen;
    var cls = fresh ? ' enter enter-' + (S.dir === 'back' ? 'back' : 'fwd') : '';
    var html = screenHtml();
    html = html.replace('class="auth-page', 'class="auth-page' + cls);
    return shell(html);
  }

  // ---------- actions ----------
  function setPw(pw) { S.password = pw; }
  async function submitEmail(fd) {
    var email = String(fd.get('email') || '').trim();
    S.draft.email = email;
    if (!EMAIL_RE.test(email)) return fail('Проверь почту: что-то не так с адресом.', 'email');
    S.email = email; S.error = '';
    go('signup-password');
  }
  async function submitPassword(fd) {
    var pw = String(fd.get('password') || ''), pw2 = String(fd.get('password2') || '');
    S.pwPreview = pw;
    var r = rules(pw);
    if (!r.len || !r.letter || !r.digit) return fail('Пароль пока не подходит: проверь требования ниже.', 'password');
    if (pw !== pw2) return fail('Пароли не совпадают.', 'password');
    setPw(pw); delete S.draft.password; delete S.draft.password2;
    go('signup-profile');
  }
  function checkUsername(value) {
    var v = String(value || '').trim().toLowerCase();
    S.username = v;
    clearTimeout(S.usernameTimer);
    if (!USER_RE.test(v)) { S.usernameState = v ? 'invalid' : 'idle'; return paint(); }
    S.usernameState = 'checking'; paint();
    S.usernameTimer = setTimeout(async function () {
      try {
        var res = await deps.client.rpc('voxel_username_available', { p_username: v });
        if (res.error) throw res.error;
        S.usernameState = res.data === true ? 'free' : 'taken';
      } catch (e) { S.usernameState = 'unknown'; }
      paint();
    }, 350);
  }
  async function submitProfile(fd) {
    var name = String(fd.get('displayName') || '').trim();
    var uname = String(fd.get('username') || '').trim().toLowerCase();
    S.draft.displayName = name; S.draft.username = uname;
    if (!name) return fail('Напиши, как к тебе обращаться.', 'profile');
    if (!USER_RE.test(uname)) { S.username = uname; return fail('Имя пользователя: от 3 до 20 символов, a–z, 0–9, точка и _.', 'profile'); }
    if (S.usernameState === 'taken') return fail('Этот @username уже занят. Выбери другой.', 'profile');
    S.displayName = name; S.username = uname; S.error = '';
    if (!S.password) { S.screen = 'signup-password'; return fail('Введи пароль ещё раз — он не хранится, чтобы было безопаснее.', null); }
    S.busy = true; paint();
    try {
      try { localStorage.setItem('vs.pendingUsername', uname); localStorage.setItem('vs.onb.pending', '1'); } catch (e) {}
      var res = await deps.client.auth.signUp({
        email: S.email, password: S.password,
        options: { data: { display_name: name, username: uname }, emailRedirectTo: location.origin + '/app/' },
      });
      if (res.error) throw res.error;
      S.password = ''; S.busy = false;
      if (res.data && res.data.session) { await deps.enter(res.data.user); return; }
      startCooldown(60);
      go('confirm');
    } catch (err) {
      S.busy = false;
      fail(mapError(err), 'profile');
    }
  }
  async function submitLogin(fd) {
    var email = String(fd.get('email') || '').trim(), pw = String(fd.get('password') || '');
    S.draft.email = email;
    if (!EMAIL_RE.test(email) || !pw) return fail('Введи почту и пароль.', 'login');
    S.email = email; S.busy = true; S.error = ''; paint();
    try {
      var res = await deps.client.auth.signInWithPassword({ email: email, password: pw });
      if (res.error) throw res.error;
      S.busy = false;
      await deps.enter(res.data.user);
    } catch (err) { S.busy = false; fail(mapError(err), 'login'); }
  }
  async function submitReset(fd) {
    var email = String(fd.get('email') || '').trim();
    S.draft.email = email;
    if (!EMAIL_RE.test(email)) return fail('Проверь почту.', 'reset');
    S.email = email; S.busy = true; paint();
    try {
      var res = await deps.client.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/app/?recovery=1' });
      if (res.error) throw res.error;
    } catch (err) { /* same message either way: do not reveal which accounts exist */ }
    S.busy = false; startCooldown(60);
    S.info = 'Если аккаунт с такой почтой есть, письмо отправлено. Проверь входящие и спам.';
    paint();
  }
  async function submitNewPassword(fd) {
    var pw = String(fd.get('password') || ''); S.pwPreview = pw;
    var r = rules(pw);
    if (!r.len || !r.letter || !r.digit) return fail('Пароль пока не подходит.', 'newpw');
    S.busy = true; paint();
    try {
      var res = await deps.client.auth.updateUser({ password: pw });
      if (res.error) throw res.error;
      S.busy = false;
      if (deps.passwordChanged) await deps.passwordChanged();
    } catch (err) { S.busy = false; fail(mapError(err), 'newpw'); }
  }
  async function resend() {
    if (cooldownLeft() > 0 || !S.email) return;
    S.busy = true; paint();
    try {
      var res = await deps.client.auth.resend({ type: 'signup', email: S.email, options: { emailRedirectTo: location.origin + '/app/' } });
      if (res.error) throw res.error;
      S.info = 'Письмо отправлено. Проверь почту.';
    } catch (err) { S.error = mapError(err); }
    S.busy = false; startCooldown(60); paint();
  }
  function botReply(text) {
    S.typing = true; paint();
    setTimeout(function () {
      S.typing = false;
      S.chat.push({ me: false, t: text });
      paint();
    }, reduce ? 0 : 1100);
  }

  // ---------- events ----------
  document.addEventListener('pointerdown', function (e) {
    var b = e.target.closest && e.target.closest('.btn, .actions button, .pbadge, .chan');
    if (!b || reduce) return;
    var r = b.getBoundingClientRect();
    var s = document.createElement('span');
    s.className = 'rip';
    s.style.left = (e.clientX - r.left) + 'px';
    s.style.top = (e.clientY - r.top) + 'px';
    b.appendChild(s);
    setTimeout(function () { s.remove(); }, 600);
  }, { passive: true });

  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-auth-act]');
    if (!el) return;
    var act = el.dataset.authAct;
    if (act === 'go') {
      var morph = el.dataset.to === 'login' || el.dataset.to === 'signup-email';
      S.dir = el.dataset.dir === 'back' ? 'back' : 'fwd';
      if (morph && S.screen === 'welcome') return go(el.dataset.to, 'fwd');
      return go(el.dataset.to, S.dir);
    }
    if (act === 'demo') { S.demo = Number(el.dataset.i); return paint(); }
    if (act === 'resend') return resend();
    if (act === 'toggle-pass') {
      var input = el.closest('label') && el.closest('label').querySelector('input');
      if (input) {
        var show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        el.textContent = show ? 'Скрыть' : 'Показать';
        el.setAttribute('aria-pressed', String(show));
      }
      return;
    }
    if (act === 'egg') {
      S.eggCount++; clearTimeout(S.eggTimer);
      S.eggTimer = setTimeout(function () { S.eggCount = 0; }, 900);
      if (S.eggCount >= 3) { S.eggCount = 0; S.egg = true; paint(); setTimeout(function () { S.egg = false; paint(); }, 2600); }
      return;
    }
    if (act === 'onb-next') { S.dir = 'fwd'; S.onb = Math.min(3, S.onb + 1); return paint(); }
    if (act === 'onb-prev') { S.dir = 'back'; S.onb = Math.max(0, S.onb - 1); return paint(); }
    if (act === 'onb-skip' || act === 'onb-finish') { return onbFinish(deps.uid ? deps.uid() : '', act === 'onb-finish'); }
    if (act === 'onb-chan') { S.onbChan = Number(el.dataset.i); return paint(); }
    if (act === 'pin') { var k = el.dataset.k; S.pins[k] = !S.pins[k]; return paint(); }
  }, false);

  document.addEventListener('submit', function (e) {
    var f = e.target.closest && e.target.closest('[data-auth-form]');
    if (!f) return;
    e.preventDefault();
    var fd = new FormData(f), name = f.dataset.authForm;
    if (name === 'email') return submitEmail(fd);
    if (name === 'password') return submitPassword(fd);
    if (name === 'profile') return submitProfile(fd);
    if (name === 'login') return submitLogin(fd);
    if (name === 'reset') return submitReset(fd);
    if (name === 'newpw') return submitNewPassword(fd);
    if (name === 'onb-chat') {
      var v = String(fd.get('msg') || '').trim();
      if (!v) return;
      S.chat.push({ me: true, t: v });
      f.reset();
      botReply(['Круто! 🚀', 'Заходи в #мемы, там весело', 'Голос тоже работает 🔊'][S.chat.length % 3]);
    }
  }, false);

  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.form && t.form.dataset && t.form.dataset.authForm && t.name) S.draft[t.name] = t.value;
    if (t.dataset && t.dataset.authLive === 'username') return checkUsername(t.value);
    if (t.name === 'email') {
      var label = t.closest('.field');
      if (label) label.classList.toggle('valid', EMAIL_RE.test(t.value));
    }
    if (t.dataset && t.dataset.authLive === 'pw') {
      S.pwPreview = t.value;
      var r = rules(t.value), s = meterLevel(t.value);
      var list = document.getElementById('rules');
      if (list) {
        list.children[0].className = r.len ? 'ok' : '';
        list.children[1].className = r.letter ? 'ok' : '';
        list.children[2].className = r.digit ? 'ok' : '';
      }
      document.querySelectorAll('#pwrow .bars b').forEach(function (b, i) { b.classList.toggle('on', i < s); });
      var lab = document.querySelector('#pwrow .pwmeter span');
      if (lab) lab.textContent = t.value ? STRENGTH_LABEL[strength(t.value)] : 'Надёжность пароля';
    }
  }, false);

  // keep the welcome demo alive without re-rendering (only classes change)
  setInterval(function () {
    if (S.screen !== 'welcome' || !deps || reduce) return;
    S.demo = (S.demo + 1) % 3;
    document.querySelectorAll('.demo-slide').forEach(function (el, i) { el.classList.toggle('on', i === S.demo); });
    document.querySelectorAll('.dot').forEach(function (el, i) { el.classList.toggle('on', i === S.demo); });
  }, 4200);

  // ---------- public API ----------
  window.VoxelAuth = {
    init: function (opts) { deps = opts; },
    render: render,
    onboardingPending: function (uid) { return !!uid && onbPending(uid); },
    renderOnboarding: function (uid) { return renderOnboardingShell(uid); },
    celebrate: celebrate,
    markOnboardingDone: function (uid) { onbFinish(uid, false); },
    pendingUsername: function () { try { return localStorage.getItem('vs.pendingUsername') || ''; } catch (e) { return ''; } },
    clearPendingUsername: function () { try { localStorage.removeItem('vs.pendingUsername'); } catch (e) {} },
  };
})();
