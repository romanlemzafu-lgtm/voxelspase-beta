/* Small WebRTC mesh. Postgres transports complete SDP with gathered ICE candidates. */
window.createVoxelVoice = function createVoxelVoice({ rpc, onChange, onError }) {
  let call = null;
  let epoch = 0;
  let joining = false;
  const peers = new Map();
  let audioContext = null,
    levelTimer = null,
    deviceId = '',
    devices = [],
    display = null,
    screenEpoch = 0;
  function meter(stream) {
    try {
      audioContext ??= new AudioContext();
      void audioContext.resume().catch(() => {});
      const source = audioContext.createMediaStreamSource(stream),
        analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      return { source, analyser, samples: new Uint8Array(analyser.fftSize) };
    } catch {
      return null;
    }
  }
  function drawLevels() {
    for (const el of document.querySelectorAll('[data-level]')) {
      const local = el.dataset.level === call?.session,
        m = local ? call?.meter : peers.get(el.dataset.level)?.meter;
      let active = false;
      if (m && !(local && call?.muted)) {
        m.analyser.getByteTimeDomainData(m.samples);
        active = m.samples.some((v) => Math.abs(v - 128) > 8);
      }
      el.classList.toggle('speaking', active);
      el.setAttribute('aria-description', active ? 'Говорит' : '');
    }
  }
  function bindVideos() {
    for (const video of document.querySelectorAll('video[data-screen]')) {
      const stream =
        video.dataset.screen === call?.session ? display : peers.get(video.dataset.screen)?.screen;
      if (video.srcObject !== stream) {
        video.srcObject = stream || null;
        if (stream) video.play().catch(() => {});
      }
    }
  }
  function inform(peer) {
    if (peer.dc?.readyState === 'open')
      peer.dc.send(JSON.stringify({ screen: !!display, token: call?.proof }));
  }
  function bindData(peer, dc, room, id) {
    peer.dc = dc;
    dc.onopen = () => {
      if (call === room) inform(peer);
    };
    dc.onmessage = async (e) => {
      if (call !== room || typeof e.data !== 'string' || e.data.length > 200) return;
      try {
        const m = JSON.parse(e.data);
        peer.sharing = m.screen === true;
        if (!peer.proved && typeof m.token === 'string') {
          await rpc('vs_rtc_prove', { p_session: room.session, p_peer: id, p_token: m.token });
          peer.proved = true;
        }
        onChange();
      } catch {}
    };
  }
  async function stopScreen() {
    screenEpoch++;
    const old = display;
    display = null;
    old?.getTracks().forEach((t) => t.stop());
    await Promise.allSettled([...peers.values()].map((p) => p.video?.sender.replaceTrack(null)));
    for (const p of peers.values()) inform(p);
    onChange();
  }
  async function shareScreen() {
    if (!call) return;
    if (!navigator.mediaDevices?.getDisplayMedia)
      throw Error('Этот браузер не поддерживает показ экрана. Открой комнату на ПК.');
    if (display) return stopScreen();
    const room = call,
      token = ++screenEpoch;
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { max: 15 } },
      audio: false,
    });
    if (call !== room || token !== screenEpoch) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    display = stream;
    const track = stream.getVideoTracks()[0];
    track.onended = () => void stopScreen();
    try {
      await Promise.all([...peers.values()].map((p) => p.video?.sender.replaceTrack(track)));
      for (const p of peers.values()) inform(p);
      onChange();
    } catch (e) {
      await stopScreen();
      throw e;
    }
  }
  async function switchMic(id) {
    const room = call;
    if (!room) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: id ? { deviceId: { exact: id }, echoCancellation: true } : true,
    });
    if (call !== room) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    const track = stream.getAudioTracks()[0],
      old = room.stream.getAudioTracks()[0];
    track.enabled = !room.muted;
    try {
      await Promise.all(
        [...peers.values()].map((p) =>
          p.pc
            .getSenders()
            .find((s) => s.track?.kind === 'audio')
            ?.replaceTrack(track),
        ),
      );
    } catch (e) {
      await Promise.allSettled(
        [...peers.values()].map((p) =>
          p.pc
            .getSenders()
            .find((s) => s.track?.kind === 'audio')
            ?.replaceTrack(old),
        ),
      );
      track.stop();
      throw e;
    }
    if (call !== room) {
      track.stop();
      return;
    }
    old.onended = null;
    old.stop();
    deviceId = id;
    room.stream = stream;
    room.meter?.source.disconnect();
    room.meter = meter(stream);
    track.onended = () => {
      if (call === room) void leave().catch(onError);
    };
    onChange();
  }
  const audioRoot = document.getElementById('remote-audio');

  function drop(session) {
    const peer = peers.get(session);
    if (!peer) return;
    peer.pc.ontrack = null;
    peer.pc.onconnectionstatechange = null;
    peer.meter?.source.disconnect();
    peer.dc?.close();
    peer.pc.close();
    peer.audio.srcObject = null;
    peer.audio.remove();
    peers.delete(session);
  }

  async function leave() {
    epoch++;
    joining = false;
    const previous = call;
    call = null;
    if (previous) {
      clearTimeout(previous.timer);
      clearInterval(levelTimer);
      screenEpoch++;
      display?.getTracks().forEach((t) => t.stop());
      display = null;
      previous.meter?.source.disconnect();
      if (audioContext) {
        void audioContext.close().catch(() => {});
        audioContext = null;
      }
      previous.stream.getTracks().forEach((track) => track.stop());
      for (const session of peers.keys()) drop(session);
    }
    onChange();
    if (previous?.session) await rpc('voxel_voice_leave', { p_session: previous.session });
  }

  function peerFor(room, remote) {
    if (peers.has(remote.session)) return peers.get(remote.session);
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }],
    });
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audioRoot.append(audio);
    const peer = { pc, audio, blocked: false, sent: false, started: Date.now() };
    peers.set(remote.session, peer);
    for (const track of room.stream.getAudioTracks()) pc.addTrack(track, room.stream);
    if (room.session < remote.session) {
      peer.video = pc.addTransceiver('video', { direction: 'sendrecv' });
      if (display) peer.video.sender.replaceTrack(display.getVideoTracks()[0]).catch(onError);
    }
    if (room.session < remote.session)
      bindData(peer, pc.createDataChannel('voxel-state'), room, remote.session);
    else pc.ondatachannel = (e) => bindData(peer, e.channel, room, remote.session);
    pc.ontrack = (event) => {
      if (event.track.kind === 'video') {
        peer.screen = new MediaStream([event.track]);
        onChange();
        return;
      }
      audio.srcObject = new MediaStream([event.track]);
      peer.meter = meter(audio.srcObject);
      audio.play().catch(() => {
        peer.blocked = true;
        onChange();
      });
    };
    pc.onconnectionstatechange = onChange;
    return peer;
  }

  async function sendDescription(room, to, pc, description) {
    await pc.setLocalDescription(description);
    if (pc.iceGatheringState !== 'complete') {
      await new Promise((resolve) => {
        function finish() {
          clearTimeout(timer);
          pc.removeEventListener('icegatheringstatechange', check);
          resolve();
        }
        function check() {
          if (pc.iceGatheringState === 'complete') finish();
        }
        const timer = setTimeout(finish, 4500);
        pc.addEventListener('icegatheringstatechange', check);
        check();
      });
    }
    if (call !== room || pc.signalingState === 'closed') return;
    await rpc('voxel_voice_signal', {
      p_session: room.session,
      p_to: to,
      p_kind: pc.localDescription.type,
      p_sdp: pc.localDescription.sdp,
    });
  }

  async function syncPeer(room, remote, signal) {
    const peer = peerFor(room, remote),
      pc = peer.pc;
    if (signal && !pc.remoteDescription) {
      await pc.setRemoteDescription({ type: signal.type, sdp: signal.sdp });
      if (signal.type === 'offer') {
        // Use the offered m-line. A second answer-side transceiver would never be negotiated.
        peer.video = pc.getTransceivers().find((t) => t.receiver.track.kind === 'video' && t.mid !== null);
        if (peer.video) {
          peer.video.direction = 'sendrecv';
          if (display) await peer.video.sender.replaceTrack(display.getVideoTracks()[0]);
        }
      }
    }
    if (signal && pc.remoteDescription) room.received.add(remote.session);
    if (peer.sent || call !== room) return;
    if (pc.localDescription) {
      // A failed signaling request can be retried with the same description.
      await rpc('voxel_voice_signal', {
        p_session: room.session,
        p_to: remote.session,
        p_kind: pc.localDescription.type,
        p_sdp: pc.localDescription.sdp,
      });
    } else if (room.session < remote.session) {
      await sendDescription(room, remote.session, pc, await pc.createOffer());
    } else if (pc.remoteDescription?.type === 'offer') {
      await sendDescription(room, remote.session, pc, await pc.createAnswer());
    } else return;
    peer.sent = true;
  }

  async function sync(room) {
    try {
      const result = await rpc('voxel_voice_sync', {
        p_session: room.session,
        p_muted: room.muted,
        p_received: [...room.received],
      });
      if (call !== room) return;
      room.received.clear();
      room.people = result.peers;
      room.lastSync = Date.now();
      room.warning = '';
      for (const id of peers.keys()) {
        if (!room.people.some((person) => person.session === id)) drop(id);
      }
      const outcomes = await Promise.allSettled(
        room.people
          .filter((p) => p.session !== room.session)
          .map((remote) =>
            syncPeer(
              room,
              remote,
              result.signals.find((s) => s.sender === remote.session),
            ),
          ),
      );
      if (outcomes.some((item) => item.status === 'rejected'))
        room.warning = 'Ошибка соединения. Выйди и войди снова.';
    } catch (error) {
      if (call !== room) return;
      if (error.code === 'P0001' || Date.now() - room.lastSync > 40000) {
        leave().catch(() => {});
        onError(error);
        return;
      }
      room.warning = 'Восстанавливаем связь с комнатой…';
    }
    if (call === room) {
      onChange();
      room.timer = setTimeout(() => sync(room), 3500);
    }
  }

  async function join(server) {
    if (joining || call) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection)
      throw new Error('Открой сайт по HTTPS в браузере с поддержкой микрофона.');
    joining = true;
    const token = ++epoch;
    let stream, session;
    onChange();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (token !== epoch) return;
      session = await rpc('voxel_voice_join', { p_server: server });
      if (token !== epoch) {
        await rpc('voxel_voice_leave', { p_session: session });
        return;
      }
      call = { server, session, stream, people: [], received: new Set(), muted: false, lastSync: Date.now() };
      const room = call;
      room.meter = meter(stream);
      levelTimer = setInterval(drawLevels, 220);
      void rpc('vs_rtc_token', { p_session: session })
        .then((token) => {
          if (call === room) {
            room.proof = token;
            for (const peer of peers.values()) inform(peer);
          }
        })
        .catch(onError);
      void navigator.mediaDevices
        .enumerateDevices()
        .then((list) => {
          if (call === room) {
            devices = list.filter((d) => d.kind === 'audioinput');
            onChange();
          }
        })
        .catch(() => {});
      stream.getAudioTracks()[0].onended = () => {
        if (call?.session === session) leave().catch(onError);
      };
      void sync(call);
    } catch (error) {
      if (error.name === 'NotAllowedError') throw new Error('Разреши доступ к микрофону в настройках сайта.');
      throw error;
    } finally {
      if (!call || call.stream !== stream) stream?.getTracks().forEach((track) => track.stop());
      if (token === epoch) joining = false;
      onChange();
    }
  }

  function toggleMute() {
    if (!call) return;
    call.muted = !call.muted;
    call.stream.getAudioTracks().forEach((track) => {
      track.enabled = !call.muted;
    });
    onChange();
  }
  async function resumeAudio() {
    for (const peer of peers.values()) {
      if (peer.blocked) {
        await peer.audio.play();
        peer.blocked = false;
      }
    }
    onChange();
  }

  window.addEventListener('offline', () => {
    if (call) {
      void leave().catch(() => {});
      onError(new Error('Интернет отключён. Войди в комнату после восстановления связи.'));
    }
  });
  window.addEventListener('pagehide', () => {
    void leave().catch(() => {});
  });
  return {
    join,
    leave,
    toggleMute,
    bindVideos,
    shareScreen,
    switchMic,
    get devices() {
      return devices;
    },
    get deviceId() {
      return deviceId;
    },
    sharing: (id) => (id === call?.session ? !!display : !!peers.get(id)?.sharing),
    volume: (id) => peers.get(id)?.audio.volume ?? 1,
    setVolume: (id, value) => {
      const p = peers.get(id);
      if (p) p.audio.volume = Math.min(1, Math.max(0, value));
    },
    resumeAudio,
    get call() {
      return call;
    },
    get joining() {
      return joining;
    },
    blocked: () => [...peers.values()].some((p) => p.blocked),
    connection: (session) => {
      const peer = peers.get(session);
      if (peer && peer.pc.connectionState !== 'connected' && Date.now() - peer.started > 25000)
        return 'failed';
      return peer?.pc.connectionState || 'connecting';
    },
  };
};
