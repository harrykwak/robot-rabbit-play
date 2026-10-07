// Explicit, bounded presentation state. Guests never run combat or trust remote code.
import * as THREE from 'three';
import { KEYS, applyRig } from './poses.js';
import { ROBOT_ORDER } from './data.js';
import { PART_ALL } from './robot-systems.js';
import { HUMAN_ACTS, ROBOT_ACTS } from './actions.js';
import { PEER_VERSION } from './peer-protocol.js';
import * as audio from './audio.js';

export const INPUT_EDGES = ['jump','atk','hvy','dash','actP','grdP'];
const EDGES = INPUT_EDGES;
const BUTTONS = [...EDGES, 'atkD','hvyD','grd','act'];
const neutral = () => Object.fromEntries([['mx',0],['mz',0], ...BUTTONS.map(k=>[k,false])]);
const num = (v, min=-10000, max=10000) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const integer = (v,min=0,max=Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(v) && v>=min && v<=max;
const round = n => Math.round(n * 1000) / 1000;
const vector = (a,n,b=1000) => Array.isArray(a) && a.length===n && a.every(v=>num(v,-b,b));
const bool = v=> typeof v==='boolean';
export function captureInput(intents, seq) {
  const packet = { seq, mx: Number.isFinite(intents.mx) ? intents.mx : 0, mz: Number.isFinite(intents.mz) ? intents.mz : 0 };
  const length=Math.max(1,Math.hypot(packet.mx,packet.mz)); packet.mx/=length; packet.mz/=length;
  for(const k of BUTTONS) packet[k]=!!intents[k];
  return packet;
}
export class RemoteCtrl {
  constructor(now=()=>performance.now()) { this.now=now; this.seq=-1; this.reset(); }
  receive(p) {
    if(!p || !integer(p.seq) || p.seq<=this.seq || !num(p.mx,-1,1) || !num(p.mz,-1,1) || Math.hypot(p.mx,p.mz)>1.001 || !BUTTONS.every(k=>bool(p[k]))) return false;
    this.seq=p.seq; this.received=this.now(); this.latest=captureInput(p,p.seq);
    for(const k of EDGES) if(p[k]) this.lat[k]=this.received;
    return true;
  }
  think() {
    const now=this.now();
    if(now-this.received>250) { this.reset(); return; }
    Object.assign(this.in,this.latest);
    for(const k of EDGES) this.in[k]=now-this.lat[k]<220;
  }
  consume() { for(const k of EDGES) { if(this.in[k]) this.lat[k]=-Infinity; this.in[k]=false; } }
  clear(fields) { for(const k of fields) { this.lat[k]=-Infinity; if(k in this.in) this.in[k]=false; if(k in this.latest) this.latest[k]=false; } }
  reset() { this.in=neutral(); this.latest=neutral(); this.received=-Infinity; this.lat=Object.fromEntries(EDGES.map(k=>[k,-Infinity])); }
}

// v1.4: cd1/cd2/cd2Max (skill HUD), hitsTaken (break burst), bubbleT (Dori barrier), exposedT (robot weak point)
const HNUM=['hp','maxHp','stock','gauge','stateT','boardT','boardNeed','invuln','dashCd','respawnT','kos','falls','dmgDealt','outOrder','gh','shieldT','cd1','cd2','cd2Max','hitsTaken','bubbleT','koT','ejectHold','attackPoints','supplyId','supplyProgress'];
// v1.5: juice/maxJuice (carrot juice energy), broken (destroyed parts bitmask, robot-systems.js PART_BIT)
const RNUM=['armor','maxArmor','stateT','idleT','gh','eyeLevel','exposedT','juice','maxJuice','broken'];
const rootState = mesh => ({p:mesh.position.toArray().map(round),q:mesh.quaternion.toArray().map(round),s:mesh.scale.toArray().map(round),visible:mesh.visible});
const fighterState = f => ({...rootState(f.rig.root),pos:f.pos.toArray().map(round),pose:KEYS.map(k=>round(f.pose[k])),hipY:round(f.rig.hips.position.y),state:f.state,onGround:!!f.onGround,
  facing:round(f.facing),action:f.act?.name??null,actionTime:round(f.act?.t||0),spinYaw:round(f.spinYaw||0),parts:['remote','handL','handR'].map(k=>f.rig[k]?.visible ?? true)});
const numbers = (o,keys)=>Object.fromEntries(keys.map(k=>[k,round(o[k]||0)]));
export function captureSnapshot(game,{matchId,seq,onInvalid,inputAcks}) {
  const state={v:PEER_VERSION,matchId,seq,time:round(game.time),timeLeft:round(game.timeLeft),phase:game.phase,introStep:game.introStep ?? -1,
    humans:game.humans.map(h=>({...fighterState(h),...numbers(h,HNUM),id:h.id,dead:h.dead,out:h.out,riding:h.riding?.id??null,boardTarget:h.boardTarget?.id??null,
      combo:{n:h.combo.n,dmg:round(h.combo.dmg),best:h.combo.best}})),
    robots:game.robots.map(r=>({...fighterState(r),...numbers(r,RNUM),id:r.id,type:r.type,owner:r.owner?.id??null,pilot:r.pilot?.id??null,cds:numbers(r.cds,['k','l','dash']),ring:rootState(r.ring)})),
    projectiles:game.projectiles.map(p=>({...rootState(p.mesh),type:p.type})),
    carrots:game.carrots.map(c=>rootState(c.mesh)),
    traps:(game.traps||[]).map(t=>rootState(t.mesh)),
    shields:game.shields.map(s=>({...rootState(s.mesh),color:s.h.color,alpha:round(Math.min(1,s.mesh.material.uniforms.alpha.value))})),
    rings:game.fx.rings.filter(r=>r.on&&r.m.visible).map(r=>({...rootState(r.m),color:r.m.material.color.toArray().map(round),alpha:round(r.m.material.opacity)})),
    beams:game.robots.map(r=>r.beam?.snapshot?.()).filter(Boolean).map(b=>({...b,from:b.from.map(round),to:b.to.map(round)}))};
  if(inputAcks!==undefined)state.inputAcks=Array.isArray(inputAcks)?[...inputAcks]:inputAcks;
  if (validateSnapshot(state,matchId)) return state;
  onInvalid?.(state); return null;
}
const validRoot = r=>r && vector(r.p,3) && vector(r.q,4,1.01) && Math.abs(Math.hypot(...r.q)-1)<.01 && vector(r.s,3,200) && r.s.every(v=>v>=0) && bool(r.visible);
const validFighter = f=>validRoot(f) && vector(f.pos,3) && vector(f.pose,KEYS.length,1000) && num(f.hipY,-100,100) && typeof f.state==='string' && /^[a-zA-Z]{1,24}$/.test(f.state)
  && num(f.facing,-100000,100000) && (f.actionTime===undefined||num(f.actionTime,0,30)) && num(f.spinYaw) && bool(f.onGround) && Array.isArray(f.parts) && f.parts.length===3 && f.parts.every(bool);
const validAction = (name, table)=>name===null||(typeof name==='string'&&Object.hasOwn(table,name));
export function validateSnapshot(s,matchId) {
  try {
    if(!s || s.v!==PEER_VERSION || s.matchId!==matchId || !integer(s.seq) || !num(s.time,0,7200) || !num(s.timeLeft,-1,7200) || !['intro','fight','end'].includes(s.phase) || !integer(s.introStep,-1,3)) return false;
    if(s.inputAcks!==undefined&&(!Array.isArray(s.inputAcks)||s.inputAcks.length!==4||!s.inputAcks.every(v=>integer(v,-1))))return false;
    if(!Array.isArray(s.humans)||s.humans.length!==4 || !Array.isArray(s.robots)||s.robots.length>12) return false;
    const ids=new Set(s.robots.map(r=>r.id)); if(ids.size!==s.robots.length) return false;
    const rid=id=>id===null||ids.has(id), hid=id=>id===null||integer(id,0,3);
    if(!s.humans.every((h,i)=>h.id===i&&validFighter(h)&&HNUM.every(k=>num(h[k],-1000,1000000))&&integer(h.stock,0,3)&&num(h.hp,0,h.maxHp)&&num(h.maxHp,1,1000)
      && validAction(h.action,HUMAN_ACTS)&&bool(h.dead)&&bool(h.out)&&rid(h.riding)&&rid(h.boardTarget)&&h.combo&&['n','dmg','best'].every(k=>num(h.combo[k],0,1000000)))) return false;
    if(!s.humans.every(h=>num(h.attackPoints,0,999)&&integer(h.supplyId,-1,1)&&num(h.supplyProgress,0,1)))return false;
    if(!s.robots.every(r=>integer(r.id,100,1000000)&&ROBOT_ORDER.includes(r.type)&&validFighter(r)&&RNUM.every(k=>num(r[k],-1000,10000))&&num(r.armor,0,r.maxArmor)&&num(r.maxArmor,1,10000)
      && num(r.maxJuice,1,1000)&&num(r.juice,0,r.maxJuice)&&integer(r.broken,0,PART_ALL)
      && validAction(r.action,ROBOT_ACTS)&&hid(r.owner)&&hid(r.pilot)&&r.cds&&['k','l','dash'].every(k=>num(r.cds[k],-7200,1000))&&validRoot(r.ring))) return false;
    if(!s.humans.every(h=>h.riding===null||s.robots.find(r=>r.id===h.riding)?.pilot===h.id) || !s.robots.every(r=>r.pilot===null||s.humans[r.pilot].riding===r.id)) return false;
    if(!Array.isArray(s.projectiles)||s.projectiles.length>64||!s.projectiles.every(p=>validRoot(p)&&['shot','boomer','fist','missile'].includes(p.type)))return false;
    if(!Array.isArray(s.carrots)||s.carrots.length>8||!s.carrots.every(validRoot))return false;
    if(!Array.isArray(s.traps)||s.traps.length>8||!s.traps.every(validRoot))return false;
    if(!Array.isArray(s.shields)||s.shields.length>8||!s.shields.every(p=>validRoot(p)&&integer(p.color,0,0xffffff)&&num(p.alpha,0,1)))return false;
    if(!Array.isArray(s.rings)||s.rings.length>40||!s.rings.every(p=>validRoot(p)&&vector(p.color,3,100)&&num(p.alpha,0,5)))return false;
    if(!Array.isArray(s.beams)||s.beams.length>4||!s.beams.every(b=>vector(b.from,3)&&vector(b.to,3)&&num(b.width,.01,10)&&integer(b.color,0,0xffffff)))return false;
    return new TextEncoder().encode(JSON.stringify(s)).length<=44000;
  }catch{return false;}
}

function setRoot(mesh,s) { mesh.position.fromArray(s.p); mesh.quaternion.fromArray(s.q).normalize(); mesh.scale.fromArray(s.s); mesh.visible=s.visible; }
const HISTORY_LIMIT = 8, MAX_EXTRAPOLATION = .08, MAX_EXTRAPOLATION_DISTANCE = .6;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const angleDelta = (from, to) => Math.atan2(Math.sin(to-from), Math.cos(to-from));
export class PeerReplica {
  constructor(game,{matchId,localIndex=1,now=()=>performance.now()}) {
    this.game=game; this.matchId=matchId; this.localIndex=localIndex; this.seq=-1; this.targets=new Map(); this.pools={};
    this.now=now;this.bufferDelay=.1;this.interval=.05;this.jitter=0;this.playbackTime=null;this.latestTime=null;this.receivedAt=null;
    this.samplePosition=new THREE.Vector3();this.sampleQuaternion=new THREE.Quaternion();
    // Game.start builds player 0 before the guest switches control to player 1.
    // Reassign the two existing shared textures to the actual local player.
    const playerMark=game.humans.find(h=>h.markPlayer)?.mark?.material.map;
    const otherMark=game.humans.find(h=>!h.markPlayer)?.mark?.material.map;
    if(playerMark&&otherMark)for(const h of game.humans){h.markPlayer=!!h.isPlayer;h.mark.material.map=h.isPlayer?playerMark:otherMark;}
    this.group=new THREE.Group(); game.scene.add(this.group);
    this.geometries={shot:new THREE.SphereGeometry(.42,8,6),boomer:new THREE.TorusGeometry(.7,.16,6,12),fist:new THREE.BoxGeometry(1.6,1.6,2),missile:new THREE.ConeGeometry(.45,1.7,8),carrot:new THREE.ConeGeometry(.4,1.7,8),trap:new THREE.CircleGeometry(.9,12),shield:new THREE.IcosahedronGeometry(1,1),ring:new THREE.PlaneGeometry(2,2),beam:new THREE.CylinderGeometry(1,1,1,8)};
    this.geometries.beam.translate(0,.5,0); this.up=new THREE.Vector3(0,1,0); this.direction=new THREE.Vector3();
  }
  accept(s) {
    if(s?.seq<=this.seq||!validateSnapshot(s,this.matchId))return false;
    this.clearLocalOffset();
    const g=this.game, first=this.seq<0, previousPhase=g.phase;
    const arrival=this.now()/1000, gap=this.latestTime===null?0:s.time-this.latestTime;
    const reset=first||gap>.5||gap<0||s.phase==='end'||s.time-this.playbackTime>.5;
    if(reset)this.playbackTime=s.time-this.bufferDelay;
    else if(gap>0){
      this.interval+=(gap-this.interval)*.15;
      this.jitter+=(Math.abs(arrival-this.receivedAt-gap)-this.jitter)*.15;
      this.bufferDelay=clamp(this.interval*1.2+this.jitter*2,.08,.15);
    }
    this.latestTime=s.time;this.receivedAt=arrival;
    this.seq=s.seq;
    // Detach pilots before removing a robot, so a robot disposer cannot own their rigs.
    for(const h of g.humans) if(h.rig.root.parent!==g.scene && (s.humans[h.id].riding!==h.riding?.id || !s.robots.some(r=>r.id===h.riding?.id&&r.type===h.riding.type))) g.scene.attach(h.rig.root);
    for(const r of [...g.robots]) if(!s.robots.some(x=>x.id===r.id&&x.type===r.type)) { this.targets.delete(r); r.dispose(); g.robots.splice(g.robots.indexOf(r),1); }
    for(const x of s.robots) {
      let r=g.robots.find(r=>r.id===x.id), fresh=false;
      if(!r){r=g.createPeerRobot(x.type,g.humans[x.owner??0],x.pos[0],x.pos[2]);r.id=x.id;g.robots.push(r);fresh=true;}
      const prevBroken=r.broken;
      Object.assign(r,Object.fromEntries(RNUM.map(k=>[k,x[k]])),{state:x.state,owner:x.owner===null?null:g.humans[x.owner],pilot:x.pilot===null?null:g.humans[x.pilot],cds:{...x.cds}});
      if(fresh||prevBroken!==r.broken)r.syncBroken(prevBroken,!first&&!fresh);
      this.fighter(r,x,reset); setRoot(r.ring,x.ring); r.setEyes(x.eyeLevel);
    }
    for(const x of s.humans) {
      const h=g.humans[x.id], wasRiding=h.riding?.id??null, oldHp=h.hp, oldStock=h.stock, oldDead=h.dead, oldOut=h.out, oldDamage=h.dmgDealt;
      Object.assign(h,Object.fromEntries(HNUM.map(k=>[k,x[k]])),{state:x.state,dead:x.dead,out:x.out,combo:{...h.combo,...x.combo},riding:g.robots.find(r=>r.id===x.riding)||null,boardTarget:g.robots.find(r=>r.id===x.boardTarget)||null});
      if(h.riding && h.rig.root.parent!==h.riding.rig.cockpit) h.riding.rig.cockpit.add(h.rig.root);
      this.fighter(h,x,reset||wasRiding!==x.riding||oldStock!==x.stock||oldDead!==x.dead||oldOut!==x.out);
      if(!first&&x.hp<oldHp&&x.stock===oldStock) { g.fx.hit(h.pos,this.up,1,h.color); if(h.isPlayer) {g.ui.flash(.15);audio.sfx('punch');} }
      if(!first&&h.isPlayer&&h.riding&&wasRiding===x.riding&&x.dmgDealt>oldDamage) g.cockpitCamera?.confirmHit(Math.min(3,(x.dmgDealt-oldDamage)/6));
      if(!first&&wasRiding!==x.riding&&x.riding!==null) audio.sfx('board');
    }
    g.time=s.time;g.timeLeft=s.timeLeft;g.phase=s.phase;
    this.visualTime=first?s.time:Math.max(s.time,this.visualTime??s.time);
    if(s.phase==='intro'&&g.introStep!==s.introStep&&s.introStep>=0){g.ui.banner(['3','2','1'][s.introStep]||'FIGHT!','ready');audio.sfx('countdown');}
    g.introStep=s.introStep;
    if(previousPhase==='intro'&&s.phase==='fight'){g.ui.banner('FIGHT!','go');audio.sfx('go');}
    if(previousPhase!=='end'&&s.phase==='end'){const win=g.results()[0].h===g.player;g.ui.banner(win?'VICTORY!':'GAME SET',win?'win':'ko');audio.stopMusic();audio.sfx(win?'victory':'defeat');}
    this.visuals('projectiles',s.projectiles,p=>p.type);
    this.visuals('carrots',s.carrots,()=> 'carrot');
    this.visuals('traps',s.traps,()=> 'trap');
    this.visuals('shields',s.shields,()=> 'shield');
    this.visuals('rings',s.rings,()=> 'ring');
    this.visuals('beams',s.beams,()=> 'beam');
    this.localPresentationAck?.(s.inputAcks?.[this.localIndex],s);
    return true;
  }
  fighter(f,s,snap) {
    f.clearBrokenMotionOffsets?.();
    f.pos.fromArray(s.pos);f.onGround=s.onGround;f.state=s.state;f.facing=s.facing;
    f.spinYaw=s.spinYaw;
    f.act=s.action===null?null:{name:s.action,t:s.actionTime??0,def:(f.kind==='robot'?ROBOT_ACTS:HUMAN_ACTS)[s.action]};
    for(let i=0;i<KEYS.length;i++)f.pose[KEYS[i]]=s.pose[i];
    applyRig(f.rig,f.pose,f.restHips,f.sc);f.rig.hips.position.y=s.hipY;
    if(f.kind==='robot')f.rig.presentMotion?.(f.pose,s.action,f.broken);
    if(f.kind==='robot')f.rig.presentCombat?.(f.pose,s.action,f.broken);
    ['remote','handL','handR'].forEach((k,i)=>{if(f.rig[k])f.rig[k].visible=s.parts[i];});
    const root=f.rig.root;
    if(snap||!this.targets.has(f))setRoot(root,s);
    root.scale.fromArray(s.s);root.visible=s.visible;
    // Reuse one target per fighter; 20Hz snapshots would otherwise allocate a Vector3+Quaternion each.
    let t=this.targets.get(f);
    const local=f.kind==='human'?f.id===this.localIndex:f.pilot?.id===this.localIndex;
    if(!t)this.targets.set(f,t={p:new THREE.Vector3(),q:new THREE.Quaternion(),displayPos:f.pos.clone(),history:[],parent:root.parent,local,facing:s.facing});
    if(snap||t.parent!==root.parent||t.local!==local||t.p.distanceToSquared(this.samplePosition.fromArray(s.p))>64||t.history.at(-1)?.state.visible!==s.visible){
      t.history.length=0;setRoot(root,s);
      t.displayPos.copy(f.pos);t.facing=s.facing;
      if(local)this.onLocalPresentationReset?.();
    }
    t.parent=root.parent;t.local=local;
    const sample={time:this.latestTime??this.game.time,state:s};
    if(t.history.at(-1)?.time===sample.time)t.history[t.history.length-1]=sample;
    else t.history.push(sample);
    if(t.history.length>HISTORY_LIMIT)t.history.shift();
    t.p.fromArray(s.p);t.q.fromArray(s.q).normalize();
    f.syncMark();
  }
  presentFighter(f,t,dt) {
    const history=t.history;if(!history.length)return;
    // The local pilot and their robot never pay the remote interpolation delay.
    const time=t.local?this.latestTime+Math.max(0,this.now()/1000-this.receivedAt):(this.playbackTime??history.at(-1).time);
    let a=history[0],b=a;
    for(let i=1;i<history.length;i++){
      b=history[i];if(time<=b.time)break;a=b;
    }
    let u=a===b?0:clamp((time-a.time)/(b.time-a.time),0,1);
    // Positions may coast for at most 80ms / 0.6m. Never extrapolate attack
    // poses or ownership, and never run guest physics or combat prediction.
    let extrapolation=0;
    if(time>history.at(-1).time&&history.length>1){
      b=history.at(-1);a=history.at(-2);u=1;
      const span=b.time-a.time;
      if(span>0&&!(t.local&&this.localPresentationOffset)&&a.state.onGround===b.state.onGround&&a.state.state===b.state.state){
        const distance=Math.max(
          Math.hypot(b.state.p[0]-a.state.p[0],b.state.p[1]-a.state.p[1],b.state.p[2]-a.state.p[2]),
          Math.hypot(b.state.pos[0]-a.state.pos[0],b.state.pos[1]-a.state.pos[1],b.state.pos[2]-a.state.pos[2]));
        extrapolation=Math.min(MAX_EXTRAPOLATION, time-b.time)/span;
        if(distance>0)extrapolation=Math.min(extrapolation,MAX_EXTRAPOLATION_DISTANCE/distance);
      }
    }
    const sa=a.state,sb=b.state,root=f.rig.root;
    if(t.local){
      const alpha=1-Math.exp(-Math.max(0,dt)*45);
      for(let i=0;i<3;i++)this.samplePosition.setComponent(i,sa.p[i]+(sb.p[i]-sa.p[i])*(u+extrapolation));
      root.position.lerp(this.samplePosition,alpha);
      for(let i=0;i<3;i++)this.samplePosition.setComponent(i,sa.pos[i]+(sb.pos[i]-sa.pos[i])*(u+extrapolation));
      f.pos.copy(t.displayPos.lerp(this.samplePosition,alpha));
      root.quaternion.slerp(this.sampleQuaternion.fromArray(sb.q).normalize(),alpha);
      f.facing=t.facing+=angleDelta(t.facing,sb.facing)*alpha;
    }else{
      root.position.fromArray(sa.p).lerp(this.samplePosition.fromArray(sb.p),u+extrapolation);
      f.pos.fromArray(sa.pos).lerp(this.samplePosition.fromArray(sb.pos),u+extrapolation);t.displayPos.copy(f.pos);
      root.quaternion.fromArray(sa.q).normalize().slerp(this.sampleQuaternion.fromArray(sb.q).normalize(),u);
      f.facing=sa.facing+angleDelta(sa.facing,sb.facing)*u;
    }
    root.scale.fromArray(sa.s).lerp(this.samplePosition.fromArray(sb.s),u);
    // Discrete action changes cannot blend a new attack's parameters with the
    // previous action. Statistics remain the latest authoritative values.
    const poseA=sa.action===sb.action?sa:(u<1?sa:sb),poseB=sa.action===sb.action?sb:poseA;
    f.clearBrokenMotionOffsets?.();
    for(let i=0;i<KEYS.length;i++)f.pose[KEYS[i]]=poseA.pose[i]+(poseB.pose[i]-poseA.pose[i])*u;
    applyRig(f.rig,f.pose,f.restHips,f.sc);f.rig.hips.position.y=poseA.hipY+(poseB.hipY-poseA.hipY)*u;
    if(f.kind==='robot'){
      f.rig.presentMotion?.(f.pose,poseA.action,f.broken);
      f.rig.presentCombat?.(f.pose,poseA.action,f.broken);
    }
  }
  clearLocalOffset() {
    const applied=this.localOffsetApplied;if(!applied)return;
    applied.actor.rig.root.position.sub(applied.delta);applied.actor.pos.sub(applied.delta);
    if(applied.pilot!==applied.actor)applied.pilot.pos.sub(applied.delta);
    this.localOffsetApplied=null;
  }
  applyLocalOffset(dt) {
    if(!this.localPresentationOffset)return;
    const pilot=this.game.humans[this.localIndex],actor=pilot?.riding||pilot;
    if(!actor||actor.rig.root.parent!==this.game.scene||!actor.rig.root.visible||pilot.dead||pilot.out)return;
    const value=this.localPresentationOffset(dt,actor);
    if(!value||![value.x,value.y,value.z].every(Number.isFinite))return;
    const delta=this.predictionDelta??=new THREE.Vector3();delta.set(value.x,0,value.z).clampLength(0,1.2);
    if(delta.lengthSq()===0)return;
    actor.rig.root.position.add(delta);actor.pos.add(delta);
    if(pilot!==actor)pilot.pos.add(delta);
    this.localOffsetApplied={actor,pilot,delta};actor.syncMark();
  }
  visuals(key,items,typeOf) {
    const pool=this.pools[key] ||= [];
    items.forEach((s,i)=>{
      const type=typeOf(s);let entry=pool[i];
      if(!entry||entry.type!==type){if(entry){this.group.remove(entry.mesh);entry.mesh.material.dispose();}
        const material=new THREE.MeshBasicMaterial({color:type==='shot'?0xff68d0:type==='fist'?0xaeeeff:type==='trap'?0xb46cff:0xffa233,transparent:true,depthWrite:!['ring','shield','beam','trap'].includes(type),side:THREE.DoubleSide});
        if(type==='ring')material.map=this.game.fx.tex.ring;
        entry=pool[i]={type,mesh:new THREE.Mesh(this.geometries[type],material)};this.group.add(entry.mesh);
      }
      const m=entry.mesh;
      if(type==='beam'){m.visible=true;m.position.fromArray(s.from);this.direction.fromArray(s.to).sub(m.position);const len=this.direction.length();m.quaternion.setFromUnitVectors(this.up,this.direction.normalize());m.scale.set(s.width,len,s.width);m.material.color.setHex(s.color);m.material.opacity=.8;}
      else {setRoot(m,s);if(s.color!==undefined){if(Array.isArray(s.color))m.material.color.fromArray(s.color);else m.material.color.setHex(s.color);}m.material.opacity=s.alpha??1;if(type==='shield')m.material.opacity*=.3;}
    });
    for(let i=items.length;i<pool.length;i++)pool[i].mesh.visible=false;
  }
  update(dt) {
    this.clearLocalOffset();
    if(this.latestTime!==null){
      const desired=this.latestTime+Math.max(0,this.now()/1000-this.receivedAt)-this.bufferDelay;
      const rate=clamp(1+(desired-this.playbackTime)*2,.9,1.1);
      this.playbackTime=Math.min(this.latestTime+MAX_EXTRAPOLATION,this.playbackTime+Math.max(0,Math.min(dt,.1))*rate);
    }
    this.visualTime=Math.min(this.game.time+.15,(this.visualTime??this.game.time)+dt);
    for(const [f,t]of this.targets){
      this.presentFighter(f,t,dt);
      if(f.kind==='robot'){
        f.applyBrokenMotion?.(dt,this.visualTime);
        f.rig.animateFace?.(this.visualTime+f.id*.83);
      }
      if(f.kind==='human') f.rig.animateFace?.(this.visualTime+f.id*.37);
      f.syncMark();
      // Keep the mark on the ground while its fighter interpolates between packets.
      if(f.mark?.visible&&!f.mark.userData.rrProjectedGround)f.mark.position.y=f.gh-f.rig.root.position.y+.05;
    }
    for(const r of this.game.robots)if(r.debris?.length)r.updateDebris(dt);
    const g=this.game;g.fx.update(dt,dt);g.arena.update(dt,g.time);g.juiceStations?.present(this.visualTime);
    this.applyLocalOffset(dt);g.updateCamera(dt);
  }
  dispose() {
    this.clearLocalOffset();
    for(const pool of Object.values(this.pools))for(const p of pool)p.mesh.material.dispose();
    for(const geometry of Object.values(this.geometries))geometry.dispose();
    this.group.removeFromParent();this.targets.clear();
    for(const h of this.game.humans)if(h.rig.root.parent!==this.game.scene)this.game.scene.attach(h.rig.root);
  }
}
