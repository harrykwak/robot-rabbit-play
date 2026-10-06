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
  constructor({ onMessage, onClosed, onStart, onInvite, onBack }) {
    Object.assign(this, { onMessage, onClosed, onStart, onInvite, onBack, flow: 'join' });
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
    $('room-entry').onsubmit = e => { e.preventDefault(); this.submit(); };
    $('room-back').onclick = () => this.back();
    addEventListener('pagehide', () => { $('room-password').value = ''; });
    $('room-start').onclick = () => this.perform(() => this.action('start'));
    $('room-leave').onclick = () => this.perform(() => this.leave());
    $('room-close').onclick = () => this.perform(() => this.action('close'));
    $('room-reconnect').onclick = () => this.reconnect();
    $('room-service-retry').onclick = () => this.checkService();
    $('room-copy').onclick = async () => {
      if (this.role !== 'host' || !this.room) return;
      const link = this.invitation(); $('room-share-link').value = link;
      try { await navigator.clipboard.writeText(link); this.status('참가 링크를 복사했습니다. 친구의 요청을 승인해 주세요.'); }
      catch { $('room-share-link').hidden = false; $('room-share-link').focus(); $('room-share-link').select(); this.status('아래 참가 링크를 복사해 친구에게 보내 주세요.'); }
    };
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
      if (saved?.endpoint === this.endpoint && saved.page === location.origin + location.pathname && /^[a-f0-9]{64}$/.test(saved.token)) { this.token = saved.token; this.connect(); }
    } catch { /* Optional tab-scoped recovery. */ }
    this.render(); this.checkService();
  }
  get role() { return this.self?.role; }
  open(flow = 'join') {
    if (this.token) return;
    this.flow = flow === 'create' ? 'create' : 'join';
    $('room-password').value = ''; $('room-loadout').open = false;
    for (const field of $('room-entry').querySelectorAll('[aria-invalid]')) field.removeAttribute('aria-invalid');
    this.status(''); this.render();
  }
  back() {
    if (this.busy) return;
    $('room-password').value = '';
    const finish = () => { this.invite = ''; $('room-code').value = ''; this.onBack?.(); };
    if (this.token) { this.perform(async () => { await this.leave(); finish(); }); return; }
    finish();
  }
  submit() {
    if (this.busy || !this.available || this.token) return;
    const fields = ['room-name', this.flow === 'create' ? 'room-password' : 'room-code'];
    for (const id of fields) $(id).removeAttribute('aria-invalid');
    const missing = fields.find(id => !$(id).value.trim());
    if (missing) {
      $(missing).setAttribute('aria-invalid', 'true'); $(missing).focus();
      this.status(missing === 'room-name' ? '닉네임을 입력해 주세요.' : missing === 'room-code' ? '친구에게 받은 방 코드를 입력해 주세요.' : '방장 비밀번호를 입력해 주세요.', true); return;
    }
    this.perform(() => this.flow === 'create' ? this.create() : this.join());
  }
  invitation() { return this.role === 'host' && this.room ? invitationURL(location.href, this.room.id) : ''; }
  status(text, error = false) { $('room-status').textContent = text; $('room-status').classList.toggle('error', error); }
  async checkService() {
    if (this.probing) return;
    if (!this.endpoint) {
      this.available = false; this.status('');
      $('room-service-message').textContent = '멀티플레이 서버가 아직 연결되지 않았습니다. 지금은 혼자 플레이할 수 있습니다.';
      $('room-service-retry').hidden = true; this.render(); return;
    }
    this.probing = true; this.render();
    $('room-service-message').textContent = '멀티플레이 연결 중… 처음 연결할 때는 최대 1분 정도 걸립니다.';
    try {
      const response = await fetch(this.endpoint + '/api/capabilities', { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(75000) });
      const caps = response.ok ? await response.json() : null;
      this.available = caps?.version === 1 && caps.capacity === 4 && caps.transport === 'https-sse' && caps.hostAuthentication === 'password';
      if (!this.available) throw new Error('unavailable');
      if (!this.token) this.status('');
    } catch {
      this.available = false;
      $('room-service-message').textContent = '멀티플레이 서버에 연결하지 못했습니다. 다시 연결하거나 혼자 플레이할 수 있습니다.';
    } finally { this.probing = false; this.render(); }
  }
  async request(path, body) {
    if (!this.endpoint) throw new Error('온라인 방이 아직 준비되지 않았습니다.');
    const headers = { 'Content-Type': 'application/json' }; if (this.token) headers.Authorization = 'Bearer ' + this.token;
    // POST responses are no-store at the relay. Leave the request cache mode at
    // default so the browser may reuse its bounded CORS preflight grant.
    let response;
    try {
      response = await fetch(this.endpoint + path, { method: 'POST', headers, body: JSON.stringify(body), credentials: 'omit', signal: AbortSignal.timeout(8000) });
    } catch {
      throw new Error('서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
    let value;
    try { value = await response.json(); } catch {
      throw new Error('서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    if (!response.ok) throw new Error(Object.hasOwn(labels, value.error) ? labels[value.error] : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
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
    // Do not persist partial/malformed admission replies as reconnect credentials.
    if (!/^[a-f0-9]{64}$/.test(reply?.token) || !/^[a-f0-9]{24}$/.test(reply?.self?.id)
      || !['host', 'guest'].includes(reply.self.role) || !['approved', 'pending'].includes(reply.self.status)
      || !/^[A-F0-9]{32}$/.test(reply?.room?.id) || !Array.isArray(reply.room.players)) {
      throw new Error('참가 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
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
      this.status(''); this.render();
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
    const joined = !!this.token, host = this.role === 'host', pendingSelf = this.self?.status === 'pending';
    const creating = this.flow === 'create', ready = !!this.available;
    $('title-online-status').textContent = ready ? '친구와 최대 4명 · 방장 승인 후 참가' : this.probing ? '멀티플레이 연결 확인 중 · 혼자 플레이 가능' : '멀티플레이 준비 중 · 혼자 플레이 가능';
    $('room-title').textContent = joined ? pendingSelf ? '승인 기다리는 중' : '대기실' : creating ? '방 만들기' : '참가하기';
    $('room-step').textContent = joined ? pendingSelf ? '참가 요청 전송 완료' : '친구와 함께 · 최대 4명' : '친구와 함께 · 최대 4명';
    $('room-entry').hidden = joined || !ready;
    $('room-unavailable').hidden = joined || ready;
    $('room-service-retry').disabled = this.probing;
    $('room-service-retry').hidden = !this.endpoint;
    $('room-connected').hidden = !joined;
    $('room-host').hidden = !creating || !ready;
    $('room-join-fields').hidden = creating || !!this.invite;
    $('room-invited').hidden = creating || !this.invite;
    $('room-stage-field').hidden = !creating;
    $('room-loadout').querySelector('summary').textContent = creating ? '캐릭터 · 전장 선택' : '캐릭터 선택';
    $('room-entry-note').textContent = creating
      ? '방장 비밀번호는 나만 사용합니다. 친구에게는 초대 링크만 보내세요. 계정 확인이 아닌 비밀번호 소지 확인입니다.'
      : '초대 링크·코드로 신청하고 방장의 승인을 기다립니다. 비밀번호는 필요 없습니다.';
    $('room-create').hidden = !creating; $('room-join').hidden = creating;
    $('room-create').disabled = !ready || this.busy; $('room-join').disabled = !ready || this.busy;
    $('room-create').textContent = this.busy ? '방 만드는 중…' : '방 만들기';
    $('room-join').textContent = this.busy ? '요청 보내는 중…' : '참가 요청';
    $('room-back').disabled = this.busy;
    $('room-back').textContent = joined ? host ? '← 방 닫고 나가기' : '← 나가기' : '← 뒤로';
    $('room-back').setAttribute('aria-label', joined ? host ? '방 닫고 메인 메뉴로' : '나가고 메인 메뉴로' : '메인 메뉴로 돌아가기');
    $('room-number').textContent = this.room?.id || '';
    $('room-state').textContent = pendingSelf ? '방장이 요청을 확인하고 있습니다.' : this.room?.state === 'playing' ? '게임 진행 중' : host ? '참가자 ' + (this.room?.players.length || 0) + ' / 4' : '방장이 게임을 시작하면 함께 입장합니다.';
    $('room-share').hidden = !host; $('room-share-link').value = host ? this.invitation() : '';
    $('room-start').hidden = !host; $('room-close').hidden = !host; $('room-leave').hidden = host;
    $('room-leave').textContent = pendingSelf ? '요청 취소' : '나가기';
    $('room-close').disabled = this.busy; $('room-leave').disabled = this.busy;
    const reason = !this.online ? '연결을 복구하고 있습니다.' : this.room?.state !== 'lobby' ? '게임이 진행 중입니다.' : this.pending.length ? '참가 요청을 승인하거나 거절해 주세요.' : (this.room?.players.length || 0) < 2 ? '친구가 1명 이상 참가하면 시작할 수 있습니다.' : this.room?.players.some(p => !p.online) ? '참가자의 재연결을 기다리고 있습니다.' : '';
    $('room-start').disabled = this.busy || !!reason;
    $('room-start-reason').hidden = !host; $('room-start-reason').textContent = reason;
    $('room-reconnect').hidden = this.online; $('room-reconnect').disabled = this.busy;
    const list = $('room-roster'); list.replaceChildren(); list.hidden = pendingSelf;
    for (const p of this.room?.players || []) {
      const item = document.createElement('li'), name = document.createElement('span'), state = document.createElement('small');
      name.textContent = p.name + (p.id === this.self?.id ? ' (나)' : '');
      state.textContent = !p.online ? '재연결 중' : p.role === 'host' ? '방장' : '준비 완료'; item.append(name, state); list.append(item);
    }
    if (!pendingSelf) for (let n = this.room?.players.length || 0; n < 4; n++) {
      const item = document.createElement('li'); item.className = 'vacant'; item.textContent = '빈 자리 · 게임에서는 CPU 참가'; list.append(item);
    }
    const pending = $('room-pending'); pending.replaceChildren(); $('room-pending-block').hidden = !host || !this.pending.length;
    for (const p of this.pending) {
      const item = document.createElement('li'), name = document.createElement('span'); name.textContent = p.name; item.append(name);
      for (const [type, label] of [['approve', '승인'], ['deny', '거절']]) {
        const button = document.createElement('button'); button.className = 'btn'; button.textContent = label;
        button.disabled = this.busy || (type === 'approve' && !p.online); button.onclick = () => this.perform(() => this.action(type, p.id)); item.append(button);
      }
      pending.append(item);
    }
  }
}
