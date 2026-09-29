import { RemoteCtrl, captureInput, captureSnapshot, PeerReplica } from './peer-match.js';
import { PILOTS, ROBOT_ORDER, STAGES } from './data.js';

const idOK = id => typeof id === 'string' && /^[a-zA-Z0-9-]{16,64}$/.test(id);
const nameOK = s => typeof s === 'string' && s.length > 0 && s.length <= 16 && !/[\u0000-\u001f\u007f]/.test(s);
export function validMatchConfig(c) {
  return !!c && Number.isInteger(c.pilot) && c.pilot >= 0 && c.pilot < PILOTS.length && ROBOT_ORDER.includes(c.robot)
    && STAGES.some(s => s.id === c.stage) && c.stock === 3 && c.diff === 1 && c.autoplay === false && nameOK(c.playerName)
    && c.peer && Number.isInteger(c.peer.pilot) && c.peer.pilot >= 0 && c.peer.pilot < PILOTS.length && ROBOT_ORDER.includes(c.peer.robot) && nameOK(c.peer.name);
}
const sameConfig = (a,b) => validMatchConfig(a) && validMatchConfig(b)
  && ['pilot','robot','stage','stock','diff','playerName'].every(k => a[k] === b[k])
  && ['pilot','robot','name'].every(k => a.peer[k] === b.peer[k]);

