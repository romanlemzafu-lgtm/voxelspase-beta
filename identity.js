// Profile gallery, private media and community controls. All mutations go through Supabase.
window.createVoxelCommunity = function createVoxelCommunity(api) {
  const { esc, rpc, checked, toast } = api;
  const state = () => api.state(),
    db = () => state().client,
    uid = () => state().user?.id;
  const dlg = document.getElementById('community-dialog'),
    body = dlg.querySelector('.v4-content');
  const notes = {
    crew: [
      'Mzdiffone Crew',
      'Участник первой коллаборации VoxelSpase × Mzdiffone',
      'Коллекционное',
    ],
    alpha: ['Alpha-Number', 'Ты был здесь, когда всё начиналось', 'Эксклюзивное'],
    step: ['Первый шаг', 'Заполни имя и описание профиля.', 'Обычное'],
    chat: ['На связи!', 'Отправь первое сообщение в канале или личной переписке.', 'Обычное'],
    world: ['Создатель миров', 'Создай свой первый сервер.', 'Редкое'],
    voice: ['Проверка связи', 'Установи связь с другим участником голосовой комнаты.', 'Редкое'],
    bug: [
      'Охотник за багами',
      'Помоги подтвердить ошибку. Награду выдаёт администрация.',
      'Эпическое',
    ],
    ally: ['Первый союз', 'Прими заявку в друзья или получи ответ на свою.', 'Обычное'],
    legend: ['Легенда VoxelSpase', 'За значительный вклад в развитие сообщества.', 'Легендарное'],
  };
  let awards = [],
    roles = [],
    unread = [],
    mentions = [],
    staff = false,
    ballots = [],
    fileMeta = new Map();
  let generation = 0,
    dialogTicket = 0,
    context = null,
    recording = null,
    recordToken = 0,
    draft = null,
    busy = false;
  const blobCache = new Map(),
    pending = new Map(),
    readClock = new Map();
  const button = (act, label, extra = '', klass = 'subtle') =>
    `<button type="button" class="btn ${klass}" data-v4="${act}" ${extra}>${label}</button>`;
  const ident = (id) => `data-id="${esc(id)}"`;
  const validId = (id) => /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id || '');
  const color = (v) => (/^#[a-f0-9]{6}$/i.test(v) ? v : '#A78BFA');
  const member = (sid, id) =>
    state().data.members.find((x) => x.server_id === sid && x.user_id === id);
  const role = (sid, id) =>
    roles.find((r) => r.server_id === sid && r.id === member(sid, id)?.custom_role);
  function perm(sid, key) {
    const base = member(sid, uid())?.role;
    return (
      ['owner', 'admin'].includes(base) ||
      (base === 'moderator' && key === 'moderate') ||
      Boolean(role(sid, uid())?.perms.includes(key))
    );
  }
  function nickname(id, sid) {
    return member(sid, id)?.nickname || api.prof(id)?.display_name || 'Участник';
  }
  const scope = () => ({
    dm: state().ui.space === 'home',
    id: state().ui.space === 'home' ? state().ui.dmId : state().ui.channelId,
    server: state().ui.serverId,
  });
  const nfmt = (n) => '№' + String(n).padStart(4, '0');
  function badge(code, size = 24, award = null) {
    if (!notes[code]) return '';
    const key = code === 'alpha' && award?.serial <= 10 && award?.serial ? 'alpha-gold' : code;
    return `<img class="achievement-icon" width="${size}" height="${size}" alt="${esc(notes[code][0])}" src="./assets/badges/${key}.${['alpha', 'crew'].includes(code) ? 'svg' : 'webp'}">`;
  }
  function pinned(p, size = 16) {
    return (p?.badge_pins || [])
      .map(
        (code) =>
          `<button type="button" class="tiny-badge" data-v4="badge" data-code="${esc(code)}" ${ident(p.id)} title="${esc(notes[code]?.[0])}">${badge(
            code,
            size,
            awards.find((a) => a.user_id === p.id && a.badge === code),
          )}</button>`,
      )
      .join('');
  }
  async function core(ids) {
    const chunks = [];
    for (let i = 0; i < ids.length; i += 60)
      chunks.push(
        checked(
          db()
            .from('vs_awards')
            .select('*')
            .in('user_id', ids.slice(i, i + 60)),
        ),
      );
    const [groups, r, u, m, s] = await Promise.all([
      Promise.all(chunks),
      api.fetchPages('vs_roles', '*', ['id']),
      rpc('vs_unread', {}),
      rpc('vs_mention_feed', {}),
      rpc('vs_is_staff', {}),
    ]);
    return () => {
      awards = groups.flat();
      roles = r;
      unread = u;
      mentions = m;
      staff = s;
    };
  }
  async function thread(rows) {
    const files = [...new Set(rows.map((x) => x.file_id).filter(Boolean))],
      polls = rows.filter((x) => x.choices).map((x) => x.id);
    const metadata = [],
      votes = [];
    for (let i = 0; i < files.length; i += 60)
      metadata.push(
        ...(await checked(
          db()
            .from('vs_files')
            .select('id,filename,mime,kind,bytes')
            .in('id', files.slice(i, i + 60)),
        )),
      );
    for (let i = 0; i < polls.length; i += 40) {
      const result = await rpc('vs_poll_counts', {
        p_ids: polls.slice(i, i + 40),
      });
      votes.push(...result);
    }
    return () => {
      fileMeta = new Map(metadata.map((f) => [f.id, f]));
      ballots = votes;
    };
  }
  function mark(scopeInfo, stamp) {
    if (!stamp || document.visibilityState !== 'visible') return;
    const k = [uid(), scopeInfo.dm, scopeInfo.id].join('/');
    if (readClock.get(k) >= stamp) return;
    readClock.set(k, stamp);
    rpc('vs_seen', {
      p_target: scopeInfo.id,
      p_dm: scopeInfo.dm,
      p_stamp: stamp,
    })
      .then(() => {
        const old = unread.length;
        unread = unread.filter((r) => r.target !== scopeInfo.id || r.dm !== scopeInfo.dm);
        if (unread.length !== old) api.redraw();
      })
      .catch(() => readClock.delete(k));
  }
  const count = (id, dm) => {
    const n = unread.find((r) => r.target === id && r.dm === dm)?.n || 0;
    return n ? `<b class="read-count">${n > 99 ? '99+' : n}</b>` : '';
  };
  function crop(p, k) {
    return `object-position:${Number(p[k + '_x'] ?? 50)}% ${Number(p[k + '_y'] ?? 50)}%;transform-origin:${Number(p[k + '_x'] ?? 50)}% ${Number(p[k + '_y'] ?? 50)}%;transform:scale(${Number(p[k + '_zoom'] ?? 100) / 100})`;
  }
  function photo(p, k) {
    const local =
        p.motion_off || matchMedia('(prefers-reduced-motion: reduce)').matches
          ? p['_still_' + k] || p['_local_' + k]
          : p['_local_' + k],
      id = p[k + '_file'];
    if (!local && !validId(id)) return '';
    return `<img alt="" class="profile-photo" ${local ? `src="${esc(local)}"` : `data-private="${id}"`} style="${crop(p, k)}">`;
  }
  function avatar(p, sz = 'md') {
    if (!p) return '<span class="avatar">?</span>';
    return `<span class="avatar portrait ${sz} frame-${esc(p.frame || 'none')}" style="--accent:${color(p.accent)}"><span class="photo-mask"><span>${esc(p.avatar || '🚀')}</span>${photo(p, 'avatar')}</span></span>`;
  }
  function preview(p) {
    const sid = state().ui.space === 'server' ? state().ui.serverId : null,
      r = role(sid, p.id),
      m = member(sid, p.id);
    return `<section class="profile-sheet skin-${esc(p.skin || 'nebula')}" style="--accent:${color(p.accent)}"><div class="profile-cover">${photo(p, 'banner')}</div><div class="sheet-info">${avatar(p, 'lg')}
    <div class="sheet-badges">${pinned(p, 24)}</div><h2>${esc(p.display_name)} <small>${esc(p.flair || '')}</small></h2><p>@${esc(p.username)}</p>
    ${p.user_status ? `<div class="user-status">${esc(p.user_status)}</div>` : ''}${p.bio ? `<div class="sheet-bio">${esc(p.bio)}</div>` : ''}
    ${m ? `<div class="role-pill" style="--accent:${color(r?.color)}">${esc(m.nickname ? m.nickname + ' · ' : '')}${esc(r ? r.icon + ' ' + r.name : api.roleLabel(m.role))}</div>` : ''}
    <small>В VoxelSpase с ${new Date(p.created_at).toLocaleDateString('ru-RU')}</small></div></section>`;
  }
  function closeRecord() {
    recordToken++;
    if (recording) {
      const r = recording;
      recording = null;
      r.cancelled = true;
      if (r.url) URL.revokeObjectURL(r.url);
      if (r.rec.state !== 'inactive') r.rec.stop();
      r.stream.getTracks().forEach((t) => t.stop());
      clearTimeout(r.timer);
    }
  }
  function releaseDraft() {
    if (draft)
      for (const k of ['_local_avatar', '_local_banner', '_still_avatar', '_still_banner'])
        if (draft[k]) URL.revokeObjectURL(draft[k]);
    draft = null;
  }
  function reset() {
    generation++;
    closeRecord();
    releaseDraft();
    context = null;
    busy = false;
    dialogTicket++;
    if (dlg.open) dlg.close();
    body.innerHTML = '';
    for (const e of blobCache.values()) URL.revokeObjectURL(e.url);
    blobCache.clear();
    pending.clear();
    awards = [];
    roles = [];
    mentions = [];
    unread = [];
    fileMeta.clear();
    readClock.clear();
  }
  function show(title, html, type, info = {}) {
    dialogTicket++;
    closeRecord();
    if (type !== 'studio') releaseDraft();
    context = { ...info, type };
    dlg.querySelector('.v4-status').textContent = '';
    dlg.querySelector('h1').textContent = title;
    body.innerHTML = html;
    if (inlineHost && dlg.parentNode !== inlineHost) inlineHost.appendChild(dlg);
    if (!dlg.open) {
      if (inlineHost) dlg.show();
      else dlg.showModal();
    }
    body.scrollTop = 0;
    hydrate();
  }
  dlg.addEventListener('close', () => {
    if (dlg.open) return;
    const wasInline = inlineHost;
    mountKey = null;
    if (wasInline) inlineOnClose?.();
    dialogTicket++;
    context = null;
    closeRecord();
    releaseDraft();
    body.innerHTML = '';
  });
  dlg.addEventListener('cancel', (e) => {
    if (busy) e.preventDefault();
  });
  function err(e) {
    toast(e?.message || 'Не удалось выполнить действие');
  }
  async function imageStill(blob) {
    const url = URL.createObjectURL(blob);
    try {
      const im = new Image();
      im.src = url;
      await im.decode();
      const c = document.createElement('canvas');
      const scale = Math.min(1, 1500 / Math.max(im.width, im.height));
      c.width = Math.max(1, Math.round(im.width * scale));
      c.height = Math.max(1, Math.round(im.height * scale));
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      return await new Promise((yes, no) =>
        c.toBlob((b) => (b ? yes(b) : no(Error('Кадр недоступен'))), 'image/png'),
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  async function blobUrl(id, still = false) {
    if (!validId(id) || !uid()) throw Error('Файл недоступен');
    const gen = generation,
      k = [uid(), id, still].join('/'),
      cached = blobCache.get(k);
    if (cached && Date.now() - cached.time < 90000) return cached.url;
    if (pending.has(k)) return pending.get(k);
    const promise = (async () => {
      const blob = await checked(db().storage.from('voxel-v04').download(id));
      const media = still && blob.type.startsWith('image/') ? await imageStill(blob) : blob;
      if (gen !== generation) throw Error('Сеанс завершён');
      const url = URL.createObjectURL(media);
      if (cached) URL.revokeObjectURL(cached.url);
      blobCache.set(k, { url, time: Date.now() });
      for (const [key, entry] of blobCache) {
        if (blobCache.size <= 60) break;
        if (!document.querySelector(`[src="${entry.url}"]`)) {
          URL.revokeObjectURL(entry.url);
          blobCache.delete(key);
        }
      }
      return url;
    })();
    pending.set(k, promise);
    try {
      return await promise;
    } finally {
      pending.delete(k);
    }
  }
  function hydrate() {
    const still =
      !!state().me?.motion_off || matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const el of document.querySelectorAll('[data-private]')) {
      const key = el.dataset.private + '-' + still;
      if (el.dataset.loaded === key) continue;
      el.dataset.loaded = key;
      blobUrl(el.dataset.private, still && el.tagName === 'IMG')
        .then((url) => {
          if (el.isConnected && el.dataset.loaded === key) el.src = url;
        })
        .catch(() => {
          if (el.isConnected) {
            el.removeAttribute('src');
            el.dataset.loaded = '';
            el.alt = 'Файл недоступен';
          }
        });
    }
  }
  async function upload(file, kind, scopeId, name = file.name) {
    const limit = kind === 'emoji' ? 1048576 : kind === 'avatar' ? 4194304 : 8388608;
    if (!file.size || file.size > limit)
      throw Error('Максимальный размер — ' + limit / 1048576 + ' МБ');
    const params = new URLSearchParams({ kind, name });
    if (scopeId) params.set('scope', scopeId);
    return mediaRequest('/api/media?' + params, 'POST', file);
  }
  async function mediaRequest(path, method, file) {
    const auth = await checked(db().auth.getSession());
    if (!auth.session) throw Error('Требуется вход');
    const r = await fetch(path, {
      method,
      headers: {
        Authorization: 'Bearer ' + auth.session.access_token,
        'X-Publishable-Key': window.VOXEL_CONFIG.publishableKey,
      },
      body: file,
    });
    const j = await r.json().catch(() => ({
      error: 'Сервер загрузки вернул неожиданный ответ. Повтори запрос.',
    }));
    if (!r.ok) throw Error(j.error || 'Ошибка Storage');
    return j;
  }
  async function retire(id) {
    if (validId(id)) return mediaRequest('/api/media?id=' + id, 'DELETE');
  }
  async function person(id) {
    const p = api.prof(id);
    if (!p) return;
    show(
      'Профиль',
      preview(p) +
        `<div class="v4-actions">${button('collection', 'Коллекция', ident(id))}${id === uid() ? button('studio', 'Изменить оформление', '', 'primary') : ''}</div>` +
        (id !== uid() ? api.profileActions(id) : ''),
      'person',
      { id },
    );
  }
  function collection(id) {
    const owned = awards.filter((a) => a.user_id === id);
    show(
      'Коллекция достижений',
      `<div class="collection-head"><b>${esc(api.prof(id)?.display_name)}</b><span>${owned.length} из ${Object.keys(notes).length}</span></div><div class="badge-grid">${Object.entries(
        notes,
      )
        .map(([code, [title, , rarity]]) => {
          const a = owned.find((item) => item.badge === code);
          return `<button class="badge-tile ${a ? 'earned' : 'locked'}" data-v4="badge" data-code="${code}" ${ident(id)}>${badge(code, 58, a)}<strong>${title}</strong><small>${a ? (a.serial ? nfmt(a.serial) : rarity) : 'Пока закрыто'}</small></button>`;
        })
        .join(
          '',
        )}</div>${id === uid() && owned.some((a) => a.badge === 'alpha') ? button('early', 'Ранние обновления') : ''}`,
      'collection',
      { id },
    );
  }
  function detail(id, code) {
    const a = awards.find((x) => x.user_id === id && x.badge === code),
      p = api.prof(id);
    if (!notes[code]) return;
    const [name, desc, rarity] = notes[code];
    show(
      name,
      `<div class="badge-detail">${badge(code, 96, a)}<p class="rarity">${rarity}${a?.serial ? ' · ' + nfmt(a.serial) : ''}</p><h2>${name}</h2><p>${desc}</p>${code === 'alpha' ? '<ul><li>Ранние обновления VoxelSpase</li><li>Эксклюзивный значок профиля</li><li>Личный номер из 100</li><li>Секретная привилегия 🤫</li></ul>' : ''}<small>${a ? 'Получено ' + new Date(a.awarded_at).toLocaleDateString('ru-RU') : 'Пока не получено'}</small></div><div class="v4-actions">${button('collection', 'К коллекции', ident(id))}${a && id === uid() ? button('pin-badge', (p.badge_pins || []).includes(code) ? 'Открепить' : 'Закрепить у имени', `data-code="${code}"`, 'primary') : ''}</div>`,
      'badge',
      { id, code },
    );
  }
  function select(name, choices, current) {
    return `<select name="${name}">${choices.map(([v, label]) => `<option value="${esc(v)}" ${String(current) === String(v) ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
  }
  function sliders(k) {
    return `<details><summary>Кадрирование</summary>${[
      ['x', 'По горизонтали', 0, 100],
      ['y', 'По вертикали', 0, 100],
      ['zoom', 'Масштаб', 100, 200],
    ]
      .map(
        ([field, label, min, max]) =>
          `<label>${label}<input type="range" name="${k}_${field}" min="${min}" max="${max}" value="${draft[k + '_' + field] ?? (min || 50)}"></label>`,
      )
      .join('')}</details>`;
  }
  function studio() {
    releaseDraft();
    draft = { ...state().me };
    show(
      'Студия профиля',
      `<form class="studio-grid" data-vform="studio"><div id="identity-preview">${preview(draft)}</div><div class="form-fields">
    ${[
      ['avatar', 'Аватар', '4'],
      ['banner', 'Баннер', '8'],
    ]
      .map(
        ([k, title, mb]) =>
          `<fieldset><legend>${title}</legend><label class="file-label">Выбрать изображение<input type="file" data-picture="${k}" accept="image/png,image/jpeg,image/gif,image/webp"></label><small>PNG, JPG, WebP, GIF · до ${mb} МБ</small> ${button('clear-picture', 'Убрать', `data-kind="${k}"`, 'small')}${sliders(k)}</fieldset>`,
      )
      .join('')}
    <label>Статус с эмодзи<input name="user_status" maxlength="90" value="${esc(draft.user_status)}" placeholder="🎮 Собираю команду"></label>
    <label>Тема${select(
      'skin',
      [
        ['nebula', 'Туманность'],
        ['aurora', 'Полярное сияние'],
        ['dusk', 'Сумерки'],
      ],
      draft.skin,
    )}</label>
    <label>Рамка${select(
      'frame',
      [
        ['none', 'Без рамки'],
        ...(awards.some((a) => a.user_id === uid() && a.badge === 'crew')
          ? [['crew', 'Mzdiffone Crew']]
          : []),
        ['orbit', 'Орбита'],
        ['pixel', 'Пиксель'],
        ['halo', 'Сияние'],
      ],
      draft.frame,
    )}</label>
    <label>Украшение${select('flair', [['', 'Без украшения'], ...['✦', '☾', '⚡', '❄'].map((x) => [x, x])], draft.flair)}</label><label>Цвет акцента<input type="color" name="accent" value="${color(draft.accent)}"></label>
    <label class="setting-row">Отключить анимации<input type="checkbox" name="motion_off" ${draft.motion_off ? 'checked' : ''}></label>
    <button type="submit" class="btn primary">Сохранить оформление</button></div></form>`,
      'studio',
    );
  }
  function updatePreview() {
    const el = document.getElementById('identity-preview');
    if (el && draft) {
      el.innerHTML = preview(draft);
      hydrate();
    }
  }
  async function saveStudio() {
    const snapshot = { ...draft },
      fresh = [];
    let committed = false;
    try {
      for (const k of ['avatar', 'banner'])
        if (snapshot['_file_' + k]) {
          const f = await upload(snapshot['_file_' + k], k, null);
          snapshot[k + '_file'] = f.id;
          fresh.push(f.id);
        }
      const design = {};
      for (const k of [
        'accent',
        'skin',
        'frame',
        'user_status',
        'flair',
        'motion_off',
        'avatar_x',
        'avatar_y',
        'banner_x',
        'banner_y',
        'avatar_zoom',
        'banner_zoom',
      ])
        design[k] = snapshot[k];
      const old = await rpc('vs_design', {
        p_design: design,
        p_avatar: snapshot.avatar_file || null,
        p_banner: snapshot.banner_file || null,
      });
      committed = true;
      const retired = await Promise.allSettled(
        (old || [])
          .filter((id) => id && id !== snapshot.avatar_file && id !== snapshot.banner_file)
          .map(retire),
      );
      await api.refresh();
      await person(uid());
      toast(
        retired.some((x) => x.status === 'rejected')
          ? 'Оформление сохранено. Очистка старого файла требует повтора.'
          : 'Оформление сохранено',
      );
    } catch (e) {
      if (!committed) await Promise.allSettled(fresh.map(retire));
      throw e;
    }
  }
  function messageExtra(m, dm) {
    const f = fileMeta.get(m.file_id);
    const media = !f
      ? ''
      : f.mime.startsWith('image/')
        ? `<button class="chat-media ${f.kind === 'emoji' ? 'emoji-file' : ''}" data-v4="open-file" ${ident(f.id)}><img data-private="${f.id}" alt="${esc(f.filename)}"></button>`
        : f.mime.startsWith('audio/')
          ? `<audio controls preload="none" data-private="${f.id}" aria-label="Голосовое сообщение"></audio>`
          : button('download', 'Скачать · ' + esc(f.filename), ident(f.id));
    const poll = m.choices
      ? `<div class="poll">${m.choices
          .map((text, i) => {
            const result = ballots.find((v) => v.message_id === m.id && v.choice === i + 1);
            return button(
              'vote',
              esc(text) + ` <b>${result?.votes || 0}${result?.mine ? ' ✓' : ''}</b>`,
              ident(m.id) + ` data-choice="${i + 1}"`,
              'poll-opt',
            );
          })
          .join('')}</div>`
      : '';
    return (m.pinned ? '<small class="pinned-label">Закреплено</small>' : '') + media + poll;
  }
  function toolsSheet() {
    const s = scope();
    show(
      'Инструменты переписки',
      `<div class="tool-grid">
    ${button('attachment', 'Прикрепить файл')}${button('record', 'Голосовое сообщение')}${button('find', 'Найти сообщение')}${button('pins', 'Закреплённые сообщения')}
    ${s.dm ? '' : button('poll', 'Создать опрос') + button('emojis', 'Эмодзи сервера') + button('mention', 'Упомянуть участника')}</div>`,
      'tools',
      s,
    );
  }
  function fileForm(s) {
    show(
      'Прикрепить файл',
      `<form class="form-fields" data-vform="attach"><label>Изображение или документ<input name="file" type="file" accept="image/png,image/jpeg,image/gif,image/webp,.pdf,.txt" required></label><small>PNG, JPG, GIF, WebP, PDF или TXT · до 8 МБ</small><button type="submit" class="btn primary">Отправить в чат</button></form>`,
      'attach',
      s,
    );
  }
  async function sendFile(file, s) {
    const f = await upload(file, s.dm ? 'dm' : 'channel', s.id);
    try {
      await rpc('vs_post_file', { p_id: f.id, p_channel: null });
    } catch (e) {
      await retire(f.id).catch(() => {});
      throw e;
    }
    dlg.close();
    await api.thread();
    toast('Отправлено');
  }
  function recordForm(s) {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
      throw Error('Браузер не поддерживает запись с микрофона.');
    show(
      'Голосовое сообщение',
      `<p class="help">Запиши до двух минут. Перед отправкой запись можно прослушать.</p><div id="rec-state">${button('rec-start', 'Начать запись', '', 'primary')}</div>`,
      'record',
      s,
    );
  }
  async function startRecord() {
    const token = ++recordToken;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (context?.type !== 'record' || token !== recordToken) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    const type = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find((t) =>
      MediaRecorder.isTypeSupported(t),
    );
    if (!type) {
      stream.getTracks().forEach((t) => t.stop());
      throw Error('Нет поддерживаемого кодека записи');
    }
    let rec;
    try {
      rec = new MediaRecorder(stream, {
        mimeType: type,
        audioBitsPerSecond: 48000,
      });
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      throw e;
    }
    const r = { stream, rec, parts: [], cancelled: false };
    recording = r;
    rec.ondataavailable = (e) => {
      if (e.data.size) r.parts.push(e.data);
    };
    rec.onstop = () => {
      clearTimeout(r.timer);
      stream.getTracks().forEach((t) => t.stop());
      if (r.cancelled || context?.type !== 'record') return;
      const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
      r.file = new File(r.parts, ['Голосовое сообщение.', ext].join(''), {
        type: type.split(';')[0],
      });
      r.url = URL.createObjectURL(r.file);
      document.getElementById('rec-state').innerHTML =
        `<audio controls src="${r.url}"></audio><div class="v4-actions">${button('rec-send', 'Отправить запись', '', 'primary')}${button('rec-again', 'Записать заново')}</div>`;
    };
    rec.onerror = () => {
      closeRecord();
      err(Error('Запись прервана'));
    };
    rec.start(500);
    r.timer = setTimeout(() => {
      if (rec.state === 'recording') rec.stop();
    }, 120000);
    document.getElementById('rec-state').innerHTML =
      `<p class="recording-dot">Идёт запись</p>${button('rec-stop', 'Остановить запись')}`;
  }
  async function emojiSheet(s) {
    const rows = await checked(
      db()
        .from('vs_files')
        .select('id,filename')
        .eq('kind', 'emoji')
        .eq('scope', s.server)
        .eq('retired', false)
        .order('created_at', { ascending: false })
        .limit(100),
    );
    show(
      'Эмодзи сервера',
      `<div class="emoji-grid">${rows.map((f) => `<div><button title="${esc(f.filename)}" data-v4="send-emoji" ${ident(f.id)}><img data-private="${f.id}" alt="${esc(f.filename)}"></button>${perm(s.server, 'emoji') ? button('delete-emoji', 'Удалить', ident(f.id), 'small') : ''}</div>`).join('') || '<p class="help">Своих эмодзи пока нет.</p>'}</div>
     ${perm(s.server, 'emoji') ? `<form class="form-fields" data-vform="emoji"><label>Название<input name="name" maxlength="30" required></label><label>Изображение до 1 МБ<input type="file" name="file" accept="image/png,image/jpeg,image/webp,image/gif" required></label><button type="submit" class="btn primary">Добавить эмодзи</button></form>` : ''}`,
      'emojis',
      s,
    );
  }
  async function search(s, onlyPins, query = '') {
    const rows =
      onlyPins || query
        ? await rpc('vs_find', {
            p_target: s.id,
            p_dm: s.dm,
            p_query: query,
            p_pins: onlyPins,
          })
        : [];
    show(
      onlyPins ? 'Закреплённые сообщения' : 'Поиск в переписке',
      `${onlyPins ? '' : `<form data-vform="search" class="form-fields"><label>Текст сообщения<input name="query" type="search" required maxlength="120" value="${esc(query)}"></label><button type="submit" class="btn primary">Найти</button></form>`}
    <div class="search-results">${rows.map((m) => `<article><small>${esc(nickname(m.sender_id, s.dm ? null : s.server))} · ${new Date(m.created_at).toLocaleString('ru-RU')}</small><p>${esc(m.body)}</p></article>`).join('') || (query || onlyPins ? '<p class="help">Сообщений не найдено.</p>' : '')}</div>`,
      'search',
      s,
    );
  }
  const rights = [
    ['channels', 'Каналы и категории'],
    ['moderate', 'Модерация сообщений'],
    ['invite', 'Настройки приглашений'],
    ['emoji', 'Эмодзи сервера'],
    ['kick', 'Исключения и блокировки'],
    ['roles', 'Назначение младших ролей'],
  ];
  function management(sid) {
    const server = state().data.servers.find((s) => s.id === sid),
      own = member(sid, uid())?.role === 'owner';
    if (!server) return;
    const serverRoles = roles.filter((r) => r.server_id === sid).sort((a, b) => b.rank - a.rank);
    show(
      'Управление сообществом',
      `<h2>${esc(server.name)}</h2><form class="form-fields" data-vform="nickname"><label>Моё имя на сервере<input name="nickname" maxlength="40" value="${esc(member(sid, uid())?.nickname || '')}"></label><button class="btn" type="submit">Сохранить имя</button></form>
    <h3>Роли</h3><div class="role-stack">${serverRoles.map((r) => `<div class="role-pill" style="--accent:${color(r.color)}">${esc(r.icon + ' ' + r.name)} · ${r.rank} ${own ? button('role-edit', 'Изменить', ident(r.id), 'small') : ''}</div>`).join('') || '<small>Собственных ролей пока нет.</small>'}</div><div class="v4-actions">${own ? button('role-edit', 'Создать роль') : ''}${perm(sid, 'kick') || perm(sid, 'roles') ? button('member-admin', 'Управление участниками') : ''}${perm(sid, 'moderate') || perm(sid, 'kick') || perm(sid, 'roles') ? button('audit', 'Журнал модерации') : ''}</div>
    ${
      perm(sid, 'invite')
        ? `<h3>Приглашения</h3><p class="help">${server.invites_open ? 'Открыты' : 'Приостановлены'}${server.invite_until ? ' · до ' + new Date(server.invite_until).toLocaleString('ru-RU') : ''}</p><form class="form-fields" data-vform="invite-settings"><label>Приём участников${select(
            'open',
            [
              ['yes', 'Открыт'],
              ['no', 'Приостановлен'],
            ],
            server.invites_open ? 'yes' : 'no',
          )}</label><label>Срок с момента сохранения${select(
            'hours',
            [
              ['0', 'Без срока'],
              ['1', '1 час'],
              ['24', 'Сутки'],
              ['168', 'Неделя'],
            ],
            0,
          )}</label><button type="submit" class="btn">Обновить приглашение</button></form>`
        : ''
    }
    ${
      perm(sid, 'channels')
        ? `<h3>Категории</h3><form class="form-fields" data-vform="category"><label>Категория${select(
            'old',
            [
              ...new Set(
                state()
                  .data.channels.filter((c) => c.server_id === sid)
                  .map((c) => c.category),
              ),
            ].map((c) => [c, c]),
            '',
          )}</label><label>Новое название<input name="name" required maxlength="32"></label><button type="submit" class="btn">Переименовать категорию</button></form>`
        : ''
    }`,
      'management',
      { server: sid },
    );
  }
  function roleForm(sid, id) {
    const r = roles.find((r) => r.id === id) || {
      name: '',
      color: '#A78BFA',
      icon: '✦',
      rank: 1,
      perms: [],
    };
    show(
      'Настройки роли',
      `<form class="form-fields" data-vform="role"><label>Название<input name="name" value="${esc(r.name)}" maxlength="30" required></label><label>Цвет<input type="color" name="color" value="${color(r.color)}"></label><label>Значок<input name="icon" maxlength="8" value="${esc(r.icon)}"></label><label>Уровень иерархии (1–90)<input type="number" name="rank" min="1" max="90" required value="${r.rank}"></label><fieldset><legend>Разрешения</legend>${rights.map(([k, l]) => `<label class="setting-row">${l}<input type="checkbox" name="perms" value="${k}" ${r.perms.includes(k) ? 'checked' : ''}></label>`).join('')}</fieldset><button type="submit" class="btn primary">Сохранить роль</button></form>${id ? button('role-delete', 'Удалить роль', ident(id), 'danger') : ''}`,
      'role',
      { server: sid, roleId: id || null },
    );
  }
  async function memberAdmin(sid) {
    const people = state().data.members.filter(
      (m) => m.server_id === sid && m.user_id !== uid() && m.role !== 'owner',
    );
    const bans = perm(sid, 'kick')
      ? await checked(db().from('vs_bans').select('user_id').eq('server_id', sid))
      : [];
    show(
      'Управление участниками',
      `<form class="form-fields" data-vform="member-admin"><label>Участник${select(
        'person',
        people.map((m) => [m.user_id, nickname(m.user_id, sid)]),
        '',
      )}</label>
     <label>Действие${select(
       'action',
       [
         ...(perm(sid, 'roles') ? [['role', 'Назначить роль']] : []),
         ...(perm(sid, 'kick')
           ? [
               ['kick', 'Исключить'],
               ['ban', 'Заблокировать'],
             ]
           : []),
       ],
       '',
     )}</label>
     ${perm(sid, 'roles') ? `<label>Назначаемая роль${select('role', [['', 'Снять собственную роль'], ...roles.filter((r) => r.server_id === sid).map((r) => [r.id, r.name])], '')}</label>` : ''}
     ${people.length ? '<button class="btn primary" type="submit">Применить</button>' : '<p class="help">Нет других участников.</p>'}</form>
     ${bans.length ? '<h3>Блокировки</h3>' + bans.map((b) => button('unban', esc(api.prof(b.user_id)?.display_name || b.user_id) + ' · Разблокировать', ident(b.user_id))).join('') : ''}`,
      'member-admin',
      { server: sid },
    );
  }
  async function adminAwards() {
    show(
      'Выдача коллекционной награды',
      `<form class="form-fields" data-vform="grant"><label>@username допущенного участника<input name="username" required></label><label>Награда${select(
        'badge',
        [
          ['alpha', 'Alpha-Number'],
          ['bug', 'Охотник за багами'],
          ['legend', 'Легенда VoxelSpase'],
        ],
        'alpha',
      )}</label><button type="submit" class="btn primary">Выдать награду</button></form>`,
      'admin',
    );
  }
  function mentionList(s) {
    show(
      'Упомянуть участника',
      state()
        .data.members.filter((m) => m.server_id === s.server && m.user_id !== uid())
        .map((m) => button('mention-insert', esc(nickname(m.user_id, s.server)), ident(m.user_id)))
        .join('') || '<p>В канале пока только ты.</p>',
      'mention',
      s,
    );
  }
  function mentionRows() {
    return mentions
      .map(
        (n) =>
          `<button class="alert-row ${n.seen ? '' : 'unseen'}" data-v4="open-mention" ${ident(n.id)}><span><b>Тебя упомянули</b><small>${esc(n.body)}</small></span></button>`,
      )
      .join('');
  }
  async function action(act, el) {
    const id = el.dataset.id,
      code = el.dataset.code,
      s = context || scope();
    switch (act) {
      case 'close':
        dlg.close();
        break;
      case 'person':
        return person(id);
      case 'studio':
        return studio();
      case 'collection':
        return collection(id || uid());
      case 'badge':
        return detail(id, code);
      case 'pin-badge': {
        const pins = state().me.badge_pins || [];
        await rpc('vs_pin_badges', {
          p_badges: pins.includes(code) ? pins.filter((x) => x !== code) : [...pins, code],
        });
        await api.refresh();
        return detail(uid(), code);
      }
      case 'early': {
        const news = await checked(
          db()
            .from('vs_alpha_news')
            .select('title,body,created_at')
            .order('created_at', { ascending: false })
            .limit(30),
        );
        return show(
          'Ранние обновления',
          news
            .map((n) => `<article><h2>${esc(n.title)}</h2><p>${esc(n.body)}</p></article>`)
            .join('') ||
            '<p class="help">Доступ открыт. Объявления альфа-теста появятся здесь.</p>',
          'early',
        );
      }
      case 'admin':
        return adminAwards();
      case 'clear-picture': {
        const k = el.dataset.kind;
        if (!draft) return;
        if (draft['_local_' + k]) URL.revokeObjectURL(draft['_local_' + k]);
        if (draft['_still_' + k]) URL.revokeObjectURL(draft['_still_' + k]);
        draft['_still_' + k] = null;
        draft[k + '_file'] = null;
        draft['_file_' + k] = null;
        draft['_local_' + k] = null;
        body.querySelector(`[data-picture="${k}"]`).value = '';
        return updatePreview();
      }
      case 'tools':
        return toolsSheet();
      case 'attachment':
        return fileForm(s);
      case 'record':
        return recordForm(s);
      case 'rec-start':
        return startRecord();
      case 'rec-again':
        closeRecord();
        return recordForm(s);
      case 'rec-stop':
        if (recording?.rec.state === 'recording') recording.rec.stop();
        break;
      case 'rec-send':
        if (recording?.file) await sendFile(recording.file, s);
        break;
      case 'poll':
        return show(
          'Опрос в канале',
          '<form class="form-fields" data-vform="poll"><label>Вопрос<input name="question" maxlength="200" required></label><label>Варианты · по одному в строке<textarea name="choices" rows="5" placeholder="Первый вариант\nВторой вариант" required></textarea></label><small>От 2 до 6 вариантов. Голос можно изменить.</small><button type="submit" class="btn primary">Опубликовать опрос</button></form>',
          'poll',
          s,
        );
      case 'vote':
        await rpc('vs_vote', {
          p_message: id,
          p_choice: Number(el.dataset.choice),
        });
        return api.thread();
      case 'pin-message':
        await rpc('vs_pin_message', {
          p_id: id,
          p_dm: scope().dm,
          p_pin: el.dataset.pin === 'true',
        });
        return api.thread();
      case 'find':
        return search(s, false);
      case 'pins':
        return search(s, true);
      case 'emojis':
        return emojiSheet(s);
      case 'send-emoji':
        await rpc('vs_post_file', { p_id: id, p_channel: s.id });
        dlg.close();
        return api.thread();
      case 'delete-emoji':
        if (confirm('Удалить эмодзи с сервера?')) {
          await retire(id);
          await emojiSheet(s);
        }
        break;
      case 'open-file': {
        const f = fileMeta.get(id);
        if (!f) return;
        return show(
          f.filename,
          `<img class="lightbox" data-private="${id}" alt="${esc(f.filename)}">${button('download', 'Скачать', ident(id))}`,
          'lightbox',
          { file: f },
        );
      }
      case 'download': {
        const f = fileMeta.get(id) || context?.file;
        if (!f) return;
        const a = document.createElement('a');
        a.download = f.filename;
        a.href = await blobUrl(id);
        a.click();
        break;
      }
      case 'mention':
        return mentionList(s);
      case 'mention-insert': {
        dlg.close();
        const input = document.getElementById('compose-text');
        if (input) {
          input.setRangeText(
            '@' + api.prof(id).username + ' ',
            input.selectionStart,
            input.selectionEnd,
            'end',
          );
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.focus();
        }
        break;
      }
      case 'open-mention': {
        const n = mentions.find((n) => n.id === id);
        if (!n) return;
        await checked(db().from('vs_mentions').update({ seen: true }).eq('id', id));
        await api.server(n.server_id, n.channel_id);
        await api.refresh();
        break;
      }
      case 'management':
        return management(state().ui.serverId);
      case 'role-edit':
        return roleForm(s.server, id);
      case 'role-delete':
        if (confirm('Удалить роль у всех участников?')) {
          await rpc('vs_role_delete', { p_server: s.server, p_role: id });
          await api.refresh();
          management(s.server);
        }
        break;
      case 'member-admin':
        return memberAdmin(s.server);
      case 'unban':
        await rpc('vs_member_action', {
          p_server: s.server,
          p_user: id,
          p_action: 'unban',
          p_role: null,
        });
        return memberAdmin(s.server);
      case 'audit': {
        const items = await checked(
          db()
            .from('vs_audit')
            .select('*')
            .eq('server_id', s.server)
            .order('created_at', { ascending: false })
            .limit(80),
        );
        return show(
          'Журнал модерации',
          items
            .map(
              (a) =>
                `<article><small>${new Date(a.created_at).toLocaleString('ru-RU')} · ${esc(api.prof(a.actor)?.display_name || 'Система')}</small><p>${esc(a.event)} · ${esc(api.prof(a.detail)?.display_name || a.detail)}</p></article>`,
            )
            .join('') || '<p>Записей пока нет.</p>',
          'audit',
          { server: s.server },
        );
      }
    }
  }
  async function submit(form) {
    const fd = new FormData(form),
      v = (k) => String(fd.get(k) || '').trim(),
      s = context;
    switch (form.dataset.vform) {
      case 'studio':
        return saveStudio();
      case 'attach':
        return sendFile(fd.get('file'), s);
      case 'search':
        return search(s, false, v('query'));
      case 'emoji':
        await upload(fd.get('file'), 'emoji', s.server, v('name'));
        return emojiSheet(s);
      case 'poll':
        await rpc('vs_poll', {
          p_channel: s.id,
          p_question: v('question'),
          p_choices: v('choices')
            .split(/\r?\n/)
            .map((x) => x.trim())
            .filter(Boolean),
        });
        dlg.close();
        return api.thread();
      case 'grant': {
        const p = await checked(
          db()
            .from('voxel_profiles')
            .select('id,username')
            .eq('username', v('username').replace(/^@/, '').toLowerCase())
            .single(),
        );
        if (!confirm('Выдать ' + notes[v('badge')][0] + ' участнику @' + p.username + '?')) return;
        await rpc('vs_admin_award', { p_user: p.id, p_badge: v('badge') });
        await api.refresh();
        toast('Награда выдана');
        dlg.close();
        return;
      }
      case 'nickname':
        await rpc('vs_nickname', { p_server: s.server, p_name: v('nickname') });
        break;
      case 'category':
        await rpc('vs_category', {
          p_server: s.server,
          p_old: v('old'),
          p_new: v('name'),
        });
        break;
      case 'invite-settings':
        await rpc('vs_invites', {
          p_server: s.server,
          p_open: v('open') === 'yes',
          p_hours: Number(v('hours')),
        });
        break;
      case 'role':
        await rpc('vs_role_save', {
          p_server: s.server,
          p_id: s.roleId,
          p_name: v('name'),
          p_color: v('color'),
          p_icon: v('icon'),
          p_rank: Number(v('rank')),
          p_perms: fd.getAll('perms'),
        });
        break;
      case 'member-admin':
        if (!confirm('Применить действие к выбранному участнику?')) return;
        await rpc('vs_member_action', {
          p_server: s.server,
          p_user: v('person'),
          p_action: v('action'),
          p_role: v('role') || null,
        });
        break;
      default:
        return;
    }
    await api.refresh();
    management(s.server);
    toast('Изменения сохранены');
  }
  async function run(work) {
    if (busy) return;
    busy = true;
    dlg.setAttribute('aria-busy', 'true');
    try {
      await work();
    } catch (e) {
      err(e);
    } finally {
      busy = false;
      dlg.removeAttribute('aria-busy');
    }
  }
  document.addEventListener(
    'click',
    (e) => {
      const el = e.target.closest('[data-v4]');
      if (el) {
        e.preventDefault();
        e.stopImmediatePropagation();
        void run(() => action(el.dataset.v4, el));
      } else if (dlg.contains(e.target)) {
        const base = e.target.closest('[data-action]');
        if (base) {
          e.stopImmediatePropagation();
          e.preventDefault();
          dlg.close();
          void run(() => api.act(base.dataset.action, base));
        }
      }
    },
    true,
  );
  dlg.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-vform]');
    if (f) {
      e.preventDefault();
      e.stopPropagation();
      void run(() => submit(f));
    }
  });
  dlg.addEventListener('input', (e) => {
    if (!draft || !e.target.closest('[data-vform=studio]') || !e.target.name) return;
    draft[e.target.name] =
      e.target.type === 'checkbox'
        ? e.target.checked
        : e.target.type === 'range'
          ? Number(e.target.value)
          : e.target.value;
    updatePreview();
  });
  dlg.addEventListener('change', async (e) => {
    const k = e.target.dataset.picture,
      f = e.target.files?.[0];
    if (!k || !f || !draft) return;
    const current = draft,
      input = e.target,
      save = input.form.querySelector('button[type=submit]');
    current.loading = (current.loading || 0) + 1;
    save.disabled = true;
    try {
      if (f.size > (k === 'avatar' ? 4194304 : 8388608)) throw Error('Изображение превышает лимит');
      const u = URL.createObjectURL(f),
        im = new Image();
      im.src = u;
      try {
        await im.decode();
      } catch {
        URL.revokeObjectURL(u);
        throw Error('Изображение не читается');
      }
      const still = await imageStill(f);
      if (current !== draft || input.files?.[0] !== f) {
        URL.revokeObjectURL(u);
        return;
      }
      if (draft['_still_' + k]) URL.revokeObjectURL(draft['_still_' + k]);
      draft['_still_' + k] = URL.createObjectURL(still);
      if (draft['_local_' + k]) URL.revokeObjectURL(draft['_local_' + k]);
      draft['_file_' + k] = f;
      draft['_local_' + k] = u;
      updatePreview();
    } catch (error) {
      if (input.files?.[0] === f) input.value = '';
      err(error);
    } finally {
      current.loading--;
      if (current === draft) save.disabled = current.loading > 0;
    }
  });
  let inlineHost = null,
    mountKey = null,
    inlineOnClose = null;
  function inlineSync(host, kind, id) {
    const key = kind + ':' + (id || '');
    inlineHost = host;
    host.appendChild(dlg);
    dlg.style.display = '';
    if (mountKey !== key) {
      mountKey = key;
      if (kind === 'studio') studio();
      else if (kind === 'collection') collection(id);
    }
  }
  function inlineLeave() {
    if (!inlineHost && !dlg.open && dlg.parentNode === document.body) return;
    inlineHost = null;
    mountKey = null;
    if (dlg.open) dlg.close();
    dlg.style.display = 'none';
    document.body.appendChild(dlg);
  }
  return {
    unreadTotal: () => unread.reduce((a, r) => a + (r.n || 0), 0),
    inlineSync,
    inlineLeave,
    setInlineClose: (fn) => {
      inlineOnClose = fn;
    },
    rolePill: (s, id) => {
      const r = role(s, id);
      return r
        ? `<b class="role-pill" style="--accent:${color(r.color)}">${esc(r.icon + ' ' + r.name)}</b>`
        : '';
    },
    core,
    thread,
    mark,
    count,
    perm,
    nickname,
    avatar,
    pinned,
    person,
    button,
    messageExtra,
    hydrate,
    reset,
    mentionRows,
    mentionCount: () => mentions.filter((n) => !n.seen).length,
    markMentions: () =>
      checked(
        db().from('vs_mentions').update({ seen: true }).eq('recipient', uid()).eq('seen', false),
      ),
    staff: () => staff,
    scope,
  };
};
