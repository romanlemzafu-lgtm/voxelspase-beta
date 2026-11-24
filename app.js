/* VoxelSpase v1.11 — real multi-user Supabase web client.
   Server-side row-level policies are required BEFORE publishing this build.
   Always keep secret keys out of browser code. */
(() => {
  'use strict';
  const root = document.getElementById('app');
  // ---- v1.0 helpers
  const soundOn = () => {
    try { return localStorage.getItem('voxel.sound') !== '0'; } catch { return true; }
  };
  let audioCtx = null;
  const SFX = {
    send: [[660, 0.09, 0], [990, 0.12, 0.06]],
    join: [[520, 0.12, 0], [780, 0.16, 0.1]],
    done: [[660, 0.1, 0], [880, 0.1, 0.08], [1320, 0.18, 0.16]],
  };
  function sfx(kind) {
    if (!soundOn() || !SFX[kind]) return;
    try {
      audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audioCtx.currentTime;
      for (const [f, d, delay] of SFX[kind]) {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + delay);
        g.gain.exponentialRampToValueAtTime(0.12, t0 + delay + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + d);
        o.connect(g).connect(audioCtx.destination);
        o.start(t0 + delay);
        o.stop(t0 + delay + d + 0.02);
      }
    } catch {}
  }
  function confetti() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = document.createElement('canvas');
    c.className = 'confetti';
    c.width = innerWidth;
    c.height = innerHeight;
    document.body.appendChild(c);
    const x = c.getContext('2d');
    const colors = ['#7c3aed', '#38bdf8', '#f472b6', '#facc15', '#34d399', '#ffffff'];
    const parts = Array.from({ length: 140 }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 120,
      y: innerHeight * 0.4,
      vx: (Math.random() - 0.5) * 14,
      vy: -Math.random() * 12 - 4,
      r: Math.random() * 6 + 3,
      rot: Math.random() * 6,
      vr: (Math.random() - 0.5) * 0.3,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    const start = performance.now();
    (function frame(now) {
      x.clearRect(0, 0, c.width, c.height);
      for (const p of parts) {
        p.vy += 0.35;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        x.save();
        x.translate(p.x, p.y);
        x.rotate(p.rot);
        x.fillStyle = p.c;
        x.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
        x.restore();
      }
      if (now - start < 2200) requestAnimationFrame(frame);
      else c.remove();
    })(start);
  }
  let pendingConfetti = false;
  document.addEventListener('submit', (e) => {
    if (e.target.matches?.('[data-keep-form="save"]')) {
      e.preventDefault();
      const sheet = ui.keepSheet;
      if (!sheet) return;
      const note = String(new FormData(e.target).get('note') || '').trim().slice(0, 200);
      const list = keepsAll().filter((k) => k.id !== sheet.id);
      if (sheet.mode === 'edit') {
        const current = keepFind(sheet.id);
        if (current) list.push({ ...current, note });
      } else {
        list.push({ id: sheet.id, kind: sheet.kind, src: sheet.src, server: sheet.server || '', note, at: new Date().toISOString() });
      }
      if (!keepsWrite(list)) {
        ui.keepSheet = null;
        keepSnack('Не получилось сохранить: память браузера недоступна.', sheet.id, false);
        return;
      }
      ui.keepSheet = null;
      if (sheet.mode === 'create') {
        ui.keepPulse = sheet.id;
        keepSnack('Сохранено в точки возврата', sheet.id, true);
        setTimeout(() => { ui.keepPulse = ''; render(); }, 1400);
      } else {
        keepSnack('Заметка обновлена', sheet.id, false);
      }
      render();
      return;
    }
    if (e.target.matches?.('[data-form="send"]')) sfx('send');
    if (e.target.matches?.('[data-vform="studio"]')) pendingConfetti = true;
  }, true);
  document.addEventListener('change', (e) => {
    const key = e.target.dataset?.localSetting;
    if (!key) return;
    try { localStorage.setItem('voxel.' + key, e.target.checked ? '1' : '0'); } catch {}
    render();
  });
  // Premium page: tilt on hover for benefit cards, mode switch for banner outline preview (no profile change)
  document.addEventListener('pointermove', (e) => {
    const card = e.target.closest?.('[data-tilt]');
    if (!card || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    card.style.setProperty('--rx', (-y * 8).toFixed(2) + 'deg');
    card.style.setProperty('--ry', (x * 8).toFixed(2) + 'deg');
  }, { passive: true });
  document.addEventListener('pointerout', (e) => {
    const card = e.target.closest?.('[data-tilt]');
    if (card && !card.contains(e.relatedTarget)) { card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg'); }
  }, { passive: true });
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-pr-mode]');
    if (!b) return;
    const mode = b.dataset.prMode;
    document.querySelectorAll('[data-pr-mode]').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
    document.querySelector('.pr-banner-sample')?.setAttribute('data-mode', mode);
  });
  // close the + menu when clicking anywhere else
  document.addEventListener('click', (e) => {
    if (!ui.plusMenu || e.target.closest?.('.plus-wrap')) return;
    ui.plusMenu = false;
    render();
  });
  // Premium theme preview: DOM-only, never saved to a profile
  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('[data-pr-preview]');
    if (!btn) return;
    const card = btn.closest('.pr-theme-card');
    const sample = card?.querySelector('.pr-sample');
    if (!sample) return;
    const on = !sample.classList.contains('is-applied');
    document.querySelectorAll('.pr-sample.is-applied').forEach((el) => el.classList.remove('is-applied'));
    if (on) sample.classList.add('is-applied');
    btn.textContent = on ? 'Показан' : 'Предпросмотр';
    btn.setAttribute('aria-pressed', String(on));
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      ui.palette = !ui.palette;
      render();
      requestAnimationFrame(() => document.querySelector('.pl-input')?.focus());
    } else if (e.key === 'Escape' && ui.palette) {
      ui.palette = false;
      render();
    } else if (e.key === 'Enter' && ui.palette && e.target.matches?.('.pl-input')) {
      document.querySelector('.pl-item:not([hidden])')?.click();
    }
  });
  let swipe = null;
  document.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    swipe = matchMedia('(max-width: 720px)').matches && t.clientX < 28 && document.querySelector('.shell[data-mobile="main"]')
      ? { x: t.clientX, y: t.clientY }
      : null;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!swipe) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - swipe.x;
    const dy = Math.abs(t.clientY - swipe.y);
    swipe = null;
    if (dx > 90 && dy < 60) act(ui.pane === 'settings' ? 'settings-back' : 'show-list', null);
  }, { passive: true });
  document.addEventListener('input', (e) => {
    const f = e.target.dataset?.customField;
    if (f) {
      saveCustom({ ...customPalette(), [f]: e.target.value });
      applyCustomVars();
      const panel = e.target.closest('.cust-panel');
      if (panel) panel.outerHTML = customPanel();
      document.querySelector(`[data-custom-field="${f}"]`)?.focus();
      return;
    }
    if (e.target.matches?.('[data-keep-form="save"] textarea')) {
      const counter = document.querySelector('[data-keep-count]');
      if (counter) counter.textContent = e.target.value.length + ' / ' + KEEP_NOTE_MAX;
    }
    if (e.target.matches?.('.keep-search')) keepFilterCards();
    if (e.target.classList?.contains('chat-search')) applyChatFilter();
    if (e.target.classList?.contains('pl-input')) filterPalette();
  });
  const $ = (s) => document.querySelector(s);
  const esc = (v) =>
    String(v ?? '').replace(
      /[&<>"']/g,
      (c) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[c],
    );
  const cut = (v, n = 100) =>
    String(v || '').length > n ? String(v).slice(0, n - 1) + '…' : String(v || '');
  const when = (t) =>
    new Date(t).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });
  const colorOf = (id) =>
    ['#7C3AED', '#4F71EA', '#A78BFA', '#38BDF8', '#4E9D8E'][String(id || '0').charCodeAt(0) % 5];
  const logo = '<img src="./assets/logo.svg" alt="VoxelSpase">';
  let client = null,
    user = null,
    me = null,
    bootBusy = false,
    listening = null,
    refreshTimer = null;
  let data = {
    profiles: [],
    servers: [],
    members: [],
    channels: [],
    friends: [],
    messages: [],
    dms: [],
    reactions: [],
  };
  let ui = {
    space: 'home',
    pane: matchMedia('(max-width: 720px)').matches ? 'list' : 'friends',
    serverId: null,
    channelId: null,
    dmId: null,
    friendTab: 'all',
    modal: null,
    settingsTab: 'profile',
    authMode: 'login',
    sidebarOpen: false,
    pendingInvite: new URLSearchParams(location.search).get('invite'),
    search: '',
    folder: 'all',
    settingsView: 'main',
    stickerTray: false,
    palette: false,
    plusMenu: false,
    capsuleOpen: false,
    keepFilter: 'all',
    keepSheet: null,
    keepSnack: null,
    keepPulse: '',
    messageToEdit: null,
  };
  let pendingJoinHandled = false;
  let keepLoaded = new Map(); // in memory only: message rows fetched for the page, never stored
  let keepBusy = false;
  let keepError = '';
  let previews = new Map();
  const PREMIUM = { price: 100, currency: '₽', discount: 100 };
  const THEMES = ['dark', 'night', 'light', 'sunset', 'custom', 'peach'];
  const CUSTOM_DEFAULT = { bg: '#0f172a', accent: '#7c3aed', accent2: '#38bdf8' };
  const VARS = ['--bg', '--side', '--surface', '--surface2', '--violet', '--lilac', '--blue', '--muted', '--line', '--cl-row-active', '--cl-row-hover'];
  const STICKERS = ['hello', 'cozy', 'play', 'sleep'];
  const selfId = () => user?.id;
  const prof = (id) => data.profiles.find((x) => x.id === id) || (id === user?.id ? me : null);
  const srv = (id) => data.servers.find((x) => x.id === id);
  const chan = (id) => data.channels.find((x) => x.id === id);
  function defaultChannel(serverId) {
    const channels = data.channels.filter((channel) => channel.server_id === serverId);
    return (channels.find((channel) => channel.name === 'общий') || channels[0])?.id || null;
  }
  const members = (sid) => data.members.filter((x) => x.server_id === sid);
  const member = (sid, uid = selfId()) =>
    data.members.find((x) => x.server_id === sid && x.user_id === uid);
  const isOwner = (sid) => member(sid)?.role === 'owner';
  const canManage = (sid) => ['owner', 'admin'].includes(member(sid)?.role);
  const canMod = (sid) => community.perm(sid, 'moderate');
  const myFriendIds = () =>
    data.friends
      .filter((x) => x.status === 'accepted')
      .map((x) => (x.requester_id === selfId() ? x.addressee_id : x.requester_id));
  const isFriend = (id) => myFriendIds().includes(id);
  const relationship = (id) =>
    data.friends.find((x) => [x.requester_id, x.addressee_id].includes(id));
  const roleLabel = (role) =>
    ({
      owner: 'Владелец',
      admin: 'Администратор',
      moderator: 'Модератор',
      member: 'Участник',
    })[role] || 'Участник';
  const hasSchemaError = (err) =>
    err &&
    (err.code === '42P01' ||
      err.code === 'PGRST205' ||
      /does not exist|schema cache|relation .* not found/i.test(err.message));
  function avatar(p, sz = 'md') {
    return community.avatar(p, sz);
  }
  function toast(msg) {
    const status = document.querySelector('#community-dialog[open] .v4-status');
    if (status) status.textContent = msg;
    let node = $('#toast');
    if (!node) return;
    node.textContent = msg;
    node.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => node.classList.remove('show'), 4000);
  }
  function niceError(err) {
    if (!err) return 'Неизвестная ошибка';
    if (hasSchemaError(err))
      return 'Проверь миграцию 04-identity-community.sql в Supabase и обнови страницу.';
    const message = String(err.message || err);
    if (/otp_expired|Auth session missing|expired.*link/i.test(message))
      return 'Ссылка восстановления истекла или сессия недоступна. Запроси новое письмо.';
    if (/invalid login credentials/i.test(message)) return 'Неверная почта или пароль.';
    if (/email not confirmed/i.test(message)) return 'Подтверди почту через письмо от Supabase.';
    if (/already registered/i.test(message)) return 'Такая почта уже зарегистрирована.';
    if (/duplicate key/i.test(message)) return 'Такое имя пользователя или запись уже существует.';
    if (/permission denied|row-level security/i.test(message))
      return 'Недостаточно прав. Проверь RLS и разрешения в Supabase.';
    if (/rate limit|email rate/i.test(message))
      return 'Лимит отправки писем Supabase. Попробуй позже.';
    return cut(message, 180);
  }
  function fail(err) {
    console.warn('[VoxelSpase]', err);
    toast(niceError(err));
  }
  function safeSend(fn) {
    Promise.resolve().then(fn).catch(fail);
  }
  function loading() {
    root.innerHTML = `<div class="loading-screen">${logo}<h1>VoxelSpase</h1><p>Подключаемся к Supabase…</p></div>`;
  }
  function renderError(message) {
    root.innerHTML = `<div class="error-screen"><div class="brand big">${logo}<div><h1>VoxelSpase</h1><p>by OneSpase</p></div></div><h2>Не удалось запустить приложение</h2><p>${esc(message)}</p><button class="btn primary" data-action="reload">Повторить</button></div>`;
  }
  function button(action, label, css = '', other = '') {
    return `<button type="button" class="btn ${css}" data-action="${action}" ${other}>${label}</button>`;
  }
  async function checked(query) {
    let res = await query;
    if (res.error) throw res.error;
    return res.data;
  }
  async function init() {
    try {
      if (!window.supabase?.createClient)
        throw new Error(
          'Не загрузилась библиотека Supabase. Проверь интернет или блокировщик скриптов и обнови страницу.',
        );
      const config = window.VOXEL_CONFIG;
      if (!config?.supabaseUrl || !config.publishableKey)
        throw new Error('Не заполнены настройки config.js');
      client = window.supabase.createClient(config.supabaseUrl, config.publishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
      // v1.2 entry flow (auth-flow.js): same Supabase calls, new screens
      window.VoxelAuth?.init({
        client,
        rerender: () => render(),
        uid: () => user?.id || '',
        enter: async (u) => {
          user = u;
          await loadEverything();
          await claimPendingUsername();
        },
        passwordChanged: async () => {
          ui.authMode = 'login';
          history.replaceState(null, '', location.pathname);
          await loadEverything();
          toast('Пароль сохранён');
        },
      });
      if (new URLSearchParams(location.search).get('recovery') === '1')
        ui.authMode = 'new-password';
      const { data: auth, error } = await client.auth.getSession();
      if (error) throw error;
      user = auth?.session?.user || null;
      if (user) await loadEverything();
      else render();
      client.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
          ui.authMode = 'new-password';
          setTimeout(render, 0);
          return;
        }
        if (event === 'SIGNED_OUT') {
          social.reset();
          community.reset();
          stopListening();
          void voice.leave().catch(() => {});
          coreVersion++;
          threadVersion++;
          ui.space = 'home';
          ui.pane = 'friends';
          ui.modal = null;
          ui.dmId = null;
          ui.serverId = null;
          ui.channelId = null;
          ui.sidebarOpen = false;
          ui.search = '';
          ui.friendTab = 'all';
          inbox = [];
          drafts.clear();
          user = null;
          me = null;
          data = {
            profiles: [],
            servers: [],
            members: [],
            channels: [],
            friends: [],
            messages: [],
            dms: [],
            reactions: [],
          };
          render();
          return;
        }
        if (session?.user && user?.id !== session.user.id) {
          user = session.user;
          setTimeout(() => loadEverything().catch(fail), 0);
        }
      });
    } catch (e) {
      renderError(niceError(e));
    }
  }
  let inbox = [],
    coreVersion = 0,
    threadVersion = 0,
    historyPages = 1,
    moreHistory = false;
  let renderedView = '',
    renderedForm = '',
    currentCoreTimer,
    currentThreadTimer;
  const pendingForms = new Set();
  const drafts = new Map(),
    sending = new Set();
  const threadKey = () =>
    [selfId(), ui.space, ui.pane, ui.space === 'server' ? ui.channelId : ui.dmId].join('/');
  const activeThread = () =>
    (ui.space === 'server' && ui.pane === 'chat' && ui.channelId) || (ui.pane === 'dm' && ui.dmId);
  const rpc = (name, args) => checked(client.rpc(name, args));
  const community = window.createVoxelCommunity({
    esc,
    rpc,
    checked,
    toast,
    fetchPages,
    prof,
    roleLabel,
    profileActions,
    act,
    redraw: render,
    server: navigateServer,
    thread: loadThread,
    refresh: refreshCore,
    state: () => ({ client, user, me, ui, data }),
  });
  const social = window.createVoxelSocial({
    esc,
    rpc,
    checked,
    toast,
    prof,
    fetchPages,
    redraw: render,
    server: navigateServer,
    refresh: refreshCore,
    state: () => ({ client, user, me, ui, data }),
  });
  const voice = window.createVoxelVoice({
    rpc,
    onChange: refreshVoiceControls,
    onError: fail,
  });

  async function fetchPages(table, fields, order) {
    const rows = [];
    for (let offset = 0; ; offset += 400) {
      let query = client.from(table).select(fields);
      for (const field of order) query = query.order(field);
      const batch = await checked(query.range(offset, offset + 399));
      rows.push(...batch);
      if (batch.length < 400) return rows;
    }
  }
  async function refreshCore(draw = true) {
    if (!user) return;
    const version = ++coreVersion,
      uid = selfId();
    const [servers, membersAll, channels, friends, alerts, prefs] = await Promise.all([
      fetchPages('voxel_servers', '*', ['created_at', 'id']),
      fetchPages('voxel_members', '*', ['server_id', 'user_id']),
      fetchPages('voxel_channels', '*', ['created_at', 'id']),
      fetchPages('voxel_friends', '*', ['created_at', 'id']),
      checked(
        client
          .from('voxel_inbox')
          .select('id,actor_id,dm_id,friend_id,seen,created_at')
          .eq('user_id', uid)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(60),
      ),
      rpc('voxel_my_preferences', {}),
    ]);
    const ids = [
      ...new Set([
        uid,
        ...membersAll.map((m) => m.user_id),
        ...friends.flatMap((f) => [f.requester_id, f.addressee_id]),
        ...alerts.map((a) => a.actor_id),
      ]),
    ];
    const applyCommunity = await community.core(ids);
    const profiles = [];
    for (let i = 0; i < ids.length; i += 70)
      profiles.push(
        ...(await checked(
          client
            .from('voxel_profiles')
            .select(
              'id,username,display_name,avatar,bio,status,created_at,accent,frame,skin,flair,user_status,badge_pins,avatar_file,banner_file,avatar_x,avatar_y,banner_x,banner_y,avatar_zoom,banner_zoom',
            )
            .in('id', ids.slice(i, i + 70)),
        )),
      );
    if (version !== coreVersion || uid !== selfId()) return;
    applyCommunity();
    Object.assign(data, {
      profiles,
      servers,
      members: membersAll,
      channels,
      friends,
    });
    me = profiles.find((p) => p.id === uid);
    if (!me) throw new Error('Профиль не найден. Проверь триггер voxel_signup_profile.');
    Object.assign(me, prefs);
    inbox = alerts;
    if ((ui.space === 'server' && !srv(ui.serverId)) || (ui.pane === 'dm' && !isFriend(ui.dmId))) {
      ui.space = 'home';
      ui.pane = 'friends';
      ui.modal = null;
      data.dms = [];
      data.messages = [];
    }
    if (ui.space === 'server' && !chan(ui.channelId)) {
      if (['edit-message', 'edit-channel'].includes(ui.modal)) ui.modal = null;
      ui.channelId = defaultChannel(ui.serverId);
      data.messages = [];
      data.reactions = [];
      historyPages = 1;
      if (draw && activeThread()) safeSend(loadThread);
    }
    await loadPreviews().catch(() => {});
    if (draw) render();
  }
  async function loadPreviews() {
    if (!user) return;
    const uid = selfId();
    const [ch, dm] = await Promise.all([
      client
        .from('voxel_messages')
        .select('channel_id,sender_id,body,created_at')
        .order('created_at', { ascending: false })
        .limit(300),
      client
        .from('voxel_dm_messages')
        .select('sender_id,recipient_id,body,created_at')
        .order('created_at', { ascending: false })
        .limit(300),
    ]);
    const next = new Map();
    for (const m of ch.data || []) {
      const k = 'c:' + m.channel_id;
      if (!next.has(k)) next.set(k, m);
    }
    for (const m of dm.data || []) {
      const other = m.sender_id === uid ? m.recipient_id : m.sender_id;
      const k = 'd:' + other;
      if (!next.has(k)) next.set(k, m);
    }
    previews = next;
  }
  function previewText(m, dm) {
    if (!m) return '';
    const own = m.sender_id === selfId();
    const body = String(m.body || '');
    const text = /^\[kotost:/.test(body) ? 'Стикер' : cut(body, 60);
    const who = own ? 'Ты: ' : dm ? '' : (prof(m.sender_id)?.display_name || 'Участник') + ': ';
    return who + text;
  }
  // Username chosen at sign-up is kept in the browser until the server accepts it.
  // Runs on every loaded session, so the e-mail link path is covered too.
  let usernameNoticeShown = false;
  async function claimPendingUsername() {
    const pending = window.VoxelAuth?.pendingUsername();
    if (!pending || !user || !window.VoxelAuth) return;
    const { error } = await client.rpc('voxel_claim_username', { p_username: pending });
    if (!error) {
      window.VoxelAuth.clearPendingUsername();
      toast('Твой @' + pending + ' сохранён');
      return;
    }
    if (String(error.message || '').includes('username taken')) {
      window.VoxelAuth.clearPendingUsername();
      toast('@' + pending + ' уже занят. Выбери другой в профиле.');
      return;
    }
    if (!usernameNoticeShown) {
      usernameNoticeShown = true;
      toast('Не удалось сохранить @' + pending + '. Попробуем снова при следующем входе.');
    }
  }
  async function loadEverything() {
    if (bootBusy) return;
    bootBusy = true;
    loading();
    try {
      await refreshCore(false);
      await claimPendingUsername().catch(() => {});
      if (!user) return;
      await loadThread(false);
      if (ui.pendingInvite && !pendingJoinHandled) {
        pendingJoinHandled = true;
        ui.modal = 'join-server';
      }
      render();
      startListening();
    } catch (e) {
      renderError(niceError(e));
    } finally {
      bootBusy = false;
    }
  }
  async function loadThread(doRender = true, older = false) {
    const key = threadKey(),
      ticket = ++threadVersion;
    if (!activeThread() || !user) return;
    const dm = ui.space === 'home',
      uid = selfId(),
      other = ui.dmId;
    const count = historyPages + (older ? 1 : 0);
    let rows = [],
      batch = [];
    for (let page = 0; page < count; page++) {
      let q = client.from(dm ? 'voxel_dm_messages' : 'voxel_messages').select('*');
      q = dm
        ? q.or(
            `and(sender_id.eq.${uid},recipient_id.eq.${other}),and(sender_id.eq.${other},recipient_id.eq.${uid})`,
          )
        : q.eq('channel_id', ui.channelId);
      const cursor = rows.at(-1);
      if (cursor)
        q = q.or(
          `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`,
        );
      batch = await checked(
        q.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(60),
      );
      if (ticket !== threadVersion || key !== threadKey()) return;
      rows.push(...batch);
      if (batch.length < 60) break;
    }
    const applyThread = await community.thread(rows);
    const reactions = [];
    if (!dm)
      for (let i = 0; i < rows.length; i += 60)
        reactions.push(
          ...(await checked(
            client
              .from('voxel_reactions')
              .select('*')
              .in(
                'message_id',
                rows.slice(i, i + 60).map((m) => m.id),
              ),
          )),
        );
    const missing = [...new Set(rows.map((m) => m.sender_id).filter((id) => !prof(id)))];
    const extra = [];
    for (let i = 0; i < missing.length; i += 70)
      extra.push(
        ...(await checked(
          client
            .from('voxel_profiles')
            .select(
              'id,username,display_name,avatar,bio,status,created_at,accent,frame,skin,flair,user_status,badge_pins,avatar_file,banner_file,avatar_x,avatar_y,banner_x,banner_y,avatar_zoom,banner_zoom',
            )
            .in('id', missing.slice(i, i + 70)),
        )),
      );
    if (ticket !== threadVersion || key !== threadKey()) return;
    const scroll = $('.chat-scroll'),
      oldHeight = scroll?.scrollHeight || 0;
    const atEnd = !scroll || scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop < 65;
    applyThread();
    community.mark(community.scope(), rows[0]?.created_at);
    data.profiles.push(...extra.filter((p) => !prof(p.id)));
    data[dm ? 'dms' : 'messages'] = rows.reverse();
    data.reactions = reactions;
    historyPages = count;
    moreHistory = batch.length === 60;
    if (doRender) {
      render();
      const next = $('.chat-scroll');
      if (next) {
        if (older) next.scrollTop += next.scrollHeight - oldHeight;
        else if (atEnd) next.scrollTop = next.scrollHeight;
      }
    }
  }
  function stopListening() {
    if (listening && client) client.removeChannel(listening);
    listening = null;
    clearInterval(refreshTimer);
    clearTimeout(currentThreadTimer);
    clearTimeout(currentCoreTimer);
  }
  function startListening() {
    stopListening();
    if (!user) return;
    function threadSoon() {
      clearTimeout(currentThreadTimer);
      currentThreadTimer = setTimeout(() => safeSend(loadThread), 140);
    }
    function coreSoon() {
      clearTimeout(currentCoreTimer);
      currentCoreTimer = setTimeout(() => safeSend(refreshCore), 140);
    }
    listening = client.channel('voxel-' + selfId() + '-' + csfrand());
    for (const table of ['voxel_messages', 'voxel_dm_messages', 'voxel_reactions', 'vs_votes']) {
      listening.on('postgres_changes', { event: '*', schema: 'public', table }, threadSoon);
    }
    for (const table of ['voxel_inbox', 'voxel_friends', 'vs_mentions']) {
      listening.on('postgres_changes', { event: '*', schema: 'public', table }, coreSoon);
    }
    listening.subscribe();
    refreshTimer = setInterval(() => {
      if (document.visibilityState === 'visible')
        safeSend(async () => {
          await refreshCore();
          await loadThread();
        });
    }, 30000);
  }
  function csfrand() {
    return Math.random().toString(36).slice(2, 10);
  }
  function scrollChat() {
    requestAnimationFrame(() => {
      const el = $('.chat-scroll');
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
  function render() {
    if (!user || ui.authMode === 'new-password') {
      renderedView = '';
      renderedForm = '';
      root.innerHTML = window.VoxelAuth ? VoxelAuth.render(ui.authMode) : renderAuth();
      return;
    }
    if (window.VoxelAuth && VoxelAuth.onboardingPending(user.id)) {
      renderedView = '';
      renderedForm = '';
      root.innerHTML = VoxelAuth.renderOnboarding(user.id);
      return;
    }
    const view = threadKey(),
      formKey = [view, ui.modal, ui.settingsTab, ui.messageToEdit, ui.profileId].join('/');
    const oldScroll = $('.chat-scroll')?.scrollTop || 0,
      oldSide = $('.side-scroll')?.scrollTop || 0;
    const oldContent = $('.content-scroll')?.scrollTop || 0,
      oldModal = $('.modal')?.scrollTop || 0;
    const players = view === renderedView ? [...root.querySelectorAll('audio[data-private]')] : [];
    const focused = root.contains(document.activeElement) ? document.activeElement : null;
    const sameForm = formKey === renderedForm && ui.modal;
    const textValues = sameForm
      ? [
          ...document.querySelectorAll(
            '.modal input[name]:not([type=checkbox]),.modal textarea[name],.modal select[name]',
          ),
        ].map((el) => [el.name, el.value])
      : [];
    const focusName = focused?.name,
      caret =
        typeof focused?.selectionStart === 'number'
          ? [focused.selectionStart, focused.selectionEnd]
          : null;
    const key = focused?.dataset.action,
      id = focused?.dataset.id;
    root.innerHTML = `<div class="shell" data-mobile="${ui.pane === 'list' ? 'list' : 'main'}" data-pane="${ui.pane}"><div class="shade ${ui.sidebarOpen ? 'on' : ''}" data-action="close-sidebar"></div>
  ${renderRail()}${renderSidebar()}<main class="main">${renderHeader()}${renderMain()}</main>
  ${ui.modal ? renderModal() : ''}
  ${renderTabbar()}
  ${renderMiniVoice()}
  ${ui.palette ? renderPalette() : ''}
  ${ui.keepSheet ? renderKeepSheet() : ''}
  ${renderKeepSnack()}</div>`;
    applyChatFilter();
    if (ui.pane === 'keeps') { loadKeeps(); keepFilterCards(); }
    const inlineHost = document.getElementById('st-host');
    if (inlineHost) community.inlineSync(inlineHost, ui.settingsView, selfId());
    else community.inlineLeave();
    document.body.classList.toggle('compact', Boolean(me?.compact));
    applyTheme();
    const field = $('#compose-text');
    if (field) {
      field.value = drafts.get(view) || '';
      field.closest('form').querySelector('button').disabled = sending.has(view);
    }
    for (const [name, value] of textValues) {
      const el = document.querySelector(`.modal [name="${CSS.escape(name)}"]`);
      if (el) el.value = value;
    }
    if (view === renderedView) {
      if ($('.chat-scroll')) $('.chat-scroll').scrollTop = oldScroll;
      if ($('.content-scroll')) $('.content-scroll').scrollTop = oldContent;
    }
    if ($('.side-scroll')) $('.side-scroll').scrollTop = oldSide;
    if (sameForm && $('.modal')) $('.modal').scrollTop = oldModal;
    if (formKey === renderedForm) {
      const selector = focusName
        ? `[name="${CSS.escape(focusName)}"]`
        : key
          ? `[data-action="${CSS.escape(key)}"]${id ? `[data-id="${CSS.escape(id)}"]` : ''}`
          : null;
      const next = selector && $(selector);
      if (next) {
        next.focus({ preventScroll: true });
        if (caret && next.setSelectionRange)
          try {
            next.setSelectionRange(...caret);
          } catch {}
      }
    } else if (ui.modal) {
      ($('.modal input:not([type=checkbox])') || $('.modal [data-action=close-modal]'))?.focus({
        preventScroll: true,
      });
    }
    for (const a of players) {
      const next = root.querySelector(
        'audio[data-private="' + CSS.escape(a.dataset.private) + '"]',
      );
      if (next) next.replaceWith(a);
    }
    community.hydrate();
    voice.bindVideos?.();
    document.body.classList.toggle('reduce-motion', !!me?.motion_off);
    renderedView = view;
    renderedForm = formKey;
    filterPeople();
  }
  function renderAuth() {
    if (ui.authMode === 'reset' || ui.authMode === 'new-password') {
      const change = ui.authMode === 'new-password';
      return `<main class="entry recovery-entry"><section class="entry-form"><h1>${change ? 'Новый пароль' : 'Восстановить доступ'}</h1><p>${change ? 'Задай новый пароль для своего аккаунта.' : 'Пришлём ссылку, если аккаунт с такой почтой существует.'}</p><form data-form="${change ? 'password-update' : 'password-reset'}" class="form-fields"><label>${change ? 'Пароль' : 'Почта'}<input name="${change ? 'password' : 'email'}" type="${change ? 'password' : 'email'}" ${change ? 'minlength="10" autocomplete="new-password"' : 'autocomplete="email"'} required></label><button type="submit" class="btn primary">${change ? 'Сохранить пароль' : 'Отправить ссылку'}</button></form><button class="btn" data-action="auth-login">Вернуться ко входу</button></section></main>`;
    }
    const signup = ui.authMode === 'signup';
    return `<main class="entry"><header class="brandbar"><span class="wordmark">${logo}VoxelSpase</span><span class="byline">by OneSpase</span></header>
 <div class="entry-grid"><section class="world"><div class="world-title"><span class="overline">СООБЩЕСТВА ONESPASE</span><h1>Серверы<br>и друзья<span>.</span></h1></div>
 <div class="orbit orbit-a"></div><div class="orbit orbit-b"></div><img class="island" src="./assets/island.webp" alt="Парящий воксельный остров с мостом и обсерваторией">
 <div class="world-foot"><i></i> Голосовые комнаты до 4 участников</div></section>
 <section class="entry-form"><div class="form-head"><span class="mini-cube">${logo}</span><h2>${signup ? 'Создай аккаунт' : 'С возвращением'}</h2><p>${signup ? 'Выбери имя для общения с друзьями.' : 'Войди, чтобы вернуться к своим друзьям.'}</p></div>
 <div class="auth-tabs"><button data-action="auth-login" class="${!signup ? 'selected' : ''}">Вход</button><button data-action="auth-signup" class="${signup ? 'selected' : ''}">Регистрация</button></div>
 <form data-form="auth" class="form-fields">
 ${signup ? '<label>Отображаемое имя<input name="displayName" autocomplete="nickname" maxlength="50" placeholder="Твоё имя" required></label>' : ''}
 <label>Почта<input name="email" type="email" autocomplete="email" placeholder="you@example.com" required></label>
 <label>Пароль<input name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="6" placeholder="${signup ? 'От 6 символов' : 'Твой пароль'}" required></label>
 <button type="submit" class="btn primary full">${signup ? 'Создать аккаунт' : 'Войти'} <span aria-hidden="true">→</span></button></form>
 ${!signup ? '<button type="button" class="btn" data-action="password-reset">Забыли пароль?</button>' : ''}${signup ? '<p class="auth-note">Подтверди адрес по ссылке из письма.</p>' : ''}</section></div>
 <footer class="entry-footer"><span>VoxelSpase</span><span>Версия 1.11</span></footer></main>`;
  }

  
  function renderRail() {
    return '';
  }
// ---- custom theme: three colours -> full palette (CSS variables on <html>, device-level)
function hexToRgb(h) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h || ''));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
function lum(hex) {
  const c = hexToRgb(hex).map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
function customKey() { return 'voxel.custom.v1.' + (selfId() || 'anon'); }
function customPalette() {
  let c = CUSTOM_DEFAULT;
  try { c = { ...CUSTOM_DEFAULT, ...JSON.parse(localStorage.getItem(customKey()) || '{}') }; } catch {}
  if (!hexToRgb(c.bg) || !hexToRgb(c.accent) || !hexToRgb(c.accent2)) c = CUSTOM_DEFAULT;
  return c;
}
function saveCustom(next) {
  try { localStorage.setItem(customKey(), JSON.stringify(next)); } catch {}
}
function applyCustomVars() {
  const root = document.documentElement;
  const c = customPalette();
  const text = '#f5f3ff';
  const dark = lum(c.bg) < 0.4;
  const side = dark ? mixHex(c.bg, '#000000', 0.25) : mixHex(c.bg, '#ffffff', 0.5);
  const surface = dark ? mixHex(c.bg, '#ffffff', 0.08) : mixHex(c.bg, '#ffffff', 0.7);
  const surface2 = dark ? mixHex(c.bg, '#ffffff', 0.14) : mixHex(c.bg, '#000000', 0.06);
  const line = mixHex(c.bg, '#ffffff', dark ? 0.22 : 0.3);
  const set = {
    '--bg': c.bg, '--side': side, '--surface': surface, '--surface2': surface2,
    '--violet': c.accent, '--lilac': c.accent2, '--blue': c.accent2,
    '--muted': mixHex(c.bg, text, 0.7), '--line': line,
    '--cl-row-active': mixHex(c.bg, c.accent, 0.45), '--cl-row-hover': mixHex(c.bg, c.accent, 0.2),
  };
  Object.entries(set).forEach(([k, v]) => root.style.setProperty(k, v));
  root.dataset.theme = dark ? 'dark' : 'light';
  delete root.dataset.skin;
  return { c, text, dark };
}
function clearCustomVars() {
  VARS.forEach((k) => document.documentElement.style.removeProperty(k));
}
function customPanel() {
  const c = customPalette();
  const ratio = contrast(c.bg, '#f5f3ff');
  const warn = ratio < 4.5
    ? '<p class="cust-warn" role="status">Текст может быть плохо виден на этом фоне. Выбери фон темнее или светлее.</p>'
    : '<p class="cust-hint">Контраст текста: ' + ratio.toFixed(1) + ':1</p>';
  const field = (k, label, v) => `<label class="cust-field"><span>${label}</span><input type="color" value="${v}" data-custom-field="${k}" aria-label="${label}"></label>`;
  return `<div class="st-group-title">Своя тема</div>
    <div class="cust-panel">
      ${field('bg', 'Фон', c.bg)}${field('accent', 'Акцент', c.accent)}${field('accent2', 'Подсветка', c.accent2)}
      ${warn}
      <div class="cust-actions"><button type="button" class="btn ghost sm" data-action="custom-reset">Сбросить</button></div>
    </div>`;
}
function localTheme() {
    let v = null;
    try { v = localStorage.getItem('voxel.theme'); } catch {}
    if (THEMES.includes(v)) return v;
    return me?.theme === 'night' ? 'night' : 'dark';
  }
  function themeName() {
    const t = localTheme();
    return t === 'light' ? 'Светлая тема' : t === 'night' ? 'Ночная тема' : t === 'sunset' ? 'Закат' : t === 'peach' ? 'Персик' : 'Тёмная тема';
  }
  function applyTheme() {
    const t = localTheme();
    document.documentElement.dataset.theme = t === 'light' || t === 'peach' ? 'light' : 'dark';
    // sunset is a skin on top of the dark base, so every existing screen keeps working
    if (t === 'sunset') document.documentElement.dataset.skin = 'sunset';
    else if (t === 'peach') document.documentElement.dataset.skin = 'peach';
    else delete document.documentElement.dataset.skin;
    if (t === 'custom') applyCustomVars();
    else clearCustomVars();
    document.body.classList.toggle('night', t === 'night');
  }
  function setTheme(t) {
    try { localStorage.setItem('voxel.theme', t); } catch {}
    applyTheme();
    render();
  }
  // Premium is not granted anywhere yet: no server rights exist, so the device never claims it.
  function premiumOn() { return false; }
  function setPremium(on) {
    try { localStorage.setItem('voxel.premium', on ? '1' : '0'); } catch {}
    render();
  }
  function priceNow() {
    return Math.round(PREMIUM.price * (100 - PREMIUM.discount) / 100);
  }
  function stickerTray() {
    return `<div class="sticker-tray" role="group" aria-label="Стикеры">${STICKERS
      .map((n) => `<button type="button" class="sticker-pick" data-action="send-sticker" data-id="${n}" aria-label="Стикер ${n}"><img src="./assets/stickers/${n}.svg" alt=""></button>`)
      .join('')}</div>`;
  }
  function tabBadge() {
    const n = community.unreadTotal?.() || 0;
    return n ? `<b class="tab-badge">${n > 99 ? '99+' : n}</b>` : '';
  }
function stIcon(name) {
    const d = {
      user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
      palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.9 2-2 0-.6-.3-1.1-.6-1.5-.3-.4-.5-.8-.5-1.3 0-1 .8-1.7 1.8-1.7H16a5 5 0 0 0 5-5c0-4.4-4-7.5-9-7.5Z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="15" cy="7.5" r="1"/>',
      bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 20a2 2 0 0 0 4 0"/>',
      lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
      moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
      layers: '<path d="M4 7h16M4 12h16M4 17h10"/>',
      trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/>',
      sparkle: '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2Z"/>',
      info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
      logout: '<path d="M15 17l5-5-5-5M20 12H9M12 4H5v16h7"/>',
      chevron: '<path d="m9 6 6 6-6 6"/>',
    }[name] || '';
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  }
  function stRow({ icon, tone = '', title, sub = '', attrs = '', tag = 'button', right = null }) {
    const inner = `<span class="st-ico ${tone}">${stIcon(icon)}</span><span class="st-txt"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span>${right ?? `<span class="st-chev">${stIcon('chevron')}</span>`}`;
    return tag === 'label'
      ? `<label class="st-row ${tone === 'danger' ? 'is-danger' : ''}" ${attrs}>${inner}</label>`
      : `<button type="button" class="st-row ${tone === 'danger' ? 'is-danger' : ''}" ${attrs}>${inner}</button>`;
  }
  function stSwitch(key, on) {
    return `<input class="st-check" type="checkbox" data-setting="${key}" ${on ? 'checked' : ''} aria-label="${key}" /><i class="st-switch" aria-hidden="true"></i>`;
  }
  function stPage(title, body, back = true) {
    return `<section class="content-scroll st">
  ${back ? `<div class="st-head"><button type="button" class="st-back" data-action="settings-back" aria-label="Назад">←</button><h2>${esc(title)}</h2></div>` : ''}
  ${body}
</section>`;
  }
  function stProfileForm() {
    return `<div class="st-group st-group-form"><form class="st-form" data-form="profile">
      <label class="st-field"><span>Отображаемое имя</span><input name="display_name" value="${esc(me?.display_name)}" maxlength="50" required></label>
      <label class="st-field"><span>Имя пользователя (@username)</span><input name="username" value="${esc(me?.username)}" maxlength="20" pattern="[A-Za-z0-9_.]{3,20}" required></label>
      <label class="st-field"><span>Аватар-эмодзи</span><input name="avatar" value="${esc(me?.avatar)}" maxlength="12"></label>
      <label class="st-field"><span>О себе</span><textarea name="bio" rows="3" maxlength="350">${esc(me?.bio)}</textarea></label>
      <label class="st-field"><span>Статус</span><select name="status">
        <option value="online" ${me?.status === 'online' ? 'selected' : ''}>В сети</option>
        <option value="idle" ${me?.status === 'idle' ? 'selected' : ''}>Неактивен</option>
        <option value="offline" ${me?.status === 'offline' ? 'selected' : ''}>Не показывать статус</option>
      </select></label>
      <button class="st-save" type="submit">Сохранить профиль</button>
    </form></div>`;
  }
  community.setInlineClose?.(() => {
    if (pendingConfetti) {
      pendingConfetti = false;
      sfx('done');
      confetti();
    }
    if (ui.settingsView === 'studio' || ui.settingsView === 'collection') {
      ui.settingsView = ui.settingsView === 'studio' ? 'profile' : 'main';
      render();
    }
  });
  function renderSettingsPage() {
    const view = ui.settingsView || 'main';
    if (view === 'studio') {
      return stPage('Студия профиля', '<div class="st-inline" id="st-host"></div>');
    }
    if (view === 'collection') {
      return stPage('Достижения', '<div class="st-inline" id="st-host"></div>');
    }
    if (view === 'profile') {
      return stPage(
        'Мой профиль',
        `<div class="st-group">
          ${stRow({ icon: 'sparkle', tone: 'violet', title: 'Студия профиля', sub: 'Аватар, баннер, рамка и оформление', attrs: 'data-action="settings-view" data-id="studio"' })}
          ${stRow({ icon: 'trophy', tone: 'amber', title: 'Достижения', sub: 'Значки и награды', attrs: 'data-action="settings-view" data-id="collection"' })}
        </div>${stProfileForm()}`,
      );
    }
    if (view === 'appearance') {
      const t = localTheme();
      const opt = (id, label) =>
        `<button type="button" class="th-opt ${t === id ? 'on' : ''}" data-action="set-theme" data-id="${id}" aria-pressed="${t === id}"><span class="th-swatch th-${id}"></span><span>${label}</span></button>`;
      return stPage(
        'Оформление',
        `<div class="st-group-title">Тема</div>
        <div class="th-grid">${opt('dark', 'Тёмная')}${opt('night', 'Ночная')}${opt('light', 'Светлая')}${opt('sunset', 'Закат')}${opt('peach', 'Персик')}${opt('custom', 'Своя')}</div>${t === 'custom' ? customPanel() : ''}
        <div class="st-group-title">Сообщения</div>
        <div class="st-group">
          <label class="st-row">${`<span class="st-ico green">${stIcon('layers')}</span><span class="st-txt"><b>Компактные сообщения</b><small>Меньше отступов в ленте</small></span>`}${stSwitch('compact', Boolean(me?.compact))}</label>
        </div>
        <div class="st-preview" aria-label="Пример">
          <div class="st-bubble them">Привет! Смотрел новый интерфейс?</div>
          <div class="st-bubble me">Да, теперь есть светлая тема 👀</div>
        </div>`,
      );
    }
    if (view === 'premium') {
      const on = premiumOn();
      return stPage(
        'VoxelSpase Premium',
        `<div class="pr-card">
          <span class="pr-kicker">Старт мессенджера</span>
          <h3>Premium</h3>
          <p class="pr-text">Статус Premium появляется в профиле. Пока без платных функций: подписка бесплатная, оплата подключится позже.</p>
          <div class="pr-price"><s>${PREMIUM.price} ${PREMIUM.currency}</s><b>${priceNow()} ${PREMIUM.currency}</b><span class="pr-off">−${PREMIUM.discount}%</span></div>
          <p class="pr-note">Скидка 100% действует на старте мессенджера.</p>
          <p class="pr-lock" role="note">Premium пока недоступен: серверная часть не подключена. Никаких статусов на устройстве не выдаём.</p>
        </div>`,
      );
    }
    if (view === 'about') {
      return stPage(
        'О VoxelSpase',
        `<div class="st-about-card">
          <img src="./assets/logo.svg" alt="" width="64" height="64">
          <h3>VoxelSpase</h3>
          <p>Версия 1.11</p>
          <p>Разработано OneSpase</p>
          <p>Написано при участии Claude (Anthropic)</p>
          <img class="st-os" src="./assets/onespase-bw.png" alt="OneSpase" width="34" height="34">
        </div>`,
      );
    }
    if (view === 'privacy') {
      return stPage(
        'Приватность',
        `<div class="st-group">
          <label class="st-row">${`<span class="st-ico violet">${stIcon('bell')}</span><span class="st-txt"><b>Уведомления в приложении</b><small>Заявки и личные сообщения в колокольчике</small></span>`}${stSwitch('notifications', Boolean(me?.notifications))}</label>
        </div>
        <div class="st-group-title">Звуки</div>
        <div class="st-group">
          <label class="st-row">${`<span class="st-ico amber">${stIcon('bell')}</span><span class="st-txt"><b>Звуки интерфейса</b><small>Отправка сообщения и вход в голосовую комнату</small></span>`}<input class="st-check" type="checkbox" data-local-setting="sound" ${soundOn() ? 'checked' : ''} aria-label="Звуки интерфейса" /><i class="st-switch" aria-hidden="true"></i></label>
        </div>
        <div class="st-note">${stIcon('info')}<p>Личные сообщения доступны только друзьям. Доступ к серверам и каналам проверяется на уровне базы данных.</p></div>`,
      );
    }
    const staff = community.staff?.();
    return `<section class="content-scroll st">
  <button type="button" class="st-profile" data-action="settings-view" data-id="profile" aria-label="Открыть профиль">
    ${avatar(me, 'lg')}
    <span class="st-who"><b>${esc(me?.display_name || 'Без имени')}</b><span>@${esc(me?.username || 'username')}</span>${me?.bio ? `<small>${esc(cut(me.bio, 90))}</small>` : ''}</span>
    <span class="st-chev">${stIcon('chevron')}</span>
  </button>

  <div class="st-group-title">Аккаунт</div>
  <div class="st-group">
    ${stRow({ icon: 'user', tone: 'violet', title: 'Мой профиль', sub: 'Имя, аватар, баннер, рамка и статус', attrs: 'data-action="settings-view" data-id="profile"' })}
    ${stRow({ icon: 'trophy', tone: 'amber', title: 'Достижения', sub: 'Значки и награды', attrs: 'data-action="settings-view" data-id="collection"' })}
    ${staff ? stRow({ icon: 'sparkle', tone: 'green', title: 'Выдать награду', sub: 'Для модераторов', attrs: 'data-v4="admin"' }) : ''}
  </div>

  <div class="st-group-title">Подписка</div>
  <div class="st-group">
    ${stRow({ icon: 'sparkle', tone: 'amber', title: 'VoxelSpase Premium', sub: 'Скоро: серверные права ещё не подключены', attrs: 'data-action="settings-view" data-id="premium"' })}
  </div>

  <div class="st-group-title">Приложение</div>
  <div class="st-group">
    ${stRow({ icon: 'palette', tone: 'blue', title: 'Оформление', sub: themeName(), attrs: 'data-action="settings-view" data-id="appearance"' })}
    ${stRow({ icon: 'lock', tone: 'green', title: 'Приватность и уведомления', sub: me?.notifications ? 'Уведомления включены' : 'Уведомления выключены', attrs: 'data-action="settings-view" data-id="privacy"' })}
    ${stRow({ icon: 'info', tone: 'violet', title: 'О VoxelSpase', sub: 'Версия и авторы', attrs: 'data-action="settings-view" data-id="about"' })}
  </div>

  <div class="st-group-title">Сессия</div>
  <div class="st-group">
    ${stRow({ icon: 'logout', tone: 'danger', title: 'Выйти из аккаунта', attrs: 'data-action="logout"', right: '' })}
  </div>

  <p class="st-about">VoxelSpase · OneSpase · v1.11</p>
</section>`;
  }
  function renderPalette() {
    const items = [];
    for (const id of myFriendIds()) {
      items.push({ action: 'open-dm', id, name: prof(id)?.display_name || 'Участник', hint: 'Личный чат' });
    }
    for (const s of data.servers) {
      for (const c of data.channels.filter((c) => c.server_id === s.id)) {
        items.push({ action: 'open-chan', id: c.id, server: s.id, name: '# ' + c.name, hint: s.name });
      }
    }
    for (const v of [['studio', 'Студия профиля'], ['collection', 'Достижения'], ['premium', 'VoxelSpase Premium'], ['appearance', 'Оформление'], ['privacy', 'Приватность и уведомления'], ['about', 'О VoxelSpase']]) {
      items.push({ action: 'settings-view', id: v[0], name: v[1], hint: 'Настройки' });
    }
    items.push({ action: 'settings', name: 'Настройки', hint: 'Раздел' });
    items.push({ action: 'friends', name: 'Контакты', hint: 'Друзья' });
    items.push({ action: 'new-server', name: 'Создать сервер', hint: 'Действие' });
    items.push({ action: 'join-server', name: 'Вступить по приглашению', hint: 'Действие' });
    return `<div class="pl-backdrop" data-action="palette-close" aria-hidden="true"></div>
<div class="pl" role="dialog" aria-label="Быстрый переход">
  <input class="pl-input" placeholder="Куда перейти? Чат, канал, раздел…" autocomplete="off" aria-label="Поиск по переходам" />
  <div class="pl-list">${items
    .map(
      (it) => `<button type="button" class="pl-item" data-action="${it.action}" data-id="${esc(it.id || '')}" ${it.server ? `data-server="${esc(it.server)}"` : ''} data-name="${esc(it.name.toLowerCase())}"><span class="pl-name">${esc(it.name)}</span><span class="pl-hint">${esc(it.hint)}</span></button>`,
    )
    .join('')}</div>
  <p class="pl-foot">Enter — открыть · Esc — закрыть</p>
</div>`;
  }
  function filterPalette() {
    const q = ($('.pl-input')?.value || '').trim().toLowerCase();
    document.querySelectorAll('.pl-item').forEach((el) => {
      el.hidden = Boolean(q) && !el.dataset.name.includes(q);
    });
  }
  function renderMiniVoice() {
    const call = voice.call;
    if (!call || ui.pane === 'voice') return '';
    const sv = srv(call.server);
    const open = ui.capsuleOpen;
    const label = sv?.name || 'сервер';
    const initial = (sv?.icon || label.charAt(0) || 'V').slice(0, 2);
    return `<div class="capsule ${open ? 'is-open' : ''}" role="status" aria-label="Голосовая комната: ${esc(label)}">
  <button type="button" class="cap-main" data-action="srv-tool" data-server="${esc(call.server)}" data-id="voice-view" aria-label="Открыть голосовую комнату">
    <span class="cap-av" aria-hidden="true">${esc(initial)}</span>
    <span class="cap-text"><b>${esc(label)}</b><small>${call.muted ? 'Микрофон выключен' : 'В голосе'}${call.people?.length ? ' · ' + call.people.length + ' в комнате' : ''}</small></span>
  </button>
  <span class="cap-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
  <button type="button" class="cap-btn ${call.muted ? 'off' : ''}" data-action="voice-mute" aria-label="${call.muted ? 'Включить микрофон' : 'Выключить микрофон'}" aria-pressed="${!call.muted}">${call.muted ? '🔇' : '🎙'}</button>
  <button type="button" class="cap-btn danger" data-action="voice-leave" aria-label="Выйти из голосовой комнаты">⏻</button>
  <button type="button" class="cap-btn cap-more" data-action="capsule-toggle" aria-expanded="${open}" aria-label="${open ? 'Свернуть' : 'Развернуть'}">${open ? '‹' : '›'}</button>
  ${open ? `<p class="cap-note">Подключено · ${esc(label)}. Уровни звука здесь не анализируются, волны только декоративные.</p>` : ''}
</div>`;
  }

  // ================= Round 3: Точки возврата =================
  // Stored per account on this device: message id, source type, source id, time, note (<= 200).
  // Message text is never stored; it is read from Supabase under the normal RLS rules.
  const KEEP_NOTE_MAX = 200;
  function keepKey() { return 'vs.keeps.v1.' + selfId(); }
  function keepsAll() {
    try {
      const list = JSON.parse(localStorage.getItem(keepKey()) || '[]');
      return Array.isArray(list) ? list.filter((k) => k && typeof k.id === 'string') : [];
    } catch (e) { return []; }
  }
  function keepsWrite(list) {
    try { localStorage.setItem(keepKey(), JSON.stringify(list)); return true; }
    catch (e) { return false; }
  }
  function keepFind(id) { return keepsAll().find((k) => k.id === id) || null; }
  function keepButton(m, dm) {
    if (!m.body || !selfId()) return '';
    const saved = keepFind(m.id);
    const pulse = ui.keepPulse === m.id ? ' pulse' : '';
    return `<button type="button" class="keep-btn${saved ? ' is-saved' : ''}${pulse}" data-action="keep-open" data-id="${esc(m.id)}" data-kind="${dm ? 'dm' : 'channel'}" data-src="${esc(dm ? ui.dmId : ui.channelId)}" data-server="${esc(dm ? '' : ui.serverId)}" aria-label="${saved ? 'Уже в точках возврата' : 'Сохранить в точки возврата'}" title="${saved ? 'Уже сохранено' : 'Сохранить'}">${saved ? '🔖' : '🏷️'}</button>`;
  }
  function renderKeepSheet() {
    const k = ui.keepSheet;
    return `<div class="keep-sheet-wrap" role="presentation">
  <div class="keep-backdrop" data-action="keep-cancel"></div>
  <form class="keep-sheet" role="dialog" aria-modal="true" aria-labelledby="keep-title" data-keep-form="save">
    <h2 id="keep-title">${k.mode === 'edit' ? 'Заметка к сохранению' : 'Сохранить сообщение'}</h2>
    <p class="keep-hint">Сохранится на этом устройстве, только для твоего аккаунта. Между устройствами не синхронизируется.</p>
    <label class="keep-field"><span>Личная заметка <em>(необязательно)</em></span>
      <textarea name="note" maxlength="${KEEP_NOTE_MAX}" rows="3" placeholder="Например: вернуться к этому позже">${esc(k.note || '')}</textarea>
      <small class="keep-count" data-keep-count>${(k.note || '').length} / ${KEEP_NOTE_MAX}</small>
    </label>
    <div class="keep-actions">
      <button type="button" class="btn ghost" data-action="keep-cancel">Отмена</button>
      <button type="submit" class="btn primary">${k.mode === 'edit' ? 'Сохранить заметку' : 'Сохранить'}</button>
    </div>
  </form>
</div>`;
  }
  function renderKeepSnack() {
    const n = ui.keepSnack;
    if (!n) return '';
    return `<div class="keep-snack" role="status"><span>${esc(n.text)}</span><button type="button" class="link" data-action="keep-undo" data-id="${esc(n.id)}">${n.undo ? 'Отменить' : 'Открыть'}</button></div>`;
  }
  function keepSourceLabel(r) {
    if (r.kind === 'dm') return 'Личные · ' + (prof(r.src)?.display_name || 'участник');
    const c = data.channels.find((x) => x.id === r.src);
    const sv = srv(r.server);
    if (!c || !sv) return 'Канал недоступен';
    return '# ' + c.name + ' · ' + sv.name;
  }
  function renderKeepsPage() {
    const all = keepsAll().sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const filter = ui.keepFilter;
    const shown = all.filter((r) => filter === 'all' || (filter === 'channel' && r.kind === 'channel') || (filter === 'dm' && r.kind === 'dm'));
    const cards = shown.map((r) => {
      const row = keepLoaded.get(r.id);
      let body;
      if (row === undefined) body = '<p class="keep-body muted">Загружаем текст…</p>';
      else if (row === null) body = '<p class="keep-body gone">Сообщение удалено или недоступно: у тебя нет к нему доступа. Текст не сохранён на устройстве.</p>';
      else body = `<p class="keep-body">${esc(row.body)}</p>`;
      const author = row ? esc(prof(row.sender_id)?.display_name || 'Участник') : '—';
      const searchable = ((r.note || '') + ' ' + (row?.body || '') + ' ' + keepSourceLabel(r)).toLowerCase();
      return `<article class="keep-card${ui.keepPulse === r.id ? ' pulse' : ''}" data-search="${esc(searchable)}" id="keep-${esc(r.id)}">
  <header><span class="keep-kind">${r.kind === 'dm' ? 'Личные' : 'Канал'}</span><span class="keep-src">${esc(keepSourceLabel(r))}</span></header>
  ${body}
  <footer class="keep-meta"><span>Автор: ${author}</span><span>Сохранено: ${new Date(r.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></footer>
  ${r.note ? `<p class="keep-note">📝 ${esc(r.note)}</p>` : ''}
  <div class="keep-tools">
    <button type="button" class="btn primary sm" data-action="keep-go" data-id="${esc(r.id)}" ${row === null ? 'disabled' : ''}>Вернуться к сообщению</button>
    <button type="button" class="btn ghost sm" data-action="keep-edit" data-id="${esc(r.id)}">Заметка</button>
    <button type="button" class="btn ghost sm danger" data-action="keep-del" data-id="${esc(r.id)}">Удалить</button>
  </div>
</article>`;
    }).join('');
    const chip = (id, label) => `<button type="button" class="kchip${filter === id ? ' on' : ''}" data-action="keep-filter" data-id="${id}" aria-pressed="${filter === id}">${label}</button>`;
    return `<section class="keeps-page content-scroll">
  <div class="keeps-head">
    <div><h2>Точки возврата</h2><p class="keep-hint">Твои сохранения на этом устройстве. Не синхронизируются между устройствами.</p></div>
  </div>
  <div class="keeps-bar">
    <input class="keep-search" type="search" placeholder="Поиск по заметкам и тексту" aria-label="Поиск по точкам возврата" maxlength="80">
    <div class="kchips" role="group" aria-label="Фильтр">${chip('all', 'Все')}${chip('channel', 'Каналы')}${chip('dm', 'Личные сообщения')}</div>
  </div>
  ${keepError ? `<p class="notice err" role="alert">${esc(keepError)}</p>` : ''}
  ${all.length === 0
    ? '<div class="keeps-empty"><div class="keeps-empty-ico" aria-hidden="true">🔖</div><h3>Пока пусто</h3><p>Нажми 🏷️ у любого сообщения, и оно появится здесь. Можно добавить заметку и быстро вернуться к нему.</p></div>'
    : shown.length === 0
      ? '<div class="keeps-empty"><h3>Здесь пусто</h3><p>В этом фильтре нет сохранений.</p></div>'
      : `<div class="keeps-grid">${cards}</div><p class="keeps-none" hidden>Ничего не нашли по этому запросу.</p>`}
</section>`;
  }
  function keepFilterCards() {
    const q = (document.querySelector('.keep-search')?.value || '').trim().toLowerCase();
    let shown = 0;
    document.querySelectorAll('.keep-card').forEach((c) => {
      const hit = !q || c.dataset.search.indexOf(q) >= 0;
      c.hidden = !hit;
      if (hit) shown++;
    });
    const none = document.querySelector('.keeps-none');
    if (none) none.hidden = shown > 0;
  }
  async function loadKeeps() {
    if (keepBusy || !user) return;
    const ids = keepsAll().filter((r) => !keepLoaded.has(r.id));
    if (!ids.length) return;
    keepBusy = true;
    keepError = '';
    try {
      const chanIds = ids.filter((r) => r.kind === 'channel').map((r) => r.id);
      const dmIds = ids.filter((r) => r.kind === 'dm').map((r) => r.id);
      const [ch, dm] = await Promise.all([
        chanIds.length ? client.from('voxel_messages').select('id,channel_id,sender_id,body,created_at').in('id', chanIds) : { data: [] },
        dmIds.length ? client.from('voxel_dm_messages').select('id,sender_id,recipient_id,body,created_at').in('id', dmIds) : { data: [] },
      ]);
      if (ch.error || dm.error) throw ch.error || dm.error;
      const found = new Map([...(ch.data || []), ...(dm.data || [])].map((m) => [m.id, m]));
      ids.forEach((r) => keepLoaded.set(r.id, found.get(r.id) || null));
      const senders = [...new Set([...found.values()].map((m) => m.sender_id))].filter((id) => !prof(id));
      if (senders.length) {
        const { data: profs } = await client.from('voxel_profiles').select('id,username,display_name,avatar,accent,frame,skin').in('id', senders);
        if (profs) data.profiles.push(...profs.filter((p) => !prof(p.id)));
      }
    } catch (e) {
      keepError = 'Не получилось загрузить сохранения. Проверь соединение и попробуй ещё раз.';
    } finally {
      keepBusy = false;
      if (ui.pane === 'keeps') render();
    }
  }
  function keepSnack(text, id, undo) {
    ui.keepSnack = { text, id, undo };
    render();
    clearTimeout(keepSnack.t);
    keepSnack.t = setTimeout(() => { ui.keepSnack = null; render(); }, 5200);
  }
  async function jumpToMessage(r) {
    const table = r.kind === 'dm' ? 'voxel_dm_messages' : 'voxel_messages';
    const { data: target, error } = await client.from(table).select('*').eq('id', r.id).maybeSingle();
    if (error || !target) return toast('Сообщение удалено или недоступно.');
    const dm = r.kind === 'dm';
    const scope = (q) => (dm
      ? q.or(`and(sender_id.eq.${selfId()},recipient_id.eq.${r.src}),and(sender_id.eq.${r.src},recipient_id.eq.${selfId()})`)
      : q.eq('channel_id', r.src));
    const [older, newer] = await Promise.all([
      scope(client.from(table).select('*')).lte('created_at', target.created_at).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(40),
      scope(client.from(table).select('*')).gt('created_at', target.created_at).order('created_at', { ascending: true }).limit(20),
    ]);
    if (older.error || newer.error) return toast('Не получилось открыть сообщение. Попробуй ещё раз.');
    const rows = [...(older.data || []), ...(newer.data || [])];
    rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)));
    const uniq = [...new Map(rows.map((m) => [m.id, m])).values()];
    const missing = [...new Set(uniq.map((m) => m.sender_id))].filter((id) => !prof(id));
    if (missing.length) {
      const { data: profs } = await client.from('voxel_profiles').select('id,username,display_name,avatar,accent,frame,skin').in('id', missing);
      if (profs) data.profiles.push(...profs.filter((p) => !prof(p.id)));
    }
    if (!dm) {
      const { data: reacts } = await client.from('voxel_reactions').select('*').in('message_id', uniq.map((m) => m.id));
      data.reactions = reacts || [];
      data.messages = uniq;
    } else {
      data.dms = uniq;
    }
    ui.pane = 'chat';
    render();
    const el = document.getElementById('msg-' + r.id);
    if (!el) return toast('Сообщение не попало в загруженный фрагмент.');
    el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    el.classList.add('is-hit');
    setTimeout(() => el.classList.remove('is-hit'), 2000);
  }

  function plusMenuHtml() {
    return `<div class="plus-menu" role="menu">
      <button type="button" role="menuitem" data-action="new-server">Создать сервер</button>
      <button type="button" role="menuitem" data-action="join-server">Вступить по приглашению</button>
      <button type="button" role="menuitem" data-action="social">Сообщество</button>
    </div>`;
  }
  function renderTabbar() {
    const onList = ui.pane === 'list';
    const onSettings = ui.pane === 'settings';
    return `<nav class="tabbar" aria-label="Разделы">
  <button type="button" class="${onList ? 'on' : ''}" data-action="show-list"><span class="ico">${svgIcon('chat')}${tabBadge()}</span><span>Чаты</span></button>
  <button type="button" class="${ui.pane === 'friends' ? 'on' : ''}" data-action="friends"><span class="ico">${svgIcon('users')}</span><span>Контакты</span></button>
  <button type="button" class="${onSettings && ui.settingsView !== 'profile' ? 'on' : ''}" data-action="settings"><span class="ico">${svgIcon('settings')}</span><span>Настройки</span></button>
  <button type="button" class="${onSettings && ui.settingsView === 'profile' ? 'on' : ''}" data-action="settings" data-id="profile"><span class="ico">${avatar(me, 'sm')}</span><span>Профиль</span></button>
</nav>`;
  }
  function applyChatFilter() {
    const q = ($('.chat-search')?.value || '').trim().toLowerCase();
    document.querySelectorAll('.chat-row').forEach((row) => {
      row.hidden = Boolean(q) && !row.dataset.name.includes(q);
    });
  }
  function chatFolders() {
    return [
      { id: 'all', label: 'Все' },
      { id: 'home', label: 'Личные' },
      ...data.servers.map((s) => ({ id: s.id, label: s.name })),
    ];
  }
  function chatRows() {
    const rows = [];
    const folder = ui.folder || 'all';
    if (folder === 'all' || folder === 'home') {
      for (const id of myFriendIds()) {
        const p = prof(id);
        const selected = ui.space === 'home' && ui.pane === 'dm' && ui.dmId === id;
        rows.push({
          kind: 'dm',
          id,
          name: p?.display_name || 'Участник',
          sub: previewText(previews.get('d:' + id), true) || 'Личный чат',
          time: previews.get('d:' + id)?.created_at || '',
          selected,
          avatar: avatar(p, 'md'),
          badge: community.count(id, true),
        });
      }
    }
    if (folder !== 'home') {
      const servers = folder === 'all' ? data.servers : data.servers.filter((s) => s.id === folder);
      if (folder !== 'all' && srv(folder)) {
        const sv = srv(folder);
        const tools = [
          { tool: 'voice-view', name: '🎙 Общая комната', sub: 'Голосовой канал', icon: 'mic' },
          { tool: 'members', name: 'Участники', sub: `${members(sv.id).length} в сервере`, icon: 'users' },
          { tool: 'copy-invite', name: 'Пригласить друзей', sub: 'Скопировать ссылку', icon: 'plus' },
          { tool: 'server-menu', name: 'Настройки сервера', sub: sv.name, icon: 'settings' },
        ];
        for (const t of tools) {
          rows.push({
            kind: 'tool',
            id: t.tool,
            server: sv.id,
            name: t.name,
            sub: t.sub,
            selected: false,
            avatar: `<span class="cl-hash">${svgIcon(t.icon)}</span>`,
            badge: '',
            time: '',
          });
        }
      }
      for (const s of servers) {
        for (const c of data.channels.filter((c) => c.server_id === s.id)) {
          rows.push({
            kind: 'chan',
            id: c.id,
            server: s.id,
            name: `# ${c.name}`,
            sub: previewText(previews.get('c:' + c.id), false) || `${s.name}${c.category ? ' · ' + c.category : ''}`,
            time: previews.get('c:' + c.id)?.created_at || '',
            selected: ui.space === 'server' && ui.pane === 'chat' && ui.channelId === c.id,
            avatar: `<span class="cl-hash">${svgIcon('chat')}</span>`,
            badge: '',
          });
        }
      }
    }
    return rows.sort(
      (a, b) => (b.kind === 'tool') - (a.kind === 'tool') || (b.time || '').localeCompare(a.time || ''),
    );
  }
  function renderSidebar() {
    const folders = chatFolders();
    const rows = chatRows();
    const channelsAllowed = ui.space === 'server' && community.perm(ui.serverId, 'channels');
    return `<aside class="sidebar cl ${ui.sidebarOpen ? 'mobile-open' : ''}" aria-label="Список чатов">
  <div class="cl-top">
    <div class="cl-brand">${logo}<b>VoxelSpase</b></div>
    <div class="cl-tools">
      <button type="button" class="cl-ico" data-action="keeps" title="Точки возврата" aria-label="Точки возврата">🔖</button>
      <span class="plus-wrap"><button type="button" class="cl-ico" data-action="plus-menu" aria-haspopup="menu" aria-expanded="${ui.plusMenu ? 'true' : 'false'}" title="Создать или вступить" aria-label="Создать или вступить">${svgIcon('plus')}</button>${ui.plusMenu ? plusMenuHtml() : ''}</span>
      <button type="button" class="cl-ico cl-me" data-action="settings" title="Настройки" aria-label="Настройки">${avatar(me, 'sm')}</button>
    </div>
  </div>
  <label class="cl-search">
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>
    <input class="chat-search" name="chatq" data-action="chat-search" placeholder="Поиск чатов" autocomplete="off" />
  </label>
  <div class="cl-chips" role="tablist" aria-label="Папки">
    ${folders
      .map(
        (f) =>
          `<button type="button" role="tab" class="cl-chip ${ui.folder === f.id ? 'active' : ''}" data-action="set-folder" data-id="${esc(f.id)}" aria-selected="${ui.folder === f.id}">${esc(cut(f.label, 22))}</button>`,
      )
      .join('')}
  </div>
  <div class="side-scroll cl-list">
    ${
      rows.length
        ? rows
            .map(
              (r) => `<button type="button" class="chat-row ${r.selected ? 'selected' : ''}" data-action="${r.kind === 'dm' ? 'open-dm' : r.kind === 'tool' ? 'srv-tool' : 'open-chan'}" data-id="${esc(r.id)}" ${r.server ? `data-server="${esc(r.server)}"` : ''} data-name="${esc(r.name.toLowerCase())}">
        <span class="cl-av">${r.avatar}</span>
        <span class="cl-body"><span class="cl-line"><b>${esc(r.name)}</b><span class="cl-meta">${r.time ? `<time>${when(r.time)}</time>` : ''}${r.badge || ''}</span></span><span class="cl-sub">${esc(r.sub)}</span></span>
      </button>`,
            )
            .join('')
        : `<p class="cl-empty">${ui.folder === 'home' || ui.folder === 'all' ? 'Добавь друга, чтобы начать переписку.' : 'В этом сервере пока нет каналов.'}</p>`
    }
  </div>
  ${
    channelsAllowed || ui.space === 'home'
      ? `<button type="button" class="fab" data-action="${ui.space === 'home' ? 'add-friend' : 'new-channel'}" aria-label="${ui.space === 'home' ? 'Добавить друга' : 'Создать канал'}" title="${ui.space === 'home' ? 'Добавить друга' : 'Создать канал'}">${svgIcon('plus')}</button>`
      : ''
  }
</aside>`;
  }

  function renderHeader() {
    const home = ui.space === 'home',
      channel = chan(ui.channelId),
      n = inbox.filter((a) => !a.seen).length + community.mentionCount();
    const title =
      ui.pane === 'keeps'
        ? 'Точки возврата'
        : ui.pane === 'settings'
        ? 'Настройки'
        : ui.pane === 'social'
        ? 'Сообщество'
        : home
          ? ui.pane === 'dm'
            ? prof(ui.dmId)?.display_name
            : 'Друзья'
          : ui.pane === 'members'
            ? 'Участники'
            : ui.pane === 'voice'
              ? 'Голосовая комната'
              : '# ' + (channel?.name || 'канал');
    return `<header class="main-header"><button class="mobile-button" data-action="${ui.pane === 'settings' ? 'settings-back' : 'show-list'}" aria-label="Назад">←</button><div class="header-label"><small>${home ? 'Личное пространство' : esc(srv(ui.serverId)?.name)}</small><strong>${esc(title)}</strong></div>
 <div id="voice-chip">${voiceChip()}</div><button class="header-action bell" data-action="inbox" aria-label="Уведомления, непрочитанных ${n}">${svgIcon('bell')}${n ? `<b>${n}</b>` : ''}</button><button class="header-action" data-action="refresh" title="Обновить">${svgIcon('refresh')}</button><button class="header-action" data-action="settings" title="Настройки">${svgIcon('settings')}</button></header>`;
  }
  function renderMain() {
    if (ui.pane === 'keeps') return renderKeepsPage();
    if (ui.pane === 'settings') return renderSettingsPage();
    if (ui.pane === 'list') return ui.space === 'home' ? renderFriends() : renderChat();
    if (ui.pane === 'social') return social.render();
    if (ui.pane === 'voice')
      return '<section class="content-scroll" id="voice-view">' + voiceView() + '</section>';
    if (ui.space === 'home' && ui.pane === 'friends') return renderFriends();
    if (ui.space === 'server' && ui.pane === 'members') return renderMembers();
    return renderChat();
  }
  function renderFriends() {
    const list = data.friends;
    const incoming = list.filter((f) => f.status === 'pending' && f.addressee_id === selfId());
    const outgoing = list.filter((f) => f.status === 'pending' && f.requester_id === selfId());
    let ids =
      ui.friendTab === 'all'
        ? myFriendIds()
        : ui.friendTab === 'incoming'
          ? incoming.map((f) => f.requester_id)
          : outgoing.map((f) => f.addressee_id);
    return `<section class="content-scroll"><div class="page-banner"><div><span class="overline">ЛИЧНОЕ ПРОСТРАНСТВО</span><h1>Твои друзья</h1><p>${esc(me?.display_name)} · @${esc(me?.username)}</p>${community.button('person', 'Мой профиль', `data-id="${selfId()}"`, 'small profile-shortcut')}</div><img src="./assets/island.webp" alt="" class="banner-island"></div>
 <div class="toolbar"><div class="segmented"><button data-action="friend-tab" data-id="all" class="${ui.friendTab === 'all' ? 'chosen' : ''}">Все (${myFriendIds().length})</button><button data-action="friend-tab" data-id="incoming" class="${ui.friendTab === 'incoming' ? 'chosen' : ''}">Входящие (${incoming.length})</button><button data-action="friend-tab" data-id="outgoing" class="${ui.friendTab === 'outgoing' ? 'chosen' : ''}">Исходящие (${outgoing.length})</button></div>${button('add-friend', '+ Добавить друга', 'primary')}</div>
 ${ids.length ? `<label class="people-search">${svgIcon('search')}<input name="friendSearch" type="search" aria-label="Поиск в списке" placeholder="Найти в списке…" value="${esc(ui.search)}"></label>` : ''}
 <div class="people-list">${
   ids.length
     ? ids
         .map((id) => {
           const p = prof(id),
             rel = relationship(id);
           return `<div class="person-card" data-person="${esc((p?.display_name + ' ' + p?.username).toLowerCase())}">${avatar(p)}<div class="person-info"><strong>${esc(p?.display_name || 'Участник')}</strong><span>@${esc(p?.username || 'неизвестно')} · ${statusText(p)}</span></div>
 ${ui.friendTab === 'all' ? `${button('profile', 'Профиль', 'subtle', `data-id="${id}"`)}${button('open-dm', 'Написать', 'subtle', `data-id="${id}"`)}` : ui.friendTab === 'incoming' ? `${button('accept-friend', 'Принять', 'primary', `data-id="${rel.id}"`)}${button('decline-friend', 'Отклонить', 'subtle', `data-id="${rel.id}"`)}` : button('remove-friend', 'Отменить', 'subtle', `data-id="${rel.id}"`)}</div>`;
         })
         .join('')
     : `<div class="empty"><span>✦</span><h2>${ui.friendTab === 'all' ? 'Здесь появятся друзья' : 'Пока нет заявок'}</h2><p>${ui.friendTab === 'all' ? 'Найди пользователя по @username и отправь запрос.' : 'Как только появятся заявки, ты увидишь их здесь.'}</p></div>`
 }</div><p id="no-matches" class="help" hidden>Никого с таким именем.</p></section>`;
  }
  function renderMembers() {
    const s = srv(ui.serverId),
      list = members(ui.serverId);
    return `<section class="content-scroll"><div class="page-banner"><div class="banner-icon">${esc(s?.icon || '💠')}</div><div><h1>${esc(s?.name || 'Сервер')}</h1><p>${esc(s?.description || 'Участники сервера')}</p></div></div>
 <div class="section-heading">УЧАСТНИКИ (${list.length})</div><div class="people-list">${list
   .map((m) => {
     let p = prof(m.user_id);
     return `<div class="person-card">${avatar(p)}<div class="person-info"><strong>${esc(community.nickname(m.user_id, ui.serverId))}</strong>${community.pinned(p, 32)}<span>@${esc(p?.username || '')} · ${roleLabel(m.role)} ${community.rolePill(ui.serverId, m.user_id)}</span></div>
 ${m.user_id !== selfId() ? button('profile', 'Профиль', 'subtle', `data-id="${m.user_id}"`) : ''}
 ${isOwner(ui.serverId) && m.role !== 'owner' ? `<select class="role-select" data-role-user="${m.user_id}"><option ${m.role === 'member' ? 'selected' : ''} value="member">Участник</option><option ${m.role === 'moderator' ? 'selected' : ''} value="moderator">Модератор</option><option ${m.role === 'admin' ? 'selected' : ''} value="admin">Админ</option></select>` : ''}</div>`;
   })
   .join('')}</div></section>`;
  }
  function renderChat() {
    const dm = ui.space === 'home';
    const target = dm ? prof(ui.dmId) : chan(ui.channelId);
    const list = dm ? data.dms : data.messages;
    if (!target && !dm)
      return `<section class="center-empty"><span class="giant-symbol">#</span><h1>Пока нет каналов</h1><p>${canManage(ui.serverId) ? 'Создай первый текстовый канал для участников.' : 'Новый канал появится здесь, когда его создаст администратор.'}</p>${community.perm(ui.serverId, 'channels') ? button('new-channel', 'Создать канал', 'primary') : ''}</section>`;
    if (!target)
      return `<section class="center-empty"><span class="giant-symbol">${dm ? '💬' : '#'}</span><h1>${dm ? 'Выбери друга' : 'Выбери канал'}</h1><p>${dm ? 'Напиши человеку из списка друзей слева.' : 'Создай сервер или выбери канал для общения.'}</p>${button(dm ? 'add-friend' : 'new-server', dm ? 'Найти друга' : 'Создать сервер', 'primary')}</section>`;
    return `<section class="chat-wrap"><div class="chat-scroll"><div class="chat-welcome"><div class="welcome-icon">${dm ? esc(target.avatar || '🙂') : '#'}</div><h1>${dm ? esc(target.display_name) : `Добро пожаловать в #${esc(target.name)}!`}</h1><p>${dm ? 'Личная переписка. Сообщения видны только участникам беседы.' : esc(target.description || 'Здесь начинается история вашего канала.')}</p></div>
 ${moreHistory ? button('older', 'Ранее в переписке', 'older') : ''}<div class="messages">${list
   .map((m, i) => {
     const day = new Date(m.created_at).toLocaleDateString('ru-RU', {
       day: 'numeric',
       month: 'long',
       year: 'numeric',
     });
     return (
       (i === 0 ||
       new Date(list[i - 1].created_at).toDateString() !== new Date(m.created_at).toDateString()
         ? `<div class="day-marker">${day}</div>`
         : '') + renderMessage(m, dm)
     );
   })
   .join(
     '',
   )}</div></div><div class="compose"><div class="compose-tools">${community.button('tools', '＋ Инструменты чата', '', 'small')}<button type="button" class="compose-sticker" data-action="sticker-tray" aria-label="Стикеры" title="Стикеры">🙂</button></div>${ui.stickerTray ? stickerTray() : ''}<form data-form="send" class="compose-bar"><textarea name="message" id="compose-text" rows="1" maxlength="3000" aria-label="Сообщение" placeholder="Сообщение ${dm ? esc(target.display_name) : '#' + esc(target.name)}" required></textarea><button class="send-button" type="submit" title="Отправить">➤</button></form><p class="compose-hint">Enter — отправить · Shift + Enter — новая строка · VoxelSpase v1.11</p></div></section>`;
  }
  function socialSticker(body) {
    const match = /^\[kotost:(hello|cozy|play|sleep)\]$/.exec(body || '');
    return match
      ? `<img class="chat-sticker" src="./assets/stickers/${match[1]}.svg" alt="Стикер Котость ${match[1]}">`
      : esc(body);
  }
  function renderMessage(m, dm) {
    const p = prof(m.sender_id);
    const own = m.sender_id === selfId();
    const reactions = dm ? [] : data.reactions.filter((r) => r.message_id === m.id);
    const group = Object.groupBy
      ? Object.groupBy(reactions, (r) => r.emoji)
      : reactions.reduce((a, r) => {
          (a[r.emoji] ??= []).push(r);
          return a;
        }, Object.create(null));
    return `<article id="msg-${m.id}" class="message ${own ? 'own' : ''}"><button class="avatar-link" data-v4="person" data-id="${m.sender_id}" title="Профиль">${avatar(p)}</button><div class="message-content"><div class="message-meta"><button class="name-link" data-v4="person" data-id="${m.sender_id}">${esc(community.nickname(m.sender_id, dm ? null : ui.serverId))} ${esc(p?.flair || '')}</button>${community.pinned(p)}<span>${when(m.created_at)}</span>${m.edited_at ? '<i>изменено</i>' : ''}</div><div class="message-body">${socialSticker(m.body)}</div>${community.messageExtra(m, dm)}
 ${
   Object.entries(group).length
     ? `<div class="reaction-list">${Object.entries(group)
         .map(
           ([emoji, list]) =>
             `<button data-action="reaction" data-id="${m.id}" data-emoji="${esc(emoji)}" class="reaction ${list.some((r) => r.user_id === selfId()) ? 'mine' : ''}">${esc(emoji)} ${list.length}</button>`,
         )
         .join('')}</div>`
     : ''
 }</div>
 <div class="message-actions">${dm || community.perm(ui.serverId, 'moderate') ? community.button('pin-message', m.pinned ? '◆' : '◇', `data-id="${m.id}" data-pin="${!m.pinned}" title="${m.pinned ? 'Открепить' : 'Закрепить'}"`, 'mini') : ''}${!dm ? button('react', '💜', 'mini', `data-id="${m.id}"`) : ''}${own ? button('edit-message', '✎', 'mini', `data-id="${m.id}"`) : ''}${own || (!dm && canMod(ui.serverId)) ? button('delete-message', '✕', 'mini', `data-id="${m.id}" data-kind="${dm ? 'dm' : 'channel'}"`) : ''}</div>${keepButton(m, dm)}</article>`;
  }
  function overlay(title, inner, wide = false) {
    return `<div class="overlay" data-action="overlay"><section class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-header"><h2>${esc(title)}</h2><button class="plain-icon large" data-action="close-modal" aria-label="Закрыть">×</button></div>${inner}</section></div>`;
  }
  const formBottom = (text = 'Сохранить') =>
    `<div class="modal-buttons">${button('close-modal', 'Отмена', 'subtle')}<button class="btn primary" type="submit">${esc(text)}</button></div>`;
  function renderModal() {
    switch (ui.modal) {
      case 'inbox':
        return overlay('Уведомления', renderInbox());
      case 'edit-channel': {
        const c = chan(ui.channelId);
        if (!c) return '';
        return overlay(
          'Настройки канала',
          `<form class="form-fields" data-form="edit-channel"><label>Название<input name="name" value="${esc(c.name)}" maxlength="32" required></label><label>Категория<input name="category" value="${esc(c.category)}" maxlength="32" required></label><label>Описание<textarea name="description" maxlength="350">${esc(c.description)}</textarea></label>${formBottom()}</form>${button('delete-channel', 'Удалить канал', 'danger full')}`,
        );
      }
      case 'new-server':
        return overlay(
          'Создать сервер',
          `<form data-form="new-server" class="form-fields"><label>Стартовые каналы<select name="template"><option value="basic">С нуля · общий</option><option value="games">Игровой клуб · общий, ищу-команду, клипы</option><option value="study">Учёба · общий, задания, материалы</option></select></label><label>Название<input name="name" maxlength="60" minlength="2" required placeholder="Например, Игровой клуб"></label><label>Иконка (эмодзи)<input name="icon" maxlength="12" placeholder="🎮" value="💠"></label><label>Описание<textarea name="description" rows="3" maxlength="500" placeholder="О чём ваше сообщество?"></textarea></label>${formBottom('Создать сервер')}</form>`,
        );
      case 'join-server':
        return overlay(
          'Вступить на сервер',
          `<form data-form="join-server" class="form-fields"><p class="help">Вставь код приглашения от владельца сервера или полную ссылку VoxelSpase.</p><label>Код или ссылка<input name="invite" required placeholder="Код приглашения" value="${esc(ui.pendingInvite || '')}"></label>${formBottom('Вступить')}</form>`,
        );
      case 'new-channel':
        return overlay(
          'Новый текстовый канал',
          `<form data-form="new-channel" class="form-fields"><label>Название<input name="name" required maxlength="32" placeholder="новости"></label><label>Категория<input name="category" maxlength="32" value="ОБЩЕНИЕ"></label><label>Описание<textarea name="description" maxlength="350" rows="3"></textarea></label>${formBottom('Создать канал')}</form>`,
        );
      case 'add-friend':
        return overlay(
          'Добавить друга',
          `<form data-form="add-friend" class="form-fields"><p class="help">Попроси у друга его @username. Сейчас у каждого аккаунта есть уникальное имя.</p><label>Имя пользователя<input name="username" required placeholder="username" autocomplete="off"></label>${formBottom('Отправить заявку')}</form>`,
        );
      case 'edit-message': {
        const dm = ui.space === 'home';
        const msg = (dm ? data.dms : data.messages).find((m) => m.id === ui.messageToEdit);
        return overlay(
          'Изменить сообщение',
          `<form data-form="edit-message" class="form-fields"><label>Сообщение<textarea name="body" rows="4" maxlength="3000" required>${esc(msg?.body || '')}</textarea></label>${formBottom('Сохранить сообщение')}</form>`,
        );
      }
      case 'server-menu': {
        const s = srv(ui.serverId);
        return overlay(
          'Настройки сервера',
          `<div class="modal-body">${community.button('management', 'Управление сообществом', '', 'primary full')}<div class="server-info">${esc(s?.icon || '💠')} <strong>${esc(s?.name)}</strong></div><p class="help">Код приглашения: <code>${esc(s?.invite_code || '')}</code></p>${button('copy-invite', '↗ Скопировать приглашение', 'primary full')}${canManage(s?.id) ? button('edit-server', '✎ Изменить сервер', 'subtle full') : ''}${community.perm(s?.id, 'channels') ? button('new-channel', '+ Создать канал', 'subtle full') : ''}${community.perm(s?.id, 'channels') && chan(ui.channelId) ? button('edit-channel', 'Настроить #' + esc(chan(ui.channelId).name), 'subtle full') : ''}${canManage(s?.id) ? button('rotate-invite', 'Заменить ссылку приглашения', 'subtle full') : ''}${!isOwner(s?.id) ? button('leave-server', 'Покинуть сервер', 'danger full') : ''}${isOwner(s?.id) ? button('delete-server', 'Удалить сервер', 'danger full') : ''}</div>`,
        );
      }
      case 'edit-server': {
        const s = srv(ui.serverId);
        return overlay(
          'Изменить сервер',
          `<form data-form="edit-server" class="form-fields"><label>Название<input name="name" maxlength="60" minlength="2" required value="${esc(s?.name)}"></label><label>Значок<input name="icon" maxlength="12" value="${esc(s?.icon)}" required></label><label>Описание<textarea name="description" maxlength="500" rows="4">${esc(s?.description)}</textarea></label>${formBottom('Сохранить')}</form>`,
        );
      }
      case 'settings':
        return overlay(
          'Настройки VoxelSpase',
          `<div class="settings-tabs" role="tablist"><button class="${ui.settingsTab === 'profile' ? 'selected' : ''}" data-action="settings-tab" data-id="profile">Профиль</button><button class="${ui.settingsTab === 'appearance' ? 'selected' : ''}" data-action="settings-tab" data-id="appearance">Оформление</button><button class="${ui.settingsTab === 'privacy' ? 'selected' : ''}" data-action="settings-tab" data-id="privacy">Приватность</button></div>${renderSettings()}<div class="settings-footer">${button('logout', '↪ Выйти из аккаунта', 'danger')}${button('close-modal', 'Закрыть', 'subtle')}</div>`,
          true,
        );
      case 'profile': {
        const p = prof(ui.profileId);
        if (!p) return overlay('Профиль', '<p class="help">Пользователь больше недоступен.</p>');
        return overlay(
          'Профиль',
          `<div class="profile-card">${avatar(p, 'lg')}<h2>${esc(p?.display_name)}</h2><p>@${esc(p?.username)}</p><div class="bio">${esc(p?.bio || 'О себе пока ничего нет.')}</div>${profileActions(p.id)}</div>`,
        );
      }
      default:
        return '';
    }
  }
  function profileActions(id) {
    if (id === selfId()) return '';
    const rel = relationship(id),
      target = `data-id="${id}"`;
    if (!rel || rel.status === 'declined')
      return button('friend-by-id', 'Добавить в друзья', 'primary full', target);
    const pair = `data-id="${rel.id}"`;
    if (rel.status === 'accepted')
      return (
        button('open-dm', 'Написать', 'primary full', target) +
        button('unfriend', 'Удалить из друзей', 'danger full', pair)
      );
    if (rel.requester_id === selfId())
      return button('remove-friend', 'Отменить исходящую заявку', 'subtle full', pair);
    return (
      button('accept-friend', 'Принять заявку', 'primary full', pair) +
      button('decline-friend', 'Отклонить заявку', 'subtle full', pair)
    );
  }
  function renderSettings() {
    if (ui.settingsTab === 'appearance')
      return `<div class="settings-content"><h3>Внешний вид</h3><p class="help">Тёмный стиль VoxelSpase в сине-фиолетовой палитре.</p><label class="setting-row"><span>Глубокая ночная тема</span><input type="checkbox" data-setting="theme" ${me?.theme === 'night' ? 'checked' : ''}></label><label class="setting-row"><span>Компактные сообщения</span><input type="checkbox" data-setting="compact" ${me?.compact ? 'checked' : ''}></label></div>`;
    if (ui.settingsTab === 'privacy')
      return `<div class="settings-content"><h3>Приватность</h3><p class="help">Личные сообщения доступны друзьям. Доступ к серверам и каналам проверяется на уровне базы данных.</p><label class="setting-row"><span>Уведомления внутри приложения</span><input type="checkbox" data-setting="notifications" ${me?.notifications ? 'checked' : ''}></label><div class="mini-info">Колокольчик собирает новые заявки и личные сообщения. Настройка действует на всех твоих устройствах.</div></div>`;
    return `<div class="settings-content"><h3>Мой профиль</h3><div class="v4-actions">${community.button('studio', 'Студия профиля', '', 'primary')}${community.button('collection', 'Достижения')}${community.staff() ? community.button('admin', 'Выдать награду') : ''}</div><form class="form-fields" data-form="profile"><label>Отображаемое имя<input name="display_name" value="${esc(me?.display_name)}" maxlength="50" required></label><label>Имя пользователя (@username)<input name="username" value="${esc(me?.username)}" maxlength="20" pattern="[A-Za-z0-9_.]{3,20}" required></label><label>Аватар-эмодзи<input name="avatar" value="${esc(me?.avatar)}" maxlength="12"></label><label>О себе<textarea name="bio" rows="3" maxlength="350">${esc(me?.bio)}</textarea></label><label>Статус<select name="status"><option value="online" ${me?.status === 'online' ? 'selected' : ''}>В сети</option><option value="idle" ${me?.status === 'idle' ? 'selected' : ''}>Неактивен</option><option value="offline" ${me?.status === 'offline' ? 'selected' : ''}>Не показывать статус</option></select></label><button class="btn primary" type="submit">Сохранить профиль</button></form></div>`;
  }
  async function navigateHome(pane = 'friends') {
    ui.space = 'home';
    ui.pane = pane;
    ui.sidebarOpen = false;
    ui.modal = null;
    render();
    if (pane === 'dm') await loadThread();
  }
  async function navigateServer(id, channelId) {
    historyPages = 1;
    moreHistory = false;
    if (!srv(id)) return toast('Нет доступа к серверу.');
    ui.space = 'server';
    ui.pane = 'chat';
    ui.serverId = id;
    ui.channelId = channelId || defaultChannel(id);
    ui.sidebarOpen = false;
    ui.modal = null;
    data.messages = [];
    data.reactions = [];
    render();
    await loadThread();
  }
  async function navigateDM(id) {
    historyPages = 1;
    moreHistory = false;
    if (!isFriend(id)) return toast('Сначала добавьте пользователя в друзья.');
    ui.space = 'home';
    ui.pane = 'dm';
    ui.dmId = id;
    ui.sidebarOpen = false;
    ui.modal = null;
    data.dms = [];
    render();
    await loadThread();
  }
  async function reaction(id, emoji) {
    const r = data.reactions.find(
      (r) => r.message_id === id && r.user_id === selfId() && r.emoji === emoji,
    );
    if (r)
      await checked(
        client
          .from('voxel_reactions')
          .delete()
          .eq('message_id', id)
          .eq('user_id', selfId())
          .eq('emoji', emoji),
      );
    else
      await checked(
        client.from('voxel_reactions').insert({ message_id: id, user_id: selfId(), emoji }),
      );
    await loadThread();
  }
  async function act(name, el) {
    if (ui.plusMenu && name !== 'plus-menu') ui.plusMenu = false;
    if (ui.palette && name !== 'palette-input') {
      ui.palette = false;
      if (name !== 'palette-close') render();
    }
    const id = el?.dataset.id;
    switch (name) {
      case 'social':
        social.open('discover');
        return;
      case 'password-reset':
        ui.authMode = 'reset';
        render();
        return;
      case 'reload':
        location.reload();
        break;
      case 'older':
        el.disabled = true;
        try {
          await loadThread(true, true);
        } finally {
          el.disabled = false;
        }
        break;
      case 'voice-view':
        ui.pane = 'voice';
        ui.sidebarOpen = false;
        ui.modal = null;
        render();
        break;
      case 'current-call':
        if (voice.call) {
          ui.space = 'server';
          ui.serverId = voice.call.server;
          ui.channelId = defaultChannel(ui.serverId);
          ui.pane = 'voice';
          ui.modal = null;
          ui.sidebarOpen = false;
          render();
        }
        break;
      case 'voice-screen':
        await voice.shareScreen();
        break;
      case 'voice-mute':
        voice.toggleMute();
        break;
      case 'voice-leave':
        await voice.leave();
        break;
      case 'voice-audio':
        await voice.resumeAudio();
        break;
      case 'edit-channel':
        ui.modal = 'edit-channel';
        render();
        break;
      case 'delete-channel':
        if (confirm('Удалить канал вместе с историей сообщений?')) {
          await checked(client.from('voxel_channels').delete().eq('id', ui.channelId));
          ui.modal = null;
          await refreshCore();
        }
        break;
      case 'rotate-invite':
        if (confirm('Заменить приглашение? Старая ссылка перестанет работать.')) {
          await rpc('voxel_rotate_invite', { p_server: ui.serverId });
          await refreshCore();
          toast('Создана новая ссылка.');
        }
        break;
      case 'leave-server':
        if (confirm('Покинуть этот сервер?')) {
          await rpc('voxel_leave_server', { p_server: ui.serverId });
          if (voice.call?.server === ui.serverId) await voice.leave();
          ui.modal = null;
          await refreshCore();
        }
        break;
      case 'unfriend':
        if (confirm('Удалить из друзей и закрыть личную переписку?')) {
          await checked(client.from('voxel_friends').delete().eq('id', id));
          ui.modal = null;
          await refreshCore();
        }
        break;
      case 'inbox':
        ui.modal = 'inbox';
        render();
        break;
      case 'seen-all':
        await community.markMentions();
        await checked(
          client
            .from('voxel_inbox')
            .update({ seen: true })
            .eq('user_id', selfId())
            .eq('seen', false),
        );
        await refreshCore();
        break;
      case 'open-alert': {
        const item = inbox.find((a) => a.id === id);
        if (!item) return;
        await checked(client.from('voxel_inbox').update({ seen: true }).eq('id', id));
        item.seen = true;
        if (item.dm_id && isFriend(item.actor_id)) await navigateDM(item.actor_id);
        else {
          ui.friendTab =
            item.friend_id && relationship(item.actor_id)?.status === 'pending'
              ? 'incoming'
              : 'all';
          await navigateHome();
        }
        break;
      }
      case 'auth-login':
        ui.authMode = 'login';
        render();
        break;
      case 'auth-signup':
        ui.authMode = 'signup';
        render();
        break;
      case 'home':
        await navigateHome();
        break;
      case 'friends':
        await navigateHome();
        break;
      case 'open-server':
        await navigateServer(id);
        break;
      case 'open-channel':
        await navigateServer(ui.serverId, id);
        break;
      case 'open-dm':
        await navigateDM(id);
        break;
      case 'friend-tab':
        ui.search = '';
        ui.friendTab = id;
        render();
        break;
      case 'members':
        ui.pane = 'members';
        ui.sidebarOpen = false;
        render();
        break;
      case 'profile':
        await community.person(id);
        break;
      case 'new-server':
        ui.modal = 'new-server';
        render();
        break;
      case 'join-server':
        ui.modal = 'join-server';
        render();
        break;
      case 'add-friend':
        ui.modal = 'add-friend';
        render();
        break;
      case 'new-channel':
        if (!community.perm(ui.serverId, 'channels')) return toast('Нет прав на создание канала.');
        ui.modal = 'new-channel';
        render();
        break;
      case 'server-menu':
        ui.modal = 'server-menu';
        render();
        break;
      case 'edit-server':
        ui.modal = 'edit-server';
        render();
        break;
      case 'settings':
        ui.pane = 'settings';
        ui.settingsView = id || 'main';
        ui.modal = null;
        ui.sidebarOpen = false;
        render();
        break;
      case 'settings-view':
        ui.settingsView = id || 'main';
        render();
        break;
      case 'settings-back':
        if (ui.settingsView && ui.settingsView !== 'main') {
          ui.settingsView = 'main';
          render();
        } else {
          ui.pane = 'list';
          render();
        }
        break;
      case 'settings-tab':
        ui.settingsTab = id;
        render();
        break;
      case 'close-modal':
        ui.modal = null;
        render();
        break;
      case 'overlay':
        ui.modal = null;
        render();
        break;
      case 'set-theme':
        setTheme(id);
        break;
      case 'custom-reset':
        saveCustom({ ...CUSTOM_DEFAULT });
        applyCustomVars();
        render();
        break;
      case 'premium-activate':
        sfx('done');
        confetti();
        setPremium(true);
        break;
      case 'premium-deactivate':
        setPremium(false);
        break;
      case 'sticker-tray':
        ui.stickerTray = !ui.stickerTray;
        render();
        break;
      case 'send-sticker': {
        const field = $('#compose-text');
        if (!field) break;
        ui.stickerTray = false;
        field.value = `[kotost:${id}]`;
        field.closest('form').requestSubmit();
        break;
      }
      case 'srv-tool': {
        const sid = el.dataset.server;
        if (!srv(sid)) return toast('Нет доступа к серверу.');
        ui.space = 'server';
        ui.serverId = sid;
        ui.channelId = defaultChannel(sid);
        ui.modal = null;
        await act(id, el);
        break;
      }
      case 'capsule-toggle':
        ui.capsuleOpen = !ui.capsuleOpen;
        render();
        break;
      case 'keeps':
        ui.pane = 'keeps';
        ui.sidebarOpen = false;
        render();
        break;
      case 'keep-filter':
        ui.keepFilter = id;
        render();
        break;
      case 'keep-open': {
        const saved = keepFind(id);
        if (saved) {
          ui.pane = 'keeps';
          ui.keepPulse = id;
          render();
          keepSnack('Уже в точках возврата', id, false);
          setTimeout(() => { ui.keepPulse = ''; render(); }, 1600);
          break;
        }
        ui.keepSheet = { id, kind: el.dataset.kind, src: el.dataset.src, server: el.dataset.server, mode: 'create', note: '' };
        render();
        setTimeout(() => document.querySelector('.keep-sheet textarea')?.focus(), 30);
        break;
      }
      case 'keep-edit': {
        const r = keepFind(id);
        if (!r) break;
        ui.keepSheet = { ...r, mode: 'edit' };
        render();
        setTimeout(() => document.querySelector('.keep-sheet textarea')?.focus(), 30);
        break;
      }
      case 'keep-cancel':
        ui.keepSheet = null;
        render();
        break;
      case 'keep-undo': {
        const snack = ui.keepSnack;
        if (snack?.undo) {
          keepsWrite(keepsAll().filter((k) => k.id !== id));
          keepLoaded.delete(id);
        }
        ui.keepSnack = null;
        render();
        break;
      }
      case 'keep-del':
        if (!confirm('Убрать сохранение? Само сообщение не удаляется.')) break;
        keepsWrite(keepsAll().filter((k) => k.id !== id));
        keepLoaded.delete(id);
        render();
        break;
      case 'keep-go': {
        const r = keepFind(id);
        if (!r) break;
        if (r.kind === 'channel') {
          if (!srv(r.server) || !data.channels.find((c) => c.id === r.src)) return toast('Канал недоступен: тебя нет на сервере или он удалён.');
          await navigateServer(r.server, r.src);
        } else {
          if (!isFriend(r.src)) return toast('Личная переписка недоступна: вы больше не друзья.');
          await navigateDM(r.src);
        }
        await jumpToMessage(r);
        break;
      }
      case 'plus-menu':
        ui.plusMenu = !ui.plusMenu;
        render();
        break;
      case 'palette-close':
        ui.palette = false;
        render();
        break;
      case 'voice-join':
        sfx('join');
        await voice.join(ui.serverId);
        break;
      case 'show-list':
        ui.pane = 'list';
        ui.sidebarOpen = false;
        render();
        break;
      case 'set-folder':
        ui.folder = id;
        render();
        break;
      case 'open-chan':
        await navigateServer(el.dataset.server, id);
        break;
      case 'toggle-sidebar':
        ui.sidebarOpen = !ui.sidebarOpen;
        render();
        break;
      case 'close-sidebar':
        ui.sidebarOpen = false;
        render();
        break;
      case 'refresh':
        await refreshCore();
        await loadThread();
        toast('Данные обновлены.');
        break;
      case 'logout': {
        await voice.leave().catch(() => {});
        const { error } = await client.auth.signOut();
        if (error) throw error;
        break;
      }
      case 'copy-invite': {
        const s = srv(ui.serverId);
        if (!s) return;
        const url = `${location.origin}/app/?invite=${encodeURIComponent(s.invite_code)}`;
        try {
          await navigator.clipboard.writeText(url);
          toast('Ссылка приглашения скопирована!');
        } catch {
          prompt('Скопируй ссылку:', url);
        }
        break;
      }
      case 'react':
        await reaction(id, '💜');
        break;
      case 'reaction':
        await reaction(id, el.dataset.emoji);
        break;
      case 'edit-message':
        ui.messageToEdit = id;
        ui.modal = 'edit-message';
        render();
        break;
      case 'delete-message': {
        if (!confirm('Удалить сообщение?')) return;
        const table = el.dataset.kind === 'dm' ? 'voxel_dm_messages' : 'voxel_messages';
        await checked(client.from(table).delete().eq('id', id));
        await loadThread();
        break;
      }
      case 'accept-friend':
        await checked(client.from('voxel_friends').update({ status: 'accepted' }).eq('id', id));
        await refreshCore();
        break;
      case 'decline-friend':
        await checked(
          client.from('voxel_friends').delete().eq('id', id).eq('addressee_id', selfId()),
        );
        await refreshCore();
        break;
      case 'remove-friend':
        await checked(client.from('voxel_friends').delete().eq('id', id));
        await refreshCore();
        break;
      case 'friend-by-id':
        await friendById(id);
        ui.modal = null;
        await refreshCore();
        break;
      case 'delete-server':
        if (!isOwner(ui.serverId)) return;
        if (!confirm('Удалить сервер навсегда вместе с каналами и сообщениями?')) return;
        await checked(client.from('voxel_servers').delete().eq('id', ui.serverId));
        ui.modal = null;
        await refreshCore();
        break;
      default:
        break;
    }
  }
  async function friendById(id) {
    if (id === selfId()) return toast('Нельзя добавить себя.');
    if (relationship(id)?.status === 'declined')
      await checked(client.from('voxel_friends').delete().eq('id', relationship(id).id));
    else if (relationship(id)) return toast('Заявка или дружба уже существует.');
    await checked(
      client.from('voxel_friends').insert({ requester_id: selfId(), addressee_id: id }),
    );
    toast('Заявка отправлена!');
  }
  async function formSubmit(form) {
    const type = form.dataset.form,
      fd = new FormData(form),
      val = (k) => String(fd.get(k) || '').trim();
    const submit = form.querySelector('[type=submit]');
    if (submit?.disabled) return;
    const formToken = [type, threadKey(), ui.modal].join('|');
    if (pendingForms.has(formToken)) return;
    pendingForms.add(formToken);
    if (submit) submit.disabled = true;
    try {
      switch (type) {
        case 'password-reset': {
          const { error } = await client.auth.resetPasswordForEmail(val('email'), {
            redirectTo: location.origin + '/app/?recovery=1',
          });
          if (error) throw error;
          toast('Если аккаунт существует, письмо отправлено. Проверь входящие и спам.');
          break;
        }
        case 'password-update': {
          const { error } = await client.auth.updateUser({
            password: val('password'),
          });
          if (error) throw error;
          ui.authMode = 'login';
          history.replaceState(null, '', location.pathname);
          await loadEverything();
          toast('Пароль сохранён');
          break;
        }
        case 'auth': {
          const email = val('email'),
            password = String(fd.get('password') || '');
          if (ui.authMode === 'signup') {
            const { data: result, error } = await client.auth.signUp({
              email,
              password,
              options: {
                data: { display_name: val('displayName') || 'Участник' },
                emailRedirectTo: location.origin + '/app/',
              },
            });
            if (error) throw error;
            if (result.session) {
              user = result.user;
              await loadEverything();
            } else toast('Регистрация отправлена! Подтверди почту через письмо, затем войди.');
          } else {
            const { data: result, error } = await client.auth.signInWithPassword({
              email,
              password,
            });
            if (error) throw error;
            user = result.user;
            await loadEverything();
          }
          break;
        }
        case 'new-server': {
          const sid = await rpc('voxel_create_server', {
            p_name: val('name'),
            p_icon: val('icon') || '💠',
            p_description: val('description'),
            p_template: val('template'),
          });
          await refreshCore();
          await navigateServer(sid);
          toast('Сервер создан!');
          break;
        }
        case 'join-server': {
          const value = val('invite'),
            code = (() => {
              try {
                const u = new URL(value);
                return u.searchParams.get('invite') || value;
              } catch {
                return value;
              }
            })();
          const sid = await checked(client.rpc('voxel_join_server', { p_invite: code }));
          ui.pendingInvite = null;
          const url = new URL(location.href);
          url.searchParams.delete('invite');
          history.replaceState(null, '', url);
          await refreshCore();
          await navigateServer(sid);
          toast('Вы присоединились к серверу.');
          break;
        }
        case 'new-channel': {
          const name = val('name')
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^\p{L}\p{N}_-]/gu, '')
            .slice(0, 32);
          if (!name) return toast('Введите название канала.');
          const res = await checked(
            client
              .from('voxel_channels')
              .insert({
                server_id: ui.serverId,
                name,
                category: val('category') || 'ОБЩЕНИЕ',
                description: val('description'),
              })
              .select()
              .single(),
          );
          await refreshCore();
          await navigateServer(ui.serverId, res.id);
          toast('Канал создан.');
          break;
        }
        case 'add-friend': {
          const username = val('username').replace(/^@/, '').toLowerCase();
          const p = await checked(
            client.from('voxel_profiles').select('id').eq('username', username).maybeSingle(),
          );
          if (!p) return toast('Пользователь не найден.');
          await friendById(p.id);
          ui.modal = null;
          await refreshCore();
          break;
        }
        case 'send': {
          const dest = threadKey();
          if (sending.has(dest)) return;
          const body = val('message');
          if (!body) return;
          if (body.length > 3000) return toast('Максимум 3000 символов.');
          sending.add(dest);
          try {
            if (ui.space === 'server')
              await checked(
                client.from('voxel_messages').insert({
                  channel_id: ui.channelId,
                  sender_id: selfId(),
                  body,
                }),
              );
            else
              await checked(
                client
                  .from('voxel_dm_messages')
                  .insert({ sender_id: selfId(), recipient_id: ui.dmId, body }),
              );
            if (drafts.get(dest) === String(fd.get('message'))) drafts.delete(dest);
          } finally {
            sending.delete(dest);
            if (threadKey() === dest) render();
          }
          if (threadKey() === dest) {
            await loadThread();
            scrollChat();
            $('#compose-text')?.focus({ preventScroll: true });
          }
          break;
        }
        case 'edit-message': {
          const body = val('body');
          if (!body) return toast('Пустое сообщение нельзя сохранить.');
          const table = ui.space === 'home' ? 'voxel_dm_messages' : 'voxel_messages';
          await checked(
            client
              .from(table)
              .update({ body, edited_at: new Date().toISOString() })
              .eq('id', ui.messageToEdit),
          );
          ui.modal = null;
          await loadThread();
          break;
        }
        case 'profile': {
          const username = val('username').toLowerCase();
          if (!/^[a-z0-9_.]{3,20}$/.test(username))
            return toast('Имя пользователя: 3–20 латинских символов, цифр, _ и .');
          await checked(
            client
              .from('voxel_profiles')
              .update({
                display_name: val('display_name'),
                username,
                avatar: Array.from(val('avatar') || '🚀')
                  .slice(0, 2)
                  .join(''),
                bio: val('bio'),
                status: val('status'),
              })
              .eq('id', selfId()),
          );
          await refreshCore();
          toast('Профиль сохранён.');
          break;
        }
        case 'edit-channel': {
          const name = val('name').toLowerCase().replace(/\s+/g, '-');
          if (!name) return toast('Введите название.');
          await checked(
            client
              .from('voxel_channels')
              .update({
                name,
                category: val('category'),
                description: val('description'),
              })
              .eq('id', ui.channelId),
          );
          ui.modal = null;
          await refreshCore();
          toast('Канал обновлён.');
          break;
        }
        case 'edit-server': {
          await checked(
            client
              .from('voxel_servers')
              .update({
                name: val('name'),
                icon: val('icon'),
                description: val('description'),
              })
              .eq('id', ui.serverId),
          );
          ui.modal = null;
          await refreshCore();
          break;
        }
        default:
          break;
      }
    } catch (e) {
      fail(e);
    } finally {
      pendingForms.delete(formToken);
      if (submit && submit.isConnected) submit.disabled = false;
    }
  }
  // All controls are delegated so that re-rendered screens remain interactive.
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    if (el.dataset.action === 'overlay' && e.target !== el) return;
    e.preventDefault();
    safeSend(() => act(el.dataset.action, el));
  });
  document.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-form]');
    if (!form) return;
    e.preventDefault();
    safeSend(() => formSubmit(form));
  });
  document.addEventListener('input', (e) => {
    if (e.target.dataset.volume)
      voice.setVolume(e.target.dataset.volume, Number(e.target.value) / 100);
    if (e.target.id === 'compose-text') drafts.set(threadKey(), e.target.value);
    if (e.target.name === 'friendSearch') {
      ui.search = e.target.value;
      filterPeople();
    }
  });
  document.addEventListener('change', (e) => {
    if (e.target.matches('[data-mic]')) safeSend(() => voice.switchMic(e.target.value));
    if (e.target.matches('[data-role-user]')) {
      const id = e.target.dataset.roleUser,
        role = e.target.value;
      safeSend(async () => {
        try {
          await checked(
            client.rpc('voxel_set_role', {
              p_server: ui.serverId,
              p_user: id,
              p_role: role,
            }),
          );
        } catch (error) {
          render();
          throw error;
        }
        await refreshCore();
        toast('Роль изменена.');
      });
    }
    if (e.target.matches('[data-setting]')) {
      const key = e.target.dataset.setting,
        val = e.target.checked;
      safeSend(async () => {
        if (!['theme', 'compact', 'notifications'].includes(key)) return;
        try {
          await checked(
            client
              .from('voxel_profiles')
              .update({
                [key]: key === 'theme' ? (val ? 'night' : 'dark') : val,
              })
              .eq('id', selfId()),
          );
        } catch (error) {
          render();
          throw error;
        }
        await refreshCore();
      });
    }
  });
  document.addEventListener('keydown', (e) => {
    if (document.getElementById('community-dialog').open) return;
    if (e.key === 'Tab' && ui.modal) {
      const controls = [
        ...document.querySelectorAll(
          '.modal button:not(:disabled),.modal input,.modal select,.modal textarea',
        ),
      ];
      if (
        controls.length &&
        ((e.shiftKey && e.target === controls[0]) || (!e.shiftKey && e.target === controls.at(-1)))
      ) {
        e.preventDefault();
        controls[e.shiftKey ? controls.length - 1 : 0].focus();
        return;
      }
    }
    if (e.key === 'Escape' && ui.modal) {
      ui.modal = null;
      render();
    }
    if (e.key === 'Enter' && !e.shiftKey && e.target.matches('#compose-text') && !e.isComposing) {
      e.preventDefault();
      e.target.closest('form')?.requestSubmit();
    }
  });
  function statusText(p) {
    return (
      { online: 'В сети', idle: 'Отошёл', offline: 'Статус скрыт' }[p?.status] || 'Статус скрыт'
    );
  }
  function filterPeople() {
    const cards = [...document.querySelectorAll('[data-person]')];
    let shown = 0;
    for (const card of cards) {
      card.hidden = !card.dataset.person.includes(ui.search.toLowerCase().trim());
      if (!card.hidden) shown++;
    }
    const empty = $('#no-matches');
    if (empty) empty.hidden = !cards.length || shown > 0;
  }
  function channelLinks() {
    const groups = new Map();
    for (const c of data.channels.filter((c) => c.server_id === ui.serverId)) {
      if (!groups.has(c.category)) groups.set(c.category, []);
      groups.get(c.category).push(c);
    }
    return (
      [...groups]
        .map(
          ([name, rows]) =>
            `<div class="category-name">${esc(name)}</div>${rows.map((c) => `<button data-action="open-channel" data-id="${c.id}" class="side-link ${ui.pane === 'chat' && ui.channelId === c.id ? 'selected' : ''}"><span class="hash">#</span><span>${esc(c.name)}</span>${community.count(c.id, false)}</button>`).join('')}`,
        )
        .join('') || '<p class="side-muted">Каналов пока нет.</p>'
    );
  }
  function renderInbox() {
    if (!inbox.length && !community.mentionRows())
      return '<div class="empty"><h2>Здесь пока тихо</h2><p>Здесь появятся новые заявки в друзья и личные сообщения.</p></div>';
    return `<div class="inbox-list">${inbox.some((a) => !a.seen) || community.mentionCount() ? button('seen-all', 'Отметить все прочитанными', 'subtle') : ''}${community.mentionRows()}${inbox.map((a) => `<button class="alert-row ${a.seen ? '' : 'unseen'}" data-action="open-alert" data-id="${a.id}">${avatar(prof(a.actor_id), 'sm')}<span><b>${esc(prof(a.actor_id)?.display_name || 'Участник')}</b><small>${a.dm_id ? 'Личное сообщение' : 'Заявка в друзья'} · ${new Date(a.created_at).toLocaleDateString('ru-RU')} ${when(a.created_at)}</small></span></button>`).join('')}</div>`;
  }
  function voiceChip() {
    return voice.call
      ? `<button class="call-chip" data-action="current-call" title="Вернуться в комнату">${svgIcon('mic')}<span>В эфире</span></button>`
      : '';
  }
  function refreshVoiceControls() {
    if ($('#voice-chip')) $('#voice-chip').innerHTML = voiceChip();
    if ($('#voice-view')) {
      const screens = [...document.querySelectorAll('#voice-view video[data-screen]')];
      $('#voice-view').innerHTML = voiceView();
      for (const video of screens) {
        document
          .querySelector('video[data-screen="' + CSS.escape(video.dataset.screen) + '"]')
          ?.replaceWith(video);
      }
      voice.bindVideos();
      community.hydrate();
    }
  }
  function voiceView() {
    const call = voice.call,
      here = call?.server === ui.serverId;
    const states = {
      connecting: 'Подключение…',
      new: 'Подключение…',
      connected: 'На связи',
      disconnected: 'Связь потеряна',
      failed: 'Нет прямого соединения',
      closed: 'Отключён',
    };
    const controls = here
      ? button('voice-mute', call.muted ? 'Включить микрофон' : 'Выключить микрофон', 'subtle') +
        button('voice-leave', 'Выйти из комнаты', 'danger')
      : call
        ? button('current-call', 'К текущему разговору', 'subtle')
        : voice.joining
          ? '<button class="btn" disabled>Подключение…</button>'
          : button('voice-join', 'Войти с микрофоном', 'primary');
    return `<div class="voice-hero"><span class="voice-symbol">${svgIcon('mic')}</span><span class="overline">${esc(srv(ui.serverId)?.name)} / ГОЛОС</span><h1>Общая комната</h1><p>${here ? 'Участников ' + call.people.length + ' из 4.' : call ? 'Ты уже в другой комнате.' : 'До четырёх участников. Для входа понадобится микрофон.'}</p><div class="voice-buttons">${controls}${here && navigator.mediaDevices?.getDisplayMedia ? button('voice-screen', voice.sharing(call.session) ? 'Завершить показ' : 'Показать экран', 'subtle') : ''}</div>${here && !navigator.mediaDevices?.getDisplayMedia ? '<p class="help">Показ экрана доступен в поддерживаемых браузерах на ПК.</p>' : ''}${here && voice.devices.length ? `<label>Микрофон <select data-mic><option value="">По умолчанию</option>${voice.devices.map((d, i) => `<option value="${esc(d.deviceId)}" ${voice.deviceId === d.deviceId ? 'selected' : ''}>${esc(d.label || 'Микрофон ' + (i + 1))}</option>`).join('')}</select></label>` : ''}</div>${
      here
        ? `<div class="people-list">${call.people.map((p) => `<div class="person-card voice-person" data-level="${p.session}">${avatar(prof(p.user))}<div class="person-info"><strong>${esc(prof(p.user)?.display_name || 'Участник')}${p.user === selfId() ? ' · ты' : ''}</strong><span>${(p.user === selfId() ? call.muted : p.muted) ? 'Микрофон выключен' : p.user === selfId() ? 'Микрофон включён' : states[voice.connection(p.session)]}</span></div>${p.user !== selfId() ? `<label>Громкость <input type="range" data-volume="${p.session}" min="0" max="100" value="${Math.round(voice.volume(p.session) * 100)}"></label>` : ''}</div>`).join('')}</div>${`<div class="screen-grid">${call.people
            .filter((p) => voice.sharing(p.session))
            .map(
              (p) =>
                `<figure><video autoplay muted playsinline controls data-screen="${p.session}"></video><figcaption>Экран · ${esc(community.nickname(p.user, ui.serverId))}</figcaption></figure>`,
            )
            .join(
              '',
            )}</div>`}${call.warning ? `<p class="help">${esc(call.warning)}</p>` : ''}${voice.blocked() ? button('voice-audio', 'Включить звук', 'primary') : ''}`
        : ''
    }`;
  }
  function svgIcon(name) {
    const paths = {
      users:
        '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3c2 0 4 2 4 5"/>',
      chat: '<path d="M4 4h16v12H9l-5 4V4Z"/><path d="M8 8h8m-8 4h5"/>',
      plus: '<path d="M12 4v16M4 12h16"/>',
      bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 20a2 2 0 0 0 4 0"/>',
      refresh:
        '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5 9a8 8 0 0 1 13-4l2 3M4 16l2 3a8 8 0 0 0 13-4"/>',
      settings:
        '<path d="m9 3 1-1h4l1 3 3 1 3 1-1 4 1 4-3 2-3 1-1 3h-4l-1-3-3-1-3-2 1-4-1-4 3-1 3-1Z"/><circle cx="12" cy="11.5" r="3"/>',
      mic: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
      search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    };
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
  }
  if ('serviceWorker' in navigator && location.protocol.startsWith('http'))
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  init();
})();
