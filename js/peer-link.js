import { PEER_VERSION, MAX_WIRE_BYTES, cleanProfile, normalizePeerId, decodeInvite, encodeInvite, parseJSON } from './peer-protocol.js';
const encoder = new TextEncoder();
const MAX_BUFFER = 256 * 1024;

export class PeerLink {
  constructor({ profile, onState = ()=>{}, onMessage = ()=>{}, rtcFactory = config => new RTCPeerConnection(config) }) {
    this.profile = cleanProfile(profile); Object.assign(this, { onState, onMessage, rtcFactory });
    this.pc = null; this.channel = null; this.peer = null; this.role = null; this.session = null;
    this.closed = false; this.ready = false; this.epoch = 0; this.timers = new Set(); this.pendingGather = null;
    this.lastSeen = 0; this.rateStart = 0; this.rateCount = 0;
    this.sendRateStart = 0; this.sendRateCount = 0;
  }
  emit(status, reason) { this.onState({ status, role: this.role, peer: this.peer, reason }); }
  timer(fn, ms) { const id = setTimeout(()=>{this.timers.delete(id);fn();},ms); this.timers.add(id); return id; }
  begin(role, session, peer) {
    if (this.pc || this.closed) throw new Error('기존 연결을 취소한 뒤 새 초대를 만들어 주세요.');
    this.role = role; this.session = session; this.peer = peer;
    const pc = this.pc = this.rtcFactory({ iceServers: [], bundlePolicy: 'max-bundle' });
    const epoch = ++this.epoch;
    pc.onconnectionstatechange = () => {
      if (epoch !== this.epoch) return;
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.fail('기기와 연결할 수 없어요. 같은 Wi-Fi인지 확인해 주세요.');
      if (pc.connectionState === 'disconnected') this.timer(()=>{if(epoch===this.epoch && pc.connectionState==='disconnected')this.fail('친구와 연결이 끊겼어요.');},5000);
    };
    if (role === 'host') this.attach(pc.createDataChannel('robot-rabbit-v1', { ordered: true }), epoch);
    else pc.ondatachannel = event => { if (epoch === this.epoch) this.attach(event.channel, epoch); };
    // Manual messaging may require switching apps. No heartbeat runs before open.
    this.timer(()=>{if(!this.ready)this.fail('초대가 만료됐어요. 새 초대로 다시 연결해 주세요.');},10*60*1000);
    return pc;
  }
  async gather() {
    const pc = this.pc, epoch = this.epoch;
    if (pc.iceGatheringState === 'complete') return;
    await new Promise((resolve,reject) => {
      const finish = error => {
        if (this.pendingGather?.finish !== finish) return;
        pc.removeEventListener('icegatheringstatechange', changed);
        clearTimeout(timer); this.timers.delete(timer); this.pendingGather = null;
        error ? reject(error) : resolve();
      };
      const changed = () => { if (epoch !== this.epoch) finish(new Error('연결이 취소됐어요.')); else if (pc.iceGatheringState === 'complete') finish(); };
      const timer = this.timer(()=>finish(new Error('연결 주소를 찾지 못했어요. 같은 Wi-Fi에서 다시 시도해 주세요.')),10000);
      this.pendingGather = { finish };
      pc.addEventListener('icegatheringstatechange', changed); changed();
    });
  }
  async createOffer(expectedPeerId) {
    const to = normalizePeerId(expectedPeerId);
    if (!to || to === this.profile.id) throw new Error('다른 친구의 올바른 기기 ID를 입력해 주세요.');
    this.expectedPeerId = to;
    const pc = this.begin('host', crypto.randomUUID(), null); const epoch = this.epoch;
    this.emit('gathering');
    try {
      await pc.setLocalDescription(await pc.createOffer()); await this.gather();
      if (epoch !== this.epoch) throw new Error('연결이 취소됐어요.');
      const code = encodeInvite({ v: PEER_VERSION, kind: 'offer', session: this.session, from: this.profile, to, sdp: pc.localDescription });
      this.emit('waiting-answer'); return code;
    } catch(error) { if (!this.closed) this.fail(error.message); throw error; }
  }
  async acceptOffer(text, expectedHostId) {
    const offer = decodeInvite(text, 'offer');
    if (offer.to !== this.profile.id || offer.from.id === this.profile.id || (expectedHostId && offer.from.id !== normalizePeerId(expectedHostId))) throw new Error('나를 지정한 초대가 아니에요. 친구에게 내 기기 ID를 다시 보내 주세요.');
    const pc = this.begin('guest', offer.session, offer.from); const epoch = this.epoch;
    this.expectedPeerId = offer.from.id; this.emit('answering');
    try {
      await pc.setRemoteDescription(offer.sdp); await pc.setLocalDescription(await pc.createAnswer()); await this.gather();
      if (epoch !== this.epoch) throw new Error('연결이 취소됐어요.');
      return encodeInvite({ v: PEER_VERSION, kind: 'answer', session: this.session, from: this.profile, to: offer.from.id, sdp: pc.localDescription });
    } catch(error) { if (!this.closed) this.fail(error.message); throw error; }
  }
  async acceptAnswer(text) {
    if (!this.pc || this.role !== 'host' || this.closed || this.pc.remoteDescription) throw new Error('답장을 받을 초대가 없어요.');
    const answer = decodeInvite(text, 'answer');
    if (answer.session !== this.session || answer.to !== this.profile.id || answer.from.id !== this.expectedPeerId) throw new Error('이 초대에 대한 친구의 답장이 아니에요.');
    this.peer = answer.from;
    this.emit('connecting');
    const pc = this.pc, epoch = this.epoch;
    await pc.setRemoteDescription(answer.sdp);
    if (this.closed || this.epoch !== epoch) throw new Error('연결이 취소됐어요.');
    this.timer(()=>{if(!this.ready)this.fail('연결 시간이 초과됐어요. 같은 Wi-Fi인지 확인해 주세요.');},30000);
  }
  attach(channel, epoch) {
    if (this.channel || channel.label !== 'robot-rabbit-v1') { channel.close(); this.fail('잘못된 연결 채널이에요.'); return; }
    this.channel = channel;
    let helloSent = false;
    const open = () => {
      if (epoch !== this.epoch || this.closed || helloSent) return;
      helloSent = true;
      this.emit('handshaking');
      this.raw({ kind: 'hello', from: this.profile, to: this.expectedPeerId });
      this.timer(()=>{if(!this.ready)this.fail('친구 확인에 실패했어요. 새 초대로 다시 연결해 주세요.');},10000);
    };
    channel.onopen = open;
    channel.onmessage = event => { if (epoch === this.epoch) this.read(event.data); };
    channel.onclose = () => { if(epoch===this.epoch)this.fail('친구와 연결이 종료됐어요.'); };
    channel.onerror = () => { if(epoch===this.epoch)this.fail('친구와 데이터를 주고받지 못했어요.'); };
    if (channel.readyState === 'open') open();
  }
  raw(payload) {
    if (this.closed || this.channel?.readyState !== 'open' || this.channel.bufferedAmount > MAX_BUFFER) return false;
    const data = JSON.stringify({ v: PEER_VERSION, session: this.session, ...payload });
    const bytes = encoder.encode(data).length;
    if (bytes > MAX_WIRE_BYTES || this.channel.bufferedAmount + bytes > MAX_BUFFER) return false;
    try { this.channel.send(data); return true; } catch { this.fail('연결 전송이 중단됐어요.'); return false; }
  }
  send(message) {
    if (!this.ready || !message || typeof message !== 'object' || Array.isArray(message)) return false;
    const now = performance.now();
    if (now - this.sendRateStart >= 1000) { this.sendRateStart = now; this.sendRateCount = 0; }
    if (++this.sendRateCount > 120) return false;
    try { return this.raw({ kind: 'app', data: message }); } catch { return false; }
  }
  read(text) {
    if (this.closed) return;
    const now = performance.now();
    if (now - this.rateStart >= 1000) { this.rateStart = now; this.rateCount = 0; }
    if (++this.rateCount > 160) { this.fail('연결에서 너무 많은 정보를 받아 중단했어요.'); return; }
    let msg;
    try { msg = parseJSON(text); } catch { this.fail('잘못된 연결 정보를 받았어요.'); return; }
    if (!msg || msg.v !== PEER_VERSION || msg.session !== this.session) { this.fail('다른 초대의 연결 정보예요.'); return; }
    if (msg.kind === 'hello') {
      let from; try { from = cleanProfile(msg.from); } catch { this.fail('친구 정보를 확인할 수 없어요.'); return; }
      if (!this.peer || from.id !== this.peer.id || from.name !== this.peer.name || from.id !== this.expectedPeerId || msg.to !== this.profile.id || this.ready) { this.fail('초대한 친구와 연결 상대가 일치하지 않아요.'); return; }
      this.lastSeen = now; this.ready = true; this.emit('ready'); this.heartbeat(); return;
    }
    if (!this.ready) { this.fail('친구 확인 전에 데이터를 받았어요.'); return; }
    this.lastSeen = now;
    if (msg.kind === 'ping') this.raw({ kind: 'pong' });
    else if (msg.kind === 'app' && msg.data && typeof msg.data === 'object' && !Array.isArray(msg.data)) this.onMessage(msg.data);
    else if (msg.kind !== 'pong') this.fail('지원하지 않는 연결 메시지예요.');
  }
  heartbeat() {
    if (this.closed) return;
    this.timer(()=>{
      if (this.closed) return;
      if (performance.now() - this.lastSeen > 15000) { this.fail('친구의 응답이 없어 연결을 종료했어요.'); return; }
      this.raw({kind:'ping'}); this.heartbeat();
    },4000);
  }
  teardown() {
    this.closed = true; this.ready = false; this.epoch++;
    this.pendingGather?.finish(new Error('연결이 취소됐어요.'));
    for (const timer of this.timers) clearTimeout(timer); this.timers.clear();
    if (this.channel) { this.channel.onopen = this.channel.onclose = this.channel.onerror = this.channel.onmessage = null; this.channel.close(); }
    if (this.pc) { this.pc.onconnectionstatechange = this.pc.ondatachannel = null; this.pc.close(); }
  }
  fail(reason) { if (this.closed) return; this.teardown(); this.emit('failed', reason); }
  close(reason = '연결을 종료했어요.') { if(this.closed)return; this.teardown(); this.emit('closed', reason); }
}
