import { PILOTS, ROBOT_ORDER, STAGES } from './data.js';
import { ROBOT_INFO } from './models.js';
import { ROOM_RELAY_ORIGIN } from './room-config.js';
import { relayOrigin, invitationFrom, invitationURL } from './room-links.js';
const $ = id => document.getElementById(id);
const storageKey = 'rr-browser-room-v1';
const labels = {
  'host-password-invalid': '방장 비밀번호를 확인해 주세요.',
  'host-auth-busy': '방장 인증 중입니다. 잠시 뒤 다시 시도해 주세요.',
  'create-rate-limit': '인증 요청이 많습니다. 잠시 뒤 다시 시도해 주세요.',
  'room-not-found': '초대가 만료됐거나 방이 닫혔습니다. 새 링크를 받아 주세요.',
  'room-full': '방이 가득 찼습니다.', 'match-in-progress': '경기가 진행 중입니다. 로비로 돌아온 뒤 참가해 주세요.',
  'resolve-pending-requests': '대기 중인 참가 요청을 모두 승인하거나 거절해 주세요.',
  'players-not-connected': '연결된 참가자가 2명 이상 필요합니다.',
  'session-expired': '세션이 만료됐습니다. 새 참가 요청이 필요합니다.',
  'room-expired': '방의 이용 시간이 끝났습니다. 새 방을 열어 주세요.',
  'denied': '호스트가 참가 요청을 거절했습니다.', 'reconnect-expired': '재접속 대기 시간이 끝났습니다.',
  'admission-rate-limit': '요청이 많습니다. 잠시 뒤 다시 시도해 주세요.',
  'already-connected': '이 세션이 다른 연결에서 사용 중입니다.',
  'capacity-reached': '현재 새 방을 열 수 없습니다. 잠시 뒤 다시 시도해 주세요.',
};

