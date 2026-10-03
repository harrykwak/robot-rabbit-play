import { INPUT_EDGES, RemoteCtrl, captureInput, captureSnapshot, PeerReplica } from './peer-match.js';
import { validRoomConfig } from './room-protocol.js';

// Host browser owns simulation. Server binds guest intents to approved roster IDs.
export class RoomSession {
  constructor({game,lobby,startGame,showResult,paused,resumed,aborted}){Object.assign(this,{game,lobby,startGame,showResult,paused,resumed,aborted});this.round=null;this.replica=null;this.controls=new Map();}
  get active(){return !!this.round;}
  get guest(){return this.round?.role==='guest';}
  start(message){
    if(!validRoomConfig(message.config)||typeof message.id!=='string'||!/^[a-f0-9]{32}$/.test(message.id))return;
    if(this.round?.id===message.id)return;
    const local=message.config.roster.find(p=>p.id===this.lobby.self?.id);if(!local)return;
    this.clear();const role=this.lobby.role;
    this.round={id:message.id,role,config:message.config,phase:'playing',seq:0,inputSeq:Math.max(0,this.lobby.inputSeq||0),elapsed:0,inputElapsed:0,inputClock:0,inputEdges:{},localPaused:false,remotePaused:false};
    this.startGame(message.config,role,local.slot);
    if(role==='host'){
      for(const p of message.config.roster)if(p.slot!==0){const ctrl=new RemoteCtrl();this.controls.set(p.id,ctrl);this.game.humans[p.slot].ctrl=ctrl;}
    }else this.replica=new PeerReplica(this.game,{matchId:message.id,localIndex:local.slot});
  }
  receive(message){
    const r=this.round;if(!r)return;
    if(message.type==='transport-offline'){for(const c of this.controls.values())c.reset();if(r.role==='host'){r.localPaused=true;this.paused('로비 연결을 복구하는 동안 경기를 멈췄습니다.');}return;}
    if(message.type==='presence'){if(!message.online)this.controls.get(message.id)?.reset();return;}
    if(message.type==='stop'){this.clear();this.aborted(message.reason);return;}
    if(message.id!==r.id)return;
    if(message.type==='input'&&r.role==='host'&&!r.localPaused)this.controls.get(message.from)?.receive(message.input);
    else if(message.type==='snapshot'&&r.role==='guest')this.replica?.accept(message.state);
    else if(message.type==='result'&&r.role==='guest'&&message.state?.phase==='end'&&this.replica?.accept(message.state)){r.phase='result';this.showResult(this.game.results());}
    else if(message.type==='pause'&&typeof message.paused==='boolean'){
      r.remotePaused=message.paused;r.inputEdges={};r.inputElapsed=0;
      for(const c of this.controls.values())c.reset();
      if(message.paused)this.paused('호스트가 경기를 잠시 멈췄습니다.');else if(!r.localPaused)this.resumed();
    }
  }
  update(dt,intents){
    const r=this.round;if(!r||r.phase!=='playing'||r.localPaused||r.remotePaused)return;
    if(r.role==='host'){
      this.game.update(dt,false);if(r.phase!=='playing')return;r.elapsed+=dt;
      if(r.elapsed>=.05){r.elapsed%=.05;const state=captureSnapshot(this.game,{matchId:r.id,seq:++r.seq});if(state)this.lobby.send({type:'snapshot',id:r.id,state});}
    }else{
      r.inputClock+=dt;r.inputElapsed+=dt;for(const k of INPUT_EDGES)if(intents[k])r.inputEdges[k]=r.inputClock+.22;
      if(r.inputElapsed>=1/30){r.inputElapsed%=1/30;const input=captureInput(intents,++r.inputSeq);for(const k of INPUT_EDGES)input[k]=(r.inputEdges[k]??-Infinity)>r.inputClock;if(this.lobby.send({type:'input',id:r.id,input}))r.inputEdges={};}
      this.replica?.update(dt);
    }
  }
  localResult(){const r=this.round;if(!r||r.role!=='host'||r.phase!=='playing')return;r.phase='result';const state=captureSnapshot(this.game,{matchId:r.id,seq:++r.seq});let tries=0;
    const send=async()=>{if(this.round!==r||!state)return;try{await this.lobby.request('/api/game',{type:'result',id:r.id,state});}catch(e){if(++tries<5)this.resultTimer=setTimeout(send,500);else this.lobby.status(e.message,true);}};send();}
  setPaused(value){const r=this.round;if(!r)return;r.localPaused=value;r.inputEdges={};r.inputElapsed=0;for(const c of this.controls.values())c.reset();
    if(r.role==='host')this.lobby.request('/api/game',{type:'pause',id:r.id,paused:value}).catch(e=>this.lobby.status(e.message,true));
    if(value)this.paused(r.role==='host'?'모든 참가자의 경기를 잠시 멈췄습니다.':'메뉴를 보는 동안 내 조작만 멈춥니다.');else if(!r.remotePaused)this.resumed();}
  clear(){clearTimeout(this.resultTimer);this.replica?.dispose();this.replica=null;for(const c of this.controls.values())c.reset();this.controls.clear();this.round=null;}
  abort(reason='방 연결이 끝났습니다.'){this.clear();this.aborted(reason);}
  returnToLobby(){if(this.lobby.role==='host')this.lobby.perform(async()=>{await this.lobby.action('stop');this.clear();this.aborted('참가자들이 로비로 돌아왔습니다.');});else this.lobby.perform(()=>this.lobby.leave());}
}
