import { PeerLink } from './peer-link.js';
import { loadPeerProfile, savePeerProfile, normalizePeerId, decodeInvite } from './peer-protocol.js';
import { PILOTS, ROBOT_ORDER, STAGES } from './data.js';
import { ROBOT_INFO } from './models.js';

const $ = id => document.getElementById(id);
const validChoice = c => c && Number.isInteger(c.pilot) && c.pilot >= 0 && c.pilot < PILOTS.length
  && ROBOT_ORDER.includes(c.robot) && STAGES.some(s => s.id === c.stage) && typeof c.ready === 'boolean';
const STATUS = {
  gathering: '초대 정보를 준비하고 있어요…',
  offering: '초대를 만들고 있어요…', answering: '답장을 만들고 있어요…',
  'waiting-answer': '초대를 친구에게 보내고, 친구의 답장을 붙여 넣어 주세요.',
  connecting: '친구 기기와 연결하고 있어요…', handshaking: '초대한 친구인지 확인하고 있어요…',
};

export class PeerLobby {
  constructor({ onMessage, onDisconnect, onStart }) {
    this.onMessage = onMessage; this.onDisconnect = onDisconnect; this.onStart = onStart;
    try { this.storage = localStorage; } catch { /* temporary identity */ }
    this.profile = loadPeerProfile(this.storage);
    this.link = null; this.connected = false; this.remote = null; this.peer = null; this.role = null;
    this.local = { pilot: 0, robot: 'titan', stage: 'farm', ready: false };
    this.generation = 0; this.busy = false; this.playing = false;
    $('peer-name').value = this.profile.name;
    $('peer-id').value = this.profile.id;
    if (!savePeerProfile(this.storage, this.profile)) $('peer-storage').textContent = '저장할 수 없어 이번 실행 동안만 같은 기기 ID를 사용합니다.';
    this.options('peer-pilot', PILOTS.map((p, i) => [i, p.name]));
    this.options('peer-robot', ROBOT_ORDER.map(r => [r, ROBOT_INFO[r].name]));
    this.options('peer-stage', STAGES.map(s => [s.id, s.name]));
    $('peer-name').addEventListener('change', () => this.updateProfile());
    $('peer-copy-id').onclick = () => this.copy('peer-id');
    $('peer-copy-offer').onclick = () => this.copy('peer-offer-code');
    $('peer-copy-answer').onclick = () => this.copy('peer-answer-code');
    $('peer-host-mode').onclick = () => this.path('host');
    $('peer-join-mode').onclick = () => this.path('guest');
    $('peer-offer').onclick = () => this.create();
    $('peer-answer').onclick = () => this.join();
    $('peer-finish').onclick = () => this.finish();
    $('peer-disconnect').onclick = () => this.disconnect();
    $('peer-ready').onclick = () => {
      if (!this.connected || this.playing) return;
      this.local.ready = !this.local.ready; this.publish(); this.render();
    };
    $('peer-start').onclick = () => {
      if (this.role === 'host' && this.connected && this.local.ready && this.remote?.ready && !this.playing) this.onStart(this.manifest());
    };
    for (const id of ['peer-pilot','peer-robot','peer-stage']) $(id).onchange = () => {
      this.local = { pilot: +$('peer-pilot').value, robot: $('peer-robot').value, stage: $('peer-stage').value, ready: false };
      this.publish(); this.render();
    };
    // Prefer the lighter replica role on Apple; either platform may still host.
    if (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) this.path('guest');
    this.render();
  }
  options(id, values) {
    for (const [value, name] of values) { const o = document.createElement('option'); o.value = value; o.textContent = name; $(id).append(o); }
  }
  status(text, error = false) { $('peer-status').textContent = text; $('peer-status').classList.toggle('error', error); }
  updateProfile() {
    if (this.link) return;
    const name = $('peer-name').value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0,16) || '토끼';
    this.profile = { ...this.profile, name };
    $('peer-name').value = name;
    if (!savePeerProfile(this.storage, this.profile)) $('peer-storage').textContent = '저장할 수 없어 이번 실행 동안만 같은 기기 ID를 사용합니다.';
  }
  path(role) {
    if (this.link || this.busy) return;
    $('peer-host-form').classList.toggle('hidden', role !== 'host');
    $('peer-join-form').classList.toggle('hidden', role !== 'guest');
    $('peer-host-mode').setAttribute('aria-pressed', String(role === 'host'));
    $('peer-join-mode').setAttribute('aria-pressed', String(role === 'guest'));
  }
  async copy(id) {
    const field = $(id);
    if (!field.value) { this.status('먼저 연결 정보를 만들어 주세요.', true); return; }
    try { await navigator.clipboard.writeText(field.value); this.status('복사했어요. 연결할 친구에게 전달해 주세요.'); }
    catch { field.focus(); field.select(); this.status('선택한 내용을 길게 눌러 복사해 주세요.'); }
  }
  makeLink() {
    if (typeof RTCPeerConnection !== 'function') throw new Error('이 환경에서 친구 연결을 지원하지 않아요. 최신 Safari 또는 Chrome으로 열어 주세요.');
    this.updateProfile();
    const generation = ++this.generation;
    this.link = new PeerLink({ profile: this.profile,
      onState: state => { if (generation === this.generation) this.state(state); },
      onMessage: message => { if (generation === this.generation) this.receive(message); },
    });
    this.render();
    return this.link;
  }
  async perform(fn) {
    if (this.busy) return;
    this.busy = true; this.render();
    try { await fn(); }
    catch (error) { this.status(error.message || '연결하지 못했어요. 같은 Wi-Fi인지 확인하고 새 초대를 만들어 주세요.', true); }
    finally { this.busy = false; this.render(); }
  }
  create() { return this.perform(async () => {
    if (this.link) return;
    if (!$('peer-target').value.trim()) throw new Error('먼저 초대할 친구의 기기 ID를 입력해 주세요.');
    const target = normalizePeerId($('peer-target').value);
    if (!target || target === this.profile.id) throw new Error('다른 친구의 올바른 기기 ID를 입력해 주세요.');
    const link = this.makeLink();
    const code = await link.createOffer($('peer-target').value.trim());
    if (this.link !== link) return;
    $('peer-offer-code').value = code;
    this.status('① 초대를 친구에게 보내세요. ② 친구의 답장을 아래에 붙여 넣으면 연결됩니다.');
  }); }
  join() { return this.perform(async () => {
    if (this.link) return;
    const invite = decodeInvite($('peer-offer-in').value.trim(), 'offer');
    if (invite.to !== this.profile.id) throw new Error('나를 지정한 초대가 아니에요. 내 기기 ID를 친구에게 보내 주세요.');
    const link = this.makeLink();
    const code = await link.acceptOffer($('peer-offer-in').value.trim());
    if (this.link !== link) return;
    $('peer-answer-code').value = code;
    this.status('답장을 친구에게 돌려주세요. 친구가 답장을 입력하면 자동으로 연결됩니다.');
  }); }
  finish() { return this.perform(async () => {
    if (!this.link) throw new Error('초대부터 만들어 주세요.');
    await this.link.acceptAnswer($('peer-answer-in').value.trim());
  }); }
  state(state) {
    if (state.role) this.role = state.role;
    if (state.peer) this.peer = state.peer;
    if (state.status === 'ready' || state.status === 'connected') {
      this.connected = true;
      this.status('친구와 연결됐어요. 각자 캐릭터를 고르고 준비를 눌러 주세요.');
      this.publish();
    } else if (['closed','failed','error','disconnected'].includes(state.status)) {
      const wasConnected = this.connected;
      this.connected = false; this.remote = null; this.local.ready = false;
      this.link = null; this.generation++;
      for (const id of ['peer-offer-code','peer-answer-code','peer-offer-in','peer-answer-in']) $(id).value = '';
      this.status(state.error?.message || state.error || state.reason || '연결이 종료됐어요. 새 초대로 다시 연결할 수 있어요.', true);
      if (wasConnected || this.playing) this.onDisconnect();
    } else if (STATUS[state.status]) this.status(STATUS[state.status]);
    this.render();
  }
  publish() { if (this.connected) this.send({ type: 'lobby', choice: this.local }); }
  receive(message) {
    if (!message || typeof message.type !== 'string') return;
    if (message.type === 'lobby') {
      if (this.playing || !validChoice(message.choice)) return;
      const changed = this.remote && ['pilot','robot','stage'].some(k => this.remote[k] !== message.choice[k]);
      this.remote = { ...message.choice };
      if (changed && this.local.ready) { this.local.ready = false; this.publish(); }
      if (this.role === 'guest') { this.local.stage = this.remote.stage; $('peer-stage').value = this.remote.stage; }
      this.render();
    } else this.onMessage(message);
  }
  manifest() {
    const host = this.role === 'host' ? this.local : this.remote;
    const guest = this.role === 'host' ? this.remote : this.local;
    return { pilot: host.pilot, robot: host.robot, stage: host.stage, stock: 3, diff: 1, autoplay: false,
      playerName: this.role === 'host' ? this.profile.name : this.peer.name,
      peer: { pilot: guest.pilot, robot: guest.robot, name: this.role === 'host' ? this.peer.name : this.profile.name } };
  }
  send(message) { return !!this.link?.send(message); }
  setPlaying(value) { this.playing = value; this.render(); }
  roundEnded() { this.playing = false; this.local.ready = false; if (this.remote) this.remote.ready = false; this.publish(); this.render(); }
  disconnect() {
    const notify = this.connected || this.playing;
    const link = this.link;
    this.generation++; this.link = null; this.connected = false; this.role = null; this.remote = null; this.peer = null;
    this.local.ready = false; this.playing = false; this.busy = false;
    link?.close('user-left');
    for (const id of ['peer-offer-code','peer-answer-code','peer-offer-in','peer-answer-in']) $(id).value = '';
    this.status('연결을 취소했어요. 새 초대를 만들 수 있어요.');
    this.render();
    if (notify) this.onDisconnect();
  }
  render() {
    $('peer-setup').classList.toggle('hidden', this.connected);
    $('peer-room').classList.toggle('hidden', !this.connected);
    $('peer-name').disabled = !!this.link || this.busy;
    for (const id of ['peer-host-mode','peer-join-mode','peer-offer','peer-answer']) $(id).disabled = !!this.link || this.busy;
    $('peer-finish').disabled = !this.link || this.busy || this.connected;
    $('peer-target').disabled = !!this.link || this.busy;
    $('peer-who').textContent = this.peer ? `${this.peer.name} · ${this.peer.id}` : '';
    $('peer-pilot').disabled = this.playing || this.local.ready;
    $('peer-robot').disabled = this.playing || this.local.ready;
    $('peer-stage').disabled = this.role !== 'host' || this.playing || this.local.ready;
    $('peer-ready').disabled = !this.connected || this.playing || !this.remote;
    $('peer-ready').textContent = this.local.ready ? '준비 취소' : '준비 완료';
    $('peer-start').disabled = this.role !== 'host' || !this.connected || !this.local.ready || !this.remote?.ready || this.playing;
    $('peer-start').textContent = this.role === 'guest' ? '친구가 경기를 시작합니다' : '둘이 난투 시작';
    $('peer-ready-state').textContent = `나: ${this.local.ready ? '준비 완료' : '선택 중'} · 친구: ${this.remote?.ready ? '준비 완료' : '선택 중'}`;
  }
}
