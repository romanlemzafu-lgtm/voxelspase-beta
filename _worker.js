// Advanced-mode Cloudflare Pages Worker. The secret is supplied only by the runtime.
const ORIGIN = 'https://rvwkydvrtxykbnumjflp.supabase.co';
const BUCKET = 'voxel-v04';
const LIMIT = 8 * 1024 * 1024;
const UUID = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const json = (value, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
function imageSize(w, h) {
  if (!w || !h || w > 8192 || h > 8192 || w * h > 24000000)
    fail('Слишком большие размеры изображения');
}
// Cloudflare Workers TextDecoder supports UTF-8 only. Convert bytes to a
// binary string explicitly for signature checks (no non-UTF-8 decoder).
function bytesToBinaryString(bytes) {
  let result = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return result;
}
function detect(bytes) {
  const b = bytes,
    n = b.length,
    v = new DataView(b.buffer, b.byteOffset, n);
  const starts = (at, s) =>
    at >= 0 && at + s.length <= n && [...s].every((c, i) => b[at + i] === c.charCodeAt(0));
  if (
    n > 32 &&
    b[0] === 137 &&
    starts(1, 'PNG\r\n\x1a\n') &&
    starts(12, 'IHDR') &&
    starts(n - 8, 'IEND')
  ) {
    imageSize(v.getUint32(16), v.getUint32(20));
    if (v.getUint32(8) !== 13) fail('Повреждённый заголовок PNG');
    let at = 8,
      hasData = false;
    while (at + 12 <= n) {
      const length = v.getUint32(at);
      if (at + 12 + length > n) break;
      if (starts(at + 4, 'IDAT') && length > 0) hasData = true;
      if (starts(at + 4, 'IEND') && length === 0 && at + 12 === n && hasData) return 'image/png';
      at += length + 12;
    }
    fail('Неполное изображение PNG');
  }
  if (n > 14 && (starts(0, 'GIF89a') || starts(0, 'GIF87a'))) {
    imageSize(v.getUint16(6, true), v.getUint16(8, true));
    let i = 13 + (b[10] & 128 ? 3 * (2 << (b[10] & 7)) : 0),
      frames = 0,
      pixels = 0;
    const blocks = () => {
      while (i < n) {
        const k = b[i++];
        if (!k) return;
        i += k;
      }
      fail('Повреждённый GIF');
    };
    while (i < n) {
      const tag = b[i++];
      if (tag === 59 && frames && i === n) return 'image/gif';
      if (tag === 33) {
        i++;
        blocks();
        continue;
      }
      if (tag !== 44 || i + 9 > n) break;
      const w = v.getUint16(i + 4, true),
        h = v.getUint16(i + 6, true);
      imageSize(w, h);
      if (++frames > 700 || (pixels += w * h) > 240000000) fail('GIF слишком сложный');
      const packed = b[i + 8];
      i += 9 + (packed & 128 ? 3 * (2 << (packed & 7)) : 0);
      i++;
      blocks();
    }
    fail('Повреждённый GIF');
  }
  if (n > 20 && b[0] === 255 && b[1] === 216 && b[n - 2] === 255 && b[n - 1] === 217) {
    let i = 2;
    while (i + 8 < n && b[i] === 255) {
      while (i < n && b[i] === 255) i++;
      if (i + 3 > n) fail('Повреждённый JPEG');
      const marker = b[i++],
        len = v.getUint16(i);
      if ([192, 193, 194].includes(marker)) {
        if (len < 8 || i + len > n) fail('Повреждённый JPEG');
        imageSize(v.getUint16(i + 5), v.getUint16(i + 3));
        return 'image/jpeg';
      }
      if (len < 2 || marker === 218) break;
      i += len;
    }
  }
  if (n >= 30 && starts(0, 'RIFF') && starts(8, 'WEBP') && v.getUint32(4, true) === n - 8) {
    if (starts(12, 'VP8X')) {
      imageSize(1 + b[24] + 256 * b[25] + 65536 * b[26], 1 + b[27] + 256 * b[28] + 65536 * b[29]);
      return 'image/webp';
    }
    if (starts(12, 'VP8L') && b[20] === 47) {
      const bits = v.getUint32(21, true);
      imageSize((bits & 16383) + 1, ((bits >>> 14) & 16383) + 1);
      return 'image/webp';
    }
    if (starts(12, 'VP8 ') && b[23] === 157 && b[24] === 1 && b[25] === 42) {
      imageSize(v.getUint16(26, true) & 16383, v.getUint16(28, true) & 16383);
      return 'image/webp';
    }
  }
  const prefix = bytesToBinaryString(b.subarray(0, 8192));
  if (starts(0, '%PDF-') && new TextDecoder().decode(b.slice(-1024)).includes('%%EOF'))
    return 'application/pdf';
  if (starts(0, 'OggS') && prefix.includes('OpusHead')) return 'audio/ogg';
  if (
    b[0] === 26 &&
    b[1] === 69 &&
    b[2] === 223 &&
    b[3] === 163 &&
    prefix.includes('webm') &&
    prefix.includes('A_OPUS') &&
    !prefix.includes('V_VP')
  )
    return 'audio/webm';
  if (starts(4, 'ftyp') && ['M4A ', 'isom', 'mp42', 'mp41'].some((s) => starts(8, s))) {
    const tail = bytesToBinaryString(b);
    if (tail.includes('soun') && !tail.includes('vide')) return 'audio/mp4';
  }
  try {
    const t = new TextDecoder('utf-8', { fatal: true }).decode(b);
    if (t.trim() && !/[\u0000-\u0008\u000e-\u001f]/u.test(t)) return 'text/plain';
  } catch {}
  fail('Формат файла не поддерживается или файл повреждён');
}
async function readBody(request) {
  if (Number(request.headers.get('Content-Length')) > LIMIT)
    fail('Максимальный размер — 8 МБ', 413);
  const chunks = [],
    reader = request.body?.getReader();
  let length = 0;
  if (!reader) fail('Пустой файл');
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > LIMIT) {
      await reader.cancel();
      fail('Максимальный размер — 8 МБ', 413);
    }
    chunks.push(value);
  }
  if (!length) fail('Пустой файл');
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of chunks) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = env.SUPABASE_URL || ORIGIN;
    const requestId = crypto.randomUUID();
    let stage = 'request';
    const upstream = async (target, options) => {
      try {
        return await fetch(target, { ...options, signal: AbortSignal.timeout(20000) });
      } catch (e) {
        // network failure or timeout: answer with a clear status instead of the generic message
        const timeout = e?.name === 'TimeoutError';
        fail(
          timeout ? 'Supabase не ответил за 20 секунд' : 'Не удалось связаться с Supabase',
          timeout ? 504 : 502,
        );
      }
    };
    if (url.pathname !== '/api/media') return env.ASSETS.fetch(request);
    try {
      if (request.headers.get('Origin') && request.headers.get('Origin') !== url.origin)
        fail('Недопустимый источник', 403);
      if (!['POST', 'DELETE'].includes(request.method)) fail('Метод недоступен', 405);
      const auth = request.headers.get('Authorization'),
        key = request.headers.get('X-Publishable-Key');
      if (!auth?.startsWith('Bearer ') || !key?.startsWith('sb_publishable_'))
        fail('Требуется вход', 401);
      const secret = env.VOXEL_STORAGE_SECRET;
      if (!secret) fail('В Cloudflare не настроена загрузка файлов', 503);
      const rpc = async (name, args) => {
        stage = 'rpc:' + name;
        const r = await upstream(origin + '/rest/v1/rpc/' + name, {
          method: 'POST',
          redirect: 'error',
          headers: {
            apikey: key,
            Authorization: auth,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(args),
        });
        if (!r.ok) {
          const detail = await r.json().catch(() => ({}));
          // 5xx from Supabase is a server problem, not a denied file
          const code = r.status === 401 ? 401 : r.status >= 500 ? 502 : 403;
          fail(detail?.message || (code === 502 ? 'Supabase временно недоступен' : 'Доступ к файлу закрыт'), code);
        }
        return r.status === 204 ? null : r.text().then((t) => (t ? JSON.parse(t) : null));
      };
      const headers = { apikey: secret };
      if (!secret.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + secret;
      const path = (id) => origin + '/storage/v1/object/' + BUCKET + '/' + id;
      if (request.method === 'DELETE') {
        const id = url.searchParams.get('id');
        if (!UUID.test(id)) fail('Неверный файл');
        await rpc('vs_file_retire', { p_id: id });
        stage = 'storage-delete';
        const r = await upstream(origin + '/storage/v1/object/' + BUCKET, {
          method: 'DELETE',
          redirect: 'error',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefixes: [id] }),
        });
        if (!r.ok) fail('Storage не подтвердил удаление. Повтори удаление.', 502);
        return json({ id });
      }
      stage = 'validation';
      const bytes = await readBody(request),
        mime = detect(bytes),
        kind = url.searchParams.get('kind'),
        scope = url.searchParams.get('scope') || null;
      if (['avatar', 'banner', 'emoji'].includes(kind) && !mime.startsWith('image/'))
        fail('Выбери PNG, JPG, WebP или GIF');
      const name = (url.searchParams.get('name') || 'Файл')
        .replace(/[\x00-\x1f/\\]/g, '_')
        .slice(0, 120);
      const id = await rpc('vs_file_begin', {
        p_kind: kind,
        p_scope: scope,
        p_name: name,
        p_mime: mime,
        p_bytes: bytes.length,
      });
      if (!UUID.test(id)) fail('Ошибка подготовки файла', 502);
      stage = 'storage-upload';
      const saved = await upstream(path(id), {
        method: 'POST',
        redirect: 'error',
        headers: { ...headers, 'Content-Type': mime, 'x-upsert': 'false' },
        body: bytes,
      });
      if (!saved.ok) fail('Storage не принял файл', 502);
      await rpc('vs_file_ready', { p_id: id });
      return json({ id, mime, name });
    } catch (e) {
      if (!e?.status || e.status >= 500)
        console.error(
          '[voxel-media]',
          JSON.stringify({
            requestId,
            stage,
            type: e instanceof Error ? e.name : 'UnknownError',
          }),
        );
      return json(
        {
          error:
            (e?.status ? e.message : 'Сервис загрузки временно недоступен') + ' · код ' + requestId,
          requestId,
        },
        e?.status || 502,
      );
    }
  },
};