export class RoomLobby {
  constructor({ onMessage, onClosed, onStart, onInvite }) {
    Object.assign(this, { onMessage, onClosed, onStart, onInvite });
    Object.assign(this, { token: null, self: null, room: null, pending: [], online: false, controller: null, generation: 0, busy: false, inFlight: false });
    const invitation = invitationFrom(location.href);
    this.invite = invitation.room;
    // Fragments never reach the static host or relay; copied links contain no host authority.
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    try { this.endpoint = relayOrigin(location.href, ROOM_RELAY_ORIGIN); } catch { this.endpoint = null; }
    for (const [id, items] of [
      ['room-pilot', PILOTS.map((p, i) => [i, p.name])],
      ['room-robot', ROBOT_ORDER.map(r => [r, ROBOT_INFO[r].name])],
      ['room-stage', STAGES.map(s => [s.id, s.name])],
    ]) for (const [value, name] of items) {
      const option = document.createElement('option'); option.value = value; option.textContent = name; $(id).append(option);
    }
    $('room-name').value = '토끼 친구';
    $('room-code').value = this.invite; $('room-invited').hidden = !this.invite;
    addEventListener('hashchange', () => {
      const next = invitationFrom(location.href).room;
      if (!next) return;
      history.replaceState(null, '', location.pathname + location.search);
      if (this.token) { this.status('현재 방에서 나온 뒤 새 참가 링크를 열어 주세요.', true); return; }
      this.invite = next; $('room-code').value = next; $('room-invited').hidden = false;
      this.onInvite?.(); this.status('초대 링크가 준비됐습니다. 참가를 요청해 주세요.');
    });
    $('room-create').onclick = () => this.perform(() => this.create());
    $('room-host').addEventListener('toggle', () => { if (!$('room-host').open) $('room-password').value = ''; });
    addEventListener('pagehide', () => { $('room-password').value = ''; });
    $('room-join').onclick = () => this.perform(() => this.join());
    $('room-start').onclick = () => this.perform(() => this.action('start'));
    $('room-leave').onclick = () => this.perform(() => this.leave());
    $('room-close').onclick = () => this.perform(() => this.action('close'));
    $('room-reconnect').onclick = () => this.reconnect();
    $('room-service-retry').onclick = () => this.checkService();
    $('room-copy').onclick = async () => {
      if (!this.room) return;
      const link = this.invitation(); $('room-share-link').value = link;
      try { await navigator.clipboard.writeText(link); this.status('참가 링크를 복사했습니다. 친구의 요청을 승인해 주세요.'); }
      catch { $('room-share-link').focus(); $('room-share-link').select(); this.status('아래 참가 링크를 복사해 친구에게 보내 주세요.'); }
    };
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
      if (saved?.endpoint === this.endpoint && saved.page === location.origin + location.pathname && /^[a-f0-9]{64}$/.test(saved.token)) { this.token = saved.token; this.connect(); }
    } catch { /* Optional tab-scoped recovery. */ }
    this.render(); this.checkService();
  }
  get role() { return this.self?.role; }
  invitation() { return this.room ? invitationURL(location.href, this.room.id) : ''; }
  status(text, error = false) { $('room-status').textContent = text; $('room-status').classList.toggle('error', error); }
  async checkService() {
    if (this.probing) return;
    if (!this.endpoint) {
      this.available = false; $('room-unavailable').hidden = false;
      this.status('멀티플레이 서버 연결을 기다리고 있습니다.');
      $('room-service-message').textContent = '멀티플레이 서버가 아직 연결되지 않았습니다. 지금은 혼자 플레이할 수 있습니다.';
      $('room-service-retry').hidden = true; this.render(); return;
    }
    this.probing = true; $('room-service-retry').disabled = true;
    if (!this.token) this.status('온라인 방에 연결 중입니다. 처음 연결은 약 1분 걸릴 수 있습니다.');
    try {
      const response = await fetch(this.endpoint + '/api/capabilities', { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(75000) });
      const caps = response.ok ? await response.json() : null;
      this.available = caps?.version === 1 && caps.capacity === 4 && caps.transport === 'https-sse' && caps.hostAuthentication === 'password';
      if (!this.available) throw new Error('unavailable');
      if (!this.token) this.status(this.invite ? '초대 링크가 준비됐습니다. 이름을 정하고 참가를 요청해 주세요.' : '방을 열고 참가 링크를 친구에게 보내 주세요.');
    } catch {
      this.available = false; $('room-service-message').textContent = '온라인 방에 연결하지 못했습니다. 잠시 뒤 다시 확인해 주세요.';
    } finally {
      this.probing = false; $('room-service-retry').disabled = false;
      $('room-unavailable').hidden = !!this.available; this.render();
    }
  }
  async request(path, body) {
    if (!this.endpoint) throw new Error('온라인 방이 아직 준비되지 않았습니다.');
    const headers = { 'Content-Type': 'application/json' }; if (this.token) headers.Authorization = 'Bearer ' + this.token;
    // POST responses are no-store at the relay. Leave the request cache mode at
    // default so the browser may reuse its bounded CORS preflight grant.
    const response = await fetch(this.endpoint + path, { method: 'POST', headers, body: JSON.stringify(body), credentials: 'omit', signal: AbortSignal.timeout(8000) });
    const value = await response.json();
    if (!response.ok) throw new Error(labels[value.error] || value.error || '요청을 처리하지 못했습니다.');
    return value;
  }
  async perform(task) {
    if (this.busy) return; this.busy = true; this.render();
    try { await task(); } catch (e) { this.status(e.message, true); } finally { this.busy = false; this.render(); }
  }
  profile() { return { name: $('room-name').value.trim(), pilot: +$('room-pilot').value, robot: $('room-robot').value }; }
  async create() {
    const profile = { ...this.profile(), stage: $('room-stage').value, password: $('room-password').value };
    $('room-password').value = '';
    try { this.adopt(await this.request('/api/host', profile)); }
    finally { profile.password = ''; }
  }
  async join() { this.adopt(await this.request('/api/join', { ...this.profile(), room: $('room-code').value.trim().toUpperCase() })); }
  adopt(reply) {
    this.token = reply.token; this.self = reply.self; this.room = reply.room; this.offlineSince = 0;
    try { sessionStorage.setItem(storageKey, JSON.stringify({ endpoint: this.endpoint, page: location.origin + location.pathname, token: this.token })); } catch { /* Optional storage. */ }
    this.connect(); this.render();
  }
  async connect() {
    if (!this.token || !this.endpoint) return;
    const generation = ++this.generation; this.controller?.abort();
    const controller = new AbortController(); this.controller = controller; this.status('로비 연결 중입니다…');
    let deadline, timedOut = false;
    const arm = delay => { clearTimeout(deadline); deadline = setTimeout(() => { timedOut = true; controller.abort(); }, delay); };
    arm(12000);
    try {
      const response = await fetch(this.endpoint + '/api/events', { headers: { Authorization: 'Bearer ' + this.token }, signal: controller.signal, cache: 'no-store', credentials: 'omit' });
      if (!response.ok) {
        const e = await response.json();
        if (response.status === 401) { this.forget(); this.onClosed(labels[e.error] || e.error); return; }
        if (response.status === 409) { this.online = false; this.status(labels[e.error] || e.error, true); this.render(); return; }
        throw new Error(labels[e.error] || e.error);
      }
      this.online = true; this.offlineSince = 0; this.render();
      arm(8000);
      const reader = response.body.getReader(), decoder = new TextDecoder(); let buffered = '';
      while (generation === this.generation) {
        const { value, done } = await reader.read(); if (done) break;
        arm(8000);
        buffered += decoder.decode(value, { stream: true }); let end;
        while ((end = buffered.indexOf('\n\n')) >= 0) {
          const event = buffered.slice(0, end); buffered = buffered.slice(end + 2);
          if (event.startsWith('data: ')) this.receive(JSON.parse(event.slice(6)));
        }
        if (buffered.length > 128 * 1024) throw new Error('invalid-stream');
      }
      if (generation === this.generation && this.token) throw new Error('disconnected');
    } catch (e) {
      if (generation !== this.generation || (e.name === 'AbortError' && !timedOut)) return;
      this.online = false; this.onMessage({ type: 'transport-offline' }); this.offlineSince ||= Date.now();
      if (Date.now() - this.offlineSince >= 30000) { this.forget(); this.onClosed(labels['reconnect-expired']); return; }
      this.status('연결 중단 — 30초 동안 자리를 보관하며 다시 연결합니다.', true); this.render();
      clearTimeout(this.retry); this.retry = setTimeout(() => this.connect(), 1200);
    } finally { clearTimeout(deadline); }
  }
  receive(message) {
    if (message.type === 'heartbeat') return;
    if (message.type === 'room') {
      if (this.room?.state === 'playing' && message.room?.state === 'lobby') this.onMessage({ type: 'stop', reason: '로비로 돌아왔습니다.' });
      this.room = message.room; this.self = message.self; this.pending = message.pending;
      this.status(this.self.status === 'pending' ? '참가 요청을 보냈습니다. 호스트 승인을 기다리고 있습니다.' : this.room?.state === 'playing' ? '호스트가 경기를 진행 중입니다.' : '승인된 참가자만 함께 플레이합니다.'); this.render();
    } else if (message.type === 'closed' || message.type === 'removed') {
      const reason = labels[message.reason] || (message.type === 'closed' ? '방이 닫혔습니다.' : '로비에서 나왔습니다.');
      this.forget(); this.status(reason, true); this.onClosed(reason);
    } else if (message.type === 'welcome') { this.self = message.self; this.inputSeq = message.inputSeq; this.render(); }
    else if (message.type === 'start') this.onStart(message);
    else this.onMessage(message);
  }
  action(type, target) { return this.request('/api/action', target ? { type, target } : { type }); }
  send(packet) {
    if (!this.online || !this.token || this.inFlight) return false;
    this.inFlight = true; this.request('/api/game', packet).catch(e => this.status(e.message, true)).finally(() => { this.inFlight = false; }); return true;
  }
  async leave() { if (this.token) await this.action('leave'); this.forget(); this.onClosed('로비에서 나왔습니다.'); }
  forget() {
    ++this.generation; this.controller?.abort(); clearTimeout(this.retry);
    this.token = null; this.self = null; this.room = null; this.pending = []; this.online = false;
    try { sessionStorage.removeItem(storageKey); } catch { /* Optional storage. */ } this.render();
  }
  reconnect() { if (this.token) { this.controller?.abort(); clearTimeout(this.retry); this.retry = setTimeout(() => this.connect(), 250); } }
  render() {
    const joined = !!this.token, host = this.role === 'host';
    $('room-entry').hidden = joined; $('room-connected').hidden = !joined;
    $('room-host').hidden = !this.available;
    $('room-create').disabled = !this.available || this.busy; $('room-join').disabled = !this.available || this.busy;
    $('room-number').textContent = this.room ? '초대 전용 방' : '';
    $('room-state').textContent = this.room?.state === 'playing' ? '경기 중' : this.self?.status === 'pending' ? '승인 대기' : '참가 대기';
    $('room-share').hidden = !host; $('room-share-link').value = host ? this.invitation() : '';
    $('room-start').hidden = !host; $('room-close').hidden = !host; $('room-leave').hidden = host;
    $('room-start').disabled = this.busy || !this.online || this.room?.state !== 'lobby' || (this.room?.players.length || 0) < 2 || this.pending.length > 0 || this.room?.players.some(p => !p.online);
    $('room-reconnect').hidden = this.online;
    const list = $('room-roster'); list.replaceChildren();
    for (const p of this.room?.players || []) {
      const item = document.createElement('li'); item.textContent = `${p.name}${p.role === 'host' ? ' · HOST' : ''}${p.id === this.self?.id ? ' · 나' : ''} — ${p.online ? '연결됨' : '재접속 대기'}`; list.append(item);
    }
    const pending = $('room-pending'); pending.replaceChildren(); $('room-pending-block').hidden = !host;
    for (const p of this.pending) {
      const item = document.createElement('li'), name = document.createElement('span'); name.textContent = p.name; item.append(name);
      for (const [type, label] of [['approve', '승인'], ['deny', '거절']]) {
        const button = document.createElement('button'); button.className = 'btn'; button.textContent = label;
        button.disabled = this.busy || (type === 'approve' && !p.online); button.onclick = () => this.perform(() => this.action(type, p.id)); item.append(button);
      }
      pending.append(item);
    }
    if (host && !this.pending.length) { const item = document.createElement('li'); item.textContent = '새 참가 요청이 없습니다.'; pending.append(item); }
  }
}