// A match can use any transport implementing send + identity-checked messages.
// Only the host's Game advances combat; a guest only submits inputs and presents state.
export class PeerSession {
  constructor({ game, lobby, startGame, showResult, paused, resumed, aborted }) {
    Object.assign(this, { game, lobby, startGame, showResult, paused, resumed, aborted });
    this.round = null; this.startTimer = null; this.replica = null; this.remoteCtrl = null;
  }
  get active() { return !!this.round; }
  get guest() { return this.round?.role === 'guest'; }
  start(config) {
    if (this.round || this.lobby.role !== 'host' || !this.lobby.connected || !this.lobby.local.ready || !this.lobby.remote?.ready || !validMatchConfig(config)) return;
    const id = crypto.randomUUID();
    this.makeRound(id, 'host', config);
    this.lobby.status('친구가 경기 화면을 준비하고 있어요…');
    if (!this.lobby.send({ type: 'start', id, config })) { this.abort('경기 시작 정보를 보내지 못했어요.'); return; }
    this.startTimer = setTimeout(() => { if (this.round?.phase === 'starting') this.abort('친구의 시작 응답이 없어요. 다시 준비해 주세요.'); }, 10000);
  }
  makeRound(id, role, config) {
    this.round = { id, role, config, phase: 'starting', seq: 0, inputSeq: 0, elapsed: 0, localPaused: false, remotePaused: false, lastSnapshot: performance.now() };
    this.lobby.setPlaying(true);
  }
  receive(message) {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'start') {
      if (this.round || this.lobby.role !== 'guest' || !this.lobby.connected || !this.lobby.local.ready || !this.lobby.remote?.ready
        || !idOK(message.id) || !sameConfig(message.config, this.lobby.manifest())) return;
      this.makeRound(message.id, 'guest', message.config);
      this.startGame(message.config, 'guest');
      this.replica = new PeerReplica(this.game, { matchId: message.id, localIndex: 1 });
      this.round.phase = 'playing';
      if (!this.lobby.send({ type: 'start-ack', id: message.id })) this.abort('친구에게 시작 준비를 알리지 못했어요.');
      return;
    }
    const r = this.round;
    if (!r || message.id !== r.id) return;
    if (message.type === 'start-ack' && r.role === 'host' && r.phase === 'starting') {
      clearTimeout(this.startTimer); this.startTimer = null;
      this.startGame(r.config, 'host');
      this.remoteCtrl = new RemoteCtrl();
      this.game.humans[1].ctrl = this.remoteCtrl;
      r.phase = 'playing'; this.snapshot();
    } else if (message.type === 'input' && r.role === 'host' && r.phase === 'playing' && !r.localPaused && !r.remotePaused) {
      this.remoteCtrl?.receive(message.input);
    } else if (message.type === 'snapshot' && r.role === 'guest' && r.phase === 'playing') {
      if (this.replica?.accept(message.state)) r.lastSnapshot = performance.now();
    } else if (message.type === 'pause' && r.phase === 'playing' && typeof message.paused === 'boolean') {
      r.remotePaused = message.paused;
      this.remoteCtrl?.reset();
      this.applyPause();
    } else if (message.type === 'result' && r.role === 'guest' && r.phase === 'playing') {
      // Statistics are read from the last validated host snapshot, never this message.
      if (!this.replica?.accept(message.state)) return;
      r.phase = 'result'; this.lobby.roundEnded();
      this.showResult(this.game.results());
    } else if (message.type === 'stop') this.abort('친구가 경기를 나갔어요. 이번 경기는 무효입니다.', false);
  }
  snapshot() {
    const r = this.round;
    if (!r || r.role !== 'host') return null;
    const state = captureSnapshot(this.game, { matchId: r.id, seq: ++r.seq });
    if (state) this.lobby.send({ type: 'snapshot', id: r.id, state });
    return state;
  }
  update(dt, intents) {
    const r = this.round;
    if (!r || r.phase !== 'playing' || r.localPaused || r.remotePaused) return;
    if (r.role === 'host') {
      this.game.update(dt, false);
      if (r.phase !== 'playing') return;
      r.elapsed += dt;
      if (r.elapsed >= .05) { r.elapsed %= .05; this.snapshot(); }
    } else {
      if (performance.now() - r.lastSnapshot > 5000) { this.abort('친구의 경기 화면이 도착하지 않아요. 같은 Wi-Fi인지 확인해 주세요.'); return; }
      this.lobby.send({ type: 'input', id: r.id, input: captureInput(intents, ++r.inputSeq) });
      this.replica?.update(dt);
    }
  }
  localResult() {
    const r = this.round;
    if (!r || r.role !== 'host' || r.phase !== 'playing') return;
    const state = captureSnapshot(this.game, { matchId: r.id, seq: ++r.seq });
    this.lobby.send({ type: 'result', id: r.id, state });
    r.phase = 'result'; this.lobby.roundEnded();
  }
  setPaused(value) {
    const r = this.round;
    if (!r || r.phase !== 'playing') return;
    r.localPaused = value;
    this.remoteCtrl?.reset();
    this.lobby.send({ type: 'pause', id: r.id, paused: value });
    this.applyPause();
  }
  applyPause() {
    const r = this.round;
    if (!r) return;
    if (r.localPaused || r.remotePaused) this.paused(r.remotePaused && !r.localPaused ? '친구가 일시정지했어요. 친구가 돌아오면 이어집니다.' : '두 기기의 경기를 함께 멈췄어요.');
    else { r.lastSnapshot = performance.now(); this.resumed(); }
  }
  clear() {
    clearTimeout(this.startTimer); this.startTimer = null;
    this.replica?.dispose(); this.replica = null;
    this.remoteCtrl?.reset(); this.remoteCtrl = null; this.round = null;
  }
  abort(reason = '연결이 끊겨 경기를 마쳤어요. 이번 경기는 무효입니다.', notify = true) {
    if (!this.round) return;
    if (notify) this.lobby.send({ type: 'stop', id: this.round.id });
    this.clear(); this.lobby.roundEnded(); this.aborted(reason);
  }
  returnToLobby() {
    if (this.round?.phase === 'playing') { this.abort('대기실로 돌아왔어요. 다시 준비하면 새 경기를 시작합니다.'); return; }
    this.clear(); this.lobby.roundEnded(); this.aborted('다시 준비하면 같은 친구와 한 판 더 할 수 있어요.');
  }
}
