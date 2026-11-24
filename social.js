/* Social & Community. Database mutations use v0.5 RPCs and RLS. */
window.createVoxelSocial = function (api) {
  const formDrafts = new Map();
  function rememberForm(event) {
    const field = event.target,
      form = field.closest('[data-social-form]');
    if (form && field.name)
      formDrafts.set(section + '/' + form.dataset.socialForm + '/' + field.name, field.value);
  }
  document.addEventListener('input', rememberForm);
  document.addEventListener('change', rememberForm);
  const { esc, rpc, checked, toast } = api;
  const titles = {
    discover: 'Discover',
    creators: 'Creators',
    premium: 'Premium',
    news: 'Новости',
    events: 'События',
    feedback: 'Обратная связь',
  };
  const categories = {
    games: 'Игры',
    streamers: 'Стримеры',
    development: 'Разработка',
    chat: 'Общение',
    creative: 'Творчество',
  };
  const statuses = {
    review: 'Рассматривается',
    planned: 'Запланировано',
    progress: 'В разработке',
    fixed: 'Исправлено',
    rejected: 'Отклонено',
  };
  let section = 'discover',
    rows = [],
    extra = [],
    staff = false,
    busy = false,
    error = '',
    query = '',
    category = '',
    editor = null,
    ticket = 0;
  const state = api.state;
  const uid = () => state().user?.id;
  const table = (name) =>
    api.fetchPages(
      name,
      '*',
      name.endsWith('_votes')
        ? [name === 'vs5_news_votes' ? 'news_id' : 'feedback_id', 'user_id']
        : name === 'vs5_rsvps'
          ? ['event_id', 'user_id']
          : name === 'vs5_redemptions'
            ? ['user_id', 'code']
            : name === 'vs5_creators'
              ? ['slug']
              : ['created_at', 'id'],
    );
  const button = (action, label, id = '', style = '') =>
    `<button type="button" class="btn ${style}" data-social="${action}" data-id="${esc(id)}">${esc(label)}</button>`;
  const input = (name, label, value = '', type = 'text', required = true) =>
    `<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${required ? 'required' : ''} maxlength="${name === 'title' ? 140 : 4000}"></label>`;
  const area = (name, label, value = '') =>
    `<label>${esc(label)}<textarea name="${name}" maxlength="4000" required rows="3">${esc(value)}</textarea></label>`;
  const select = (name, options, value = '') =>
    `<select name="${name}">${Object.entries(options)
      .map(
        ([k, v]) => `<option value="${esc(k)}" ${k === value ? 'selected' : ''}>${esc(v)}</option>`,
      )
      .join('')}</select>`;
  const date = (d) =>
    new Date(d).toLocaleString('ru-RU', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  const form = (name, body) =>
    `<form class="social-form form-fields" data-social-form="${name}">${body}<button class="btn primary" type="submit">Сохранить</button></form>`;
  const mineServers = () =>
    Object.fromEntries(
      state()
        .data.servers.filter((s) => s.owner_id === uid())
        .map((s) => [s.id, s.name]),
    );
  const managedServers = () =>
    Object.fromEntries(
      state()
        .data.servers.filter((s) =>
          state().data.members.some(
            (m) =>
              m.server_id === s.id && m.user_id === uid() && ['owner', 'admin'].includes(m.role),
          ),
        )
        .map((s) => [s.id, s.name]),
    );
  const safeLink = (url, label) =>
    /^https:\/\/(www\.)?(twitch\.tv\/|clips\.twitch\.tv\/)/.test(url || '')
      ? `<a class="btn" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`
      : '';
  function render() {
    let content = '';
    if (busy) content = '<div class="social-empty" role="status">Загружаем…</div>';
    else if (error)
      content = `<div class="social-empty" role="alert"><h2>Не удалось загрузить раздел</h2><p>${esc(error)}</p>${button('reload', 'Повторить')}</div>`;
    else if (section === 'discover') {
      content = `<form class="social-search" data-social-form="search"><input name="query" type="search" placeholder="Найти своё сообщество" aria-label="Поиск серверов" value="${esc(query)}" maxlength="80">${select('category', { '': 'Все категории', ...categories }, category)}<button class="btn primary">Найти</button></form><div class="social-grid">${rows.map((s) => `<article class="social-card"><div class="social-cover"><span>${esc(s.icon)}</span><small>${esc(categories[s.category])}</small></div><h2>${esc(s.name)}</h2><p>${esc(s.description || 'Сообщество VoxelSpase')}</p><small>${s.member_count} участников</small><div class="social-actions">${button('info', 'Подробнее', s.id)}${button(s.joined ? 'open' : 'join', s.joined ? 'Открыть' : 'Вступить', s.id, 'primary')}</div></article>`).join('')}</div>${!rows.length ? empty('Серверов пока нет', 'Попробуй другой запрос или опубликуй свой сервер.') : ''}<details class="social-card"><summary>Видимость моего сервера</summary>${Object.keys(mineServers()).length ? form('listing', `<label>Сервер${select('server', mineServers())}</label><label>Категория${select('category', categories)}</label><label>Видимость${select('listed', { false: 'Приватный', true: 'Публичный' })}</label><p>Публичная карточка доступна участникам VoxelSpase. Переписка остаётся доступна только участникам сервера.</p>`) : '<p>Создай сервер через кнопку + в меню.</p>'}</details>`;
    } else if (section === 'premium') {
      const redeemed = rows.some((r) => r.code === 'MZDIFFONE');
      content = `<article class="social-card premium-card"><span class="social-kicker">VOXELSPASE × MZDIFFONE</span><h2>Твоя история начинается здесь</h2><p>Первые 200 активаций · один раз на аккаунт</p><ul><li>Постоянное достижение Mzdiffone Crew</li><li>Рамка Crew и стикерпак «Котость»</li><li>3 месяца Premium после запуска соответствующих возможностей</li></ul><p>Без карты и автоматических списаний.</p><section class="pr-hero" aria-labelledby="pr-hero-t"><span class="pr-kicker">VoxelSpase Premium</span><h3 id="pr-hero-t">Выдели свой профиль</h3><p class="pr-note">Здесь можно посмотреть, как будут выглядеть возможности Premium. Применить их к профилю пока нельзя: серверные права Premium ещё не подключены.</p><div class="pr-perks"><article class="pr-perk" data-tilt><span class="pr-perk-ico">✨</span><h4>Обводка баннера</h4><p>Бегущая, светящаяся или пульсирующая рамка вокруг баннера.</p><span class="pr-perk-tag">Скоро</span></article><article class="pr-perk" data-tilt><span class="pr-perk-ico">🎨</span><h4>Premium-темы</h4><p>Три эксклюзивные темы оформления профиля.</p><span class="pr-perk-tag">Скоро</span></article><article class="pr-perk" data-tilt><span class="pr-perk-ico">🏅</span><h4>Особые значки</h4><p>Значки, которые видно рядом с именем в сообществах.</p><span class="pr-perk-tag">Скоро</span></article></div><div class="pr-banner-box"><h4>Обводка баннера · предпросмотр</h4><div class="pr-modes" role="group" aria-label="Режим обводки"><button type="button" class="pr-mode on" data-pr-mode="run" aria-pressed="true">Бегущая</button><button type="button" class="pr-mode" data-pr-mode="glow" aria-pressed="false">Свечение</button><button type="button" class="pr-mode" data-pr-mode="pulse" aria-pressed="false">Пульс</button></div><div class="pr-banner-sample" data-mode="run"><div class="pr-banner-inner"><span class="pr-sample-av">🚀</span><b>Андрей</b><span>Предпросмотр</span></div></div><p class="pr-note">Обводка анимирована только в предпросмотре. При «уменьшить движение» она статичная.</p></div></section><section class="pr-themes" aria-labelledby="pr-th-t"><h3 id="pr-th-t">Premium-темы</h3><p class="pr-note">Предпросмотр на образце. Применить тему к профилю можно будет после подключения Premium-прав. Сейчас никто не получает темы без права.</p><div class="pr-theme-grid"><article class="pr-theme-card" data-theme-id="aurora"><div class="pr-sample" data-sample="aurora"><span class="pr-sample-av">🚀</span><b>Андрей</b><span>Aurora</span></div><div class="pr-theme-foot"><span>Aurora</span><button type="button" class="btn ghost sm" data-pr-preview="aurora">Предпросмотр</button></div></article><article class="pr-theme-card" data-theme-id="ember"><div class="pr-sample" data-sample="ember"><span class="pr-sample-av">🔥</span><b>Андрей</b><span>Ember</span></div><div class="pr-theme-foot"><span>Ember</span><button type="button" class="btn ghost sm" data-pr-preview="ember">Предпросмотр</button></div></article><article class="pr-theme-card" data-theme-id="glacier"><div class="pr-sample" data-sample="glacier"><span class="pr-sample-av">❄️</span><b>Андрей</b><span>Glacier</span></div><div class="pr-theme-foot"><span>Glacier</span><button type="button" class="btn ghost sm" data-pr-preview="glacier">Предпросмотр</button></div></article></div><p class="pr-lock" role="note">🔒 Применение доступно только с Premium. Сейчас недоступно.</p></section><section class="pr-compare" aria-labelledby="pr-cmp-t"><h3 id="pr-cmp-t">Обычный аккаунт и Premium</h3><p class="pr-note">Статусы честные: «Уже есть» — работает сейчас, «Скоро» — в разработке, Premium-прав пока никому не выдаём.</p><div class="pr-table" role="table"><div class="pr-row pr-head" role="row"><span role="columnheader">Возможность</span><span role="columnheader">Обычный</span><span role="columnheader">Premium</span></div><div class="pr-row" role="row" style="--d:0"><span role="cell">Темы профиля</span><span role="cell" class="ok">Уже есть</span><span role="cell" class="soon">Эксклюзивные — скоро</span></div><div class="pr-row" role="row" style="--d:1"><span role="cell">Рамки аватара</span><span role="cell" class="ok">Уже есть</span><span role="cell" class="soon">Анимированные — скоро</span></div><div class="pr-row" role="row" style="--d:2"><span role="cell">Значки профиля</span><span role="cell" class="ok">Коллекция</span><span role="cell" class="soon">Особые — скоро</span></div><div class="pr-row" role="row" style="--d:3"><span role="cell">Промокод MZDIFFONE</span><span role="cell" class="ok">По коду, проверка на сервере</span><span role="cell" class="ok">То же самое</span></div><div class="pr-row" role="row" style="--d:4"><span role="cell">Реферальная награда</span><span role="cell" class="soon">Скоро</span><span role="cell" class="soon">Скоро</span></div><div class="pr-row" role="row" style="--d:5"><span role="cell">Оплата</span><span role="cell">Не подключена, списаний нет</span><span role="cell">Не подключена, списаний нет</span></div></div></section><div class="ref-card" aria-live="polite"><span class="social-kicker">Реферальная программа</span><h3>Пригласи друга — получи 1 день Premium</h3><p>Личная ссылка-приглашение и история подтверждённых приглашений появятся, когда подключим серверную часть. Сейчас награды не начисляются и ничего не активируется.</p><ul><li>Награда только после подтверждённой регистрации нового пользователя.</li><li>Одна награда за одного пользователя, самоприглашения не засчитываются.</li></ul><button type="button" class="btn" disabled aria-disabled="true">Скоро</button></div>${redeemed ? '<p class="social-success">Промокод активирован. Будущий бонус зарезервирован. Premium ещё не запущен.</p>' + button('crew-frame', 'Применить рамку Crew') + button('crew-badge', 'Закрепить Crew') : form('promo', input('code', 'Промокод', 'MZDIFFONE'))}</article>${redeemed ? `<article class="social-card"><h2>Стикерпак «Котость»</h2><div class="sticker-gallery">${['hello', 'cozy', 'play', 'sleep'].map((k) => `<figure><img src="./assets/stickers/${k}.svg" alt="Котость ${k}"><figcaption>${button('sticker', 'Отправить', k)}</figcaption></figure>`).join('')}</div><p>Для отправки выбери чат в появившейся форме.</p>${editor?.sticker ? form('sticker', `<label>Канал${select('channel', Object.fromEntries(state().data.channels.map((c) => [c.id, (state().data.servers.find((s) => s.id === c.server_id)?.name || '') + ' / ' + c.name])))}</label><input type="hidden" name="sticker" value="${esc(editor.sticker)}">`) : ''}</article>` : ''}`;
    } else if (section === 'creators') {
      const c = rows[0];
      content = `<article class="social-card creator-card"><span class="social-kicker">VOXELSPASE CREATORS</span><h2>Mzdiffone <span class="partner-badge">✦ Официальный партнёр VoxelSpase</span></h2><p>${esc(c?.bio || 'Первый участник программы Creators')}</p>${safeLink(c?.twitch, 'Открыть Twitch')}${c?.server_id ? button('partner-server', 'Официальный сервер', c.server_id) : '<p>Сервер партнёра ещё не привязан администрацией.</p>'}</article><div class="social-grid">${extra.map((p) => `<article class="social-card"><small>${esc({ news: 'Анонс', stream: 'Расписание', clip: 'Клип' }[p.kind])}${p.starts_at ? ' · ' + esc(date(p.starts_at)) : ''}</small><h2>${esc(p.title)}</h2><p>${esc(p.body)}</p>${safeLink(p.url, 'Открыть на Twitch')}</article>`).join('')}</div>${!extra.length ? empty('Скоро увидимся', 'Подтверждённые анонсы, расписание и клипы появятся после публикации партнёром через администрацию.') : ''}${staff ? `<details class="social-card"><summary>Управление партнёром</summary>${!c?.server_id ? button('creator-create', 'Создать официальный публичный сервер Mzdiffone') : ''}${form('creator-server', `<label>Привязать собственный официальный сервер${select('server', mineServers())}</label>`)}${form('creator-post', input('title', 'Название') + area('body', 'Текст') + select('kind', { news: 'Анонс', stream: 'Трансляция', clip: 'Клип' }) + input('url', 'Ссылка Twitch', '', 'url', false) + input('start', 'Дата трансляции в твоём часовом поясе', '', 'datetime-local', false))}</details>` : ''}`;
    } else if (section === 'news') {
      content = `${staff ? button('news-new', 'Опубликовать новость', '', 'primary') : ''}${editor && staff ? newsForm() : ''}<div class="social-grid">${rows.map((n) => `<article class="social-card"><small>${esc({ update: 'Обновление', fix: 'Исправления', future: 'Планы', poll: 'Голосование' }[n.kind])} · ${esc(date(n.created_at))}${n.published ? '' : ' · Черновик'}</small><h2>${esc(n.title)}</h2><p>${esc(n.body)}</p>${n.kind === 'poll' ? n.options.map((opt, i) => button('news-vote', `${opt} · ${extra.filter((v) => v.news_id === n.id && v.choice === i).length}`, n.id + ':' + i)).join('') : ''}${staff ? button('news-edit', 'Редактировать', n.id) : ''}</article>`).join('')}</div>${!rows.length ? empty('Новости готовятся', 'Опубликованные обновления появятся здесь.') : ''}`;
    } else if (section === 'feedback') {
      content =
        form(
          'feedback',
          select('kind', {
            idea: 'Идея — видна всем',
            bug: 'Ошибка — автору и администрации',
          }) +
            input('title', 'Кратко') +
            area('body', 'Описание'),
        ) +
        `<p class="social-hint">До 5 обращений в час. Не отправляй пароли и секретные ключи.</p><div class="social-grid">${rows.map((f) => `<article class="social-card"><small>${f.kind === 'bug' ? 'Закрытый баг-репорт' : 'Предложение'} · ${esc(statuses[f.status])}</small><h2>${esc(f.title)}</h2><p>${esc(f.body)}</p>${f.kind === 'idea' ? button('idea-vote', 'Поддержать · ' + extra.filter((v) => v.feedback_id === f.id).length, f.id) : ''}${staff ? form('feedback-status', `<input type="hidden" name="id" value="${f.id}">${select('status', statuses, f.status)}`) : ''}</article>`).join('')}</div>`;
    } else if (section === 'events') {
      const managed = managedServers();
      content = `${Object.keys(managed).length ? `<details class="social-card"><summary>Создать событие</summary>${form('event', `<label>Сервер${select('server', managed)}</label>` + input('title', 'Название') + area('body', 'Описание') + input('start', 'Дата и время на твоём устройстве', '', 'datetime-local') + `<p>Часовой пояс устройства — ${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}. Участники увидят своё локальное время.</p>`)}</details>` : ''}<div class="social-grid">${rows
        .map((e) => {
          const attendees = extra.filter((r) => r.event_id === e.id);
          return `<article class="social-card"><small>${esc(state().data.servers.find((s) => s.id === e.server_id)?.name || 'Сервер')}</small><h2>${esc(e.title)}</h2><p>${esc(e.body)}</p><p>${esc(date(e.starts_at))} · ${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}</p><small>Организатор указал ${esc(e.timezone)}</small><p>${e.cancelled ? 'Событие отменено' : attendees.length + ' участников'}</p><details><summary>Список участников</summary>${attendees.map((r) => `<p>${esc(api.prof(r.user_id)?.display_name || 'Участник')}</p>`).join('') || '<p>Пока никого</p>'}</details>${!e.cancelled && new Date(e.starts_at) > new Date() ? button(attendees.some((r) => r.user_id === uid()) ? 'rsvp-no' : 'rsvp-yes', attendees.some((r) => r.user_id === uid()) ? 'Отменить участие' : 'Участвовать', e.id, 'primary') : ''}${managed[e.server_id] && !e.cancelled ? button('event-cancel', 'Отменить событие', e.id) : ''}${button('calendar', 'Сохранить в календарь', e.id)}</article>`;
        })
        .join(
          '',
        )}</div>${!rows.length ? empty('Встречи впереди', 'Здесь будут события твоих серверов.') : ''}<p class="social-hint">Автоматические фоновые напоминания ещё не подключены. Сохрани событие в свой календарь.</p>`;
    }
    return `<section class="content-scroll social-page"><div class="social-heading"><div><span class="social-kicker">SOCIAL & COMMUNITY · 0.5</span><h1>${titles[section]}</h1></div>${button('reload', 'Обновить')}</div><nav class="social-tabs" aria-label="Сообщество">${Object.entries(
      titles,
    )
      .map(([k, v]) => button('section', v, k, section === k ? 'primary' : ''))
      .join('')}</nav>${content}</section>`;
  }
  function empty(title, text) {
    return `<div class="social-empty"><h2>${title}</h2><p>${text}</p></div>`;
  }
  function newsForm() {
    const n = editor || {};
    return form(
      'news',
      input('title', 'Заголовок', n.title) +
        area('body', 'Текст', n.body) +
        select(
          'kind',
          {
            update: 'Обновление',
            fix: 'Исправления',
            future: 'Планы',
            poll: 'Опрос',
          },
          n.kind,
        ) +
        area(
          'options',
          'Варианты опроса — по одному в строке',
          (n.options || []).join('\n'),
        ).replace(' required', '') +
        select(
          'published',
          { true: 'Опубликовать', false: 'Черновик' },
          String(n.published ?? true),
        ),
    );
  }
  async function load() {
    const t = ++ticket,
      who = uid();
    busy = true;
    error = '';
    api.redraw();
    try {
      const isStaff = await rpc('vs_is_staff');
      let result,
        other = [];
      if (section === 'discover')
        result = await rpc('vs5_discover', {
          p_query: query,
          p_category: category,
        });
      if (section === 'premium') result = await table('vs5_redemptions');
      if (section === 'news')
        [result, other] = await Promise.all([table('vs5_news'), table('vs5_news_votes')]);
      if (section === 'feedback')
        [result, other] = await Promise.all([table('vs5_feedback'), table('vs5_feedback_votes')]);
      if (section === 'events')
        [result, other] = await Promise.all([table('vs5_events'), table('vs5_rsvps')]);
      if (section === 'creators')
        [result, other] = await Promise.all([table('vs5_creators'), table('vs5_creator_posts')]);
      if (t !== ticket || who !== uid()) return;
      staff = isStaff;
      rows = result || [];
      extra = other || [];
      rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    } catch (e) {
      if (t === ticket)
        error = /vs5_|schema cache|does not exist/.test(e.message)
          ? 'Для этого раздела нужна миграция 05-social-community.sql. Остальные разделы доступны.'
          : e.message;
    } finally {
      if (t === ticket && who === uid()) {
        busy = false;
        api.redraw();
      }
    }
  }
  function open(name = 'discover') {
    section = name;
    editor = null;
    state().ui.space = 'home';
    state().ui.pane = 'social';
    state().ui.sidebarOpen = false;
    void load();
  }
  async function action(name, id) {
    if (name === 'section') return open(id);
    if (name === 'reload') return load();
    if (name === 'info') {
      const s = rows.find((r) => r.id === id);
      editor = null;
      const d = document.getElementById('social-info');
      d.querySelector('h2').textContent = s.name;
      d.querySelector('p').textContent = s.description || 'Описание не добавлено';
      d.showModal();
      return;
    }
    if (name === 'open') return api.server(id);
    if (name === 'partner-server' && state().data.servers.some((s) => s.id === id))
      return api.server(id);
    if (name === 'join' || name === 'partner-server') {
      await rpc('vs5_join', { p_server: id });
      await api.refresh(false);
      return api.server(id);
    }
    if (name === 'creator-create') {
      await rpc('vs5_creator_server', { p_server: null });
      await api.refresh(false);
      return load();
    }
    if (name === 'news-new') {
      formDrafts.clear();
      editor = {};
      return api.redraw();
    }
    if (name === 'news-edit') {
      formDrafts.clear();
      editor = rows.find((r) => r.id === id);
      return api.redraw();
    }
    if (name === 'news-vote') {
      const [p_id, c] = id.split(':');
      await rpc('vs5_vote', { p_id, p_news: true, p_choice: Number(c) });
    }
    if (name === 'idea-vote') await rpc('vs5_vote', { p_id: id, p_news: false });
    if (name === 'rsvp-yes' || name === 'rsvp-no')
      await rpc('vs5_rsvp', { p_id: id, p_join: name === 'rsvp-yes' });
    if (name === 'event-cancel') {
      const e = rows.find((r) => r.id === id);
      await rpc('vs5_event_save', {
        p_id: id,
        p_server: e.server_id,
        p_title: e.title,
        p_body: e.body,
        p_start: e.starts_at,
        p_timezone: e.timezone,
        p_cancel: true,
      });
    }
    if (name === 'crew-frame') {
      await checked(
        state().client.from('voxel_profiles').update({ frame: 'crew' }).eq('id', uid()),
      );
      await api.refresh();
      toast('Рамка сохранена');
      return;
    }
    if (name === 'crew-badge') {
      const pins = state().me.badge_pins || [];
      if (!pins.includes('crew'))
        await rpc('vs_pin_badges', { p_badges: [...pins.slice(0, 2), 'crew'] });
      await api.refresh();
      return;
    }
    if (name === 'sticker') {
      editor = { sticker: id };
      return api.redraw();
    }
    if (name === 'calendar') {
      const e = rows.find((r) => r.id === id),
        stamp = (d) =>
          new Date(d)
            .toISOString()
            .replace(/[-:]/g, '')
            .replace(/\.\d{3}/, '');
      const clean = (v) =>
        String(v).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[,;]/g, '\\$&');
      const blob = new Blob(
        [
          `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//VoxelSpase//Events//RU\r\nBEGIN:VEVENT\r\nUID:${e.id}@voxelspase\r\nDTSTAMP:${stamp(new Date())}\r\nDTSTART:${stamp(e.starts_at)}\r\nSUMMARY:${clean(e.title)}\r\nDESCRIPTION:${clean(e.body)}\r\nSTATUS:${e.cancelled ? 'CANCELLED' : 'CONFIRMED'}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`,
        ],
        { type: 'text/calendar;charset=utf-8' },
      );
      const u = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = u;
      a.download = 'voxelspase-event.ics';
      a.click();
      setTimeout(() => URL.revokeObjectURL(u), 1000);
      return;
    }
    await load();
  }
  async function submit(formNode) {
    const f = new FormData(formNode),
      v = (k) => String(f.get(k) || '').trim(),
      type = formNode.dataset.socialForm;
    if (type === 'search') {
      query = v('query');
      category = v('category');
      return load();
    }
    if (type === 'listing')
      await rpc('vs5_listing', {
        p_server: v('server'),
        p_category: v('category'),
        p_listed: v('listed') === 'true',
      });
    if (type === 'promo') {
      await rpc('vs5_redeem', { p_code: v('code') });
      await api.refresh(false);
      toast('Активация подтверждена сервером. Награды сохранены.');
    }
    if (type === 'feedback')
      await rpc('vs5_feedback_add', {
        p_kind: v('kind'),
        p_title: v('title'),
        p_body: v('body'),
      });
    if (type === 'feedback-status')
      await rpc('vs5_feedback_status', {
        p_id: v('id'),
        p_status: v('status'),
      });
    if (type === 'news')
      await rpc('vs5_news_save', {
        p_id: editor?.id || null,
        p_title: v('title'),
        p_body: v('body'),
        p_kind: v('kind'),
        p_options:
          v('kind') === 'poll'
            ? v('options')
                .split('\n')
                .map((x) => x.trim())
                .filter(Boolean)
            : [],
        p_published: v('published') === 'true',
      });
    if (type === 'event')
      await rpc('vs5_event_save', {
        p_id: null,
        p_server: v('server'),
        p_title: v('title'),
        p_body: v('body'),
        p_start: new Date(v('start')).toISOString(),
        p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        p_cancel: false,
      });
    if (type === 'creator-post')
      await rpc('vs5_creator_post', {
        p_title: v('title'),
        p_body: v('body'),
        p_kind: v('kind'),
        p_url: v('url'),
        p_start: v('start') ? new Date(v('start')).toISOString() : null,
      });
    if (type === 'creator-server') await rpc('vs5_creator_server', { p_server: v('server') });
    if (type === 'sticker')
      await rpc('vs5_sticker', {
        p_channel: v('channel'),
        p_sticker: v('sticker'),
      });
    editor = null;
    formDrafts.clear();
    toast('Сохранено');
    await load();
  }
  let working = false;
  async function run(fn, el) {
    if (working) return;
    working = true;
    if (el) el.disabled = true;
    try {
      await fn();
    } catch (e) {
      toast(e.message || 'Не удалось выполнить действие');
    } finally {
      working = false;
      if (el?.isConnected) el.disabled = false;
    }
  }
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-social]');
    if (!el) return;
    e.preventDefault();
    void run(() => action(el.dataset.social, el.dataset.id), el);
  });
  document.addEventListener(
    'submit',
    (e) => {
      const f = e.target.closest('[data-social-form]');
      if (!f) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      void run(() => submit(f), f.querySelector('button[type=submit]'));
    },
    true,
  );
  return {
    hydrate() {
      document.querySelectorAll('[data-social-form] [name]').forEach((field) => {
        const key =
          section + '/' + field.closest('[data-social-form]').dataset.socialForm + '/' + field.name;
        if (formDrafts.has(key)) field.value = formDrafts.get(key);
      });
    },
    render,
    open,
    reset() {
      formDrafts.clear();
      ticket++;
      rows = [];
      extra = [];
      staff = false;
      editor = null;
      error = '';
    },
  };
};
