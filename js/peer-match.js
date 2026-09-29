// Explicit, bounded presentation state. Guests never run combat or trust remote code.
import * as THREE from 'three';
import { KEYS, applyRig } from './poses.js';
import { ROBOT_ORDER } from './data.js';
import * as audio from './audio.js';

const EDGES = ['jump','atk','hvy','dash','actP','grdP'];
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

const HNUM=['hp','maxHp','stock','gauge','stateT','boardT','boardNeed','invuln','dashCd','respawnT','kos','falls','dmgDealt','outOrder','gh','shieldT'];
const RNUM=['armor','maxArmor','stateT','idleT','gh','eyeLevel'];
const rootState = mesh => ({p:mesh.position.toArray().map(round),q:mesh.quaternion.toArray().map(round),s:mesh.scale.toArray().map(round),visible:mesh.visible});
const fighterState = f => ({...rootState(f.rig.root),pos:f.pos.toArray().map(round),pose:KEYS.map(k=>round(f.pose[k])),hipY:round(f.rig.hips.position.y),state:f.state,onGround:!!f.onGround,
  parts:['remote','handL','handR'].map(k=>f.rig[k]?.visible ?? true)});
const numbers = (o,keys)=>Object.fromEntries(keys.map(k=>[k,round(o[k]||0)]));
export function captureSnapshot(game,{matchId,seq,onInvalid}) {
  const state={v:1,matchId,seq,time:round(game.time),timeLeft:round(game.timeLeft),phase:game.phase,introStep:game.introStep ?? -1,
    humans:game.humans.map(h=>({...fighterState(h),...numbers(h,HNUM),id:h.id,dead:h.dead,out:h.out,riding:h.riding?.id??null,boardTarget:h.boardTarget?.id??null,
      combo:{n:h.combo.n,dmg:round(h.combo.dmg),best:h.combo.best}})),
    robots:game.robots.map(r=>({...fighterState(r),...numbers(r,RNUM),id:r.id,type:r.type,owner:r.owner?.id??null,pilot:r.pilot?.id??null,cds:numbers(r.cds,['k','l','dash']),ring:rootState(r.ring)})),
    projectiles:game.projectiles.map(p=>({...rootState(p.mesh),type:p.type})),
    carrots:game.carrots.map(c=>rootState(c.mesh)),
    shields:game.shields.map(s=>({...rootState(s.mesh),color:s.h.color,alpha:round(Math.min(1,s.mesh.material.uniforms.alpha.value))})),
    rings:game.fx.rings.filter(r=>r.on&&r.m.visible).map(r=>({...rootState(r.m),color:r.m.material.color.toArray().map(round),alpha:round(r.m.material.opacity)})),
    beams:game.robots.map(r=>r.beam?.snapshot?.()).filter(Boolean).map(b=>({...b,from:b.from.map(round),to:b.to.map(round)}))};
  if (validateSnapshot(state,matchId)) return state;
  onInvalid?.(state); return null;
}
const validRoot = r=>r && vector(r.p,3) && vector(r.q,4,1.01) && Math.abs(Math.hypot(...r.q)-1)<.01 && vector(r.s,3,200) && r.s.every(v=>v>=0) && bool(r.visible);
const validFighter = f=>validRoot(f) && vector(f.pos,3) && vector(f.pose,KEYS.length,1000) && num(f.hipY,-100,100) && typeof f.state==='string' && /^[a-zA-Z]{1,24}$/.test(f.state)
  && bool(f.onGround) && Array.isArray(f.parts) && f.parts.length===3 && f.parts.every(bool);
export function validateSnapshot(s,matchId) {
  try {
    if(!s || s.v!==1 || s.matchId!==matchId || !integer(s.seq) || !num(s.time,0,7200) || !num(s.timeLeft,-1,7200) || !['intro','fight','end'].includes(s.phase) || !integer(s.introStep,-1,3)) return false;
    if(!Array.isArray(s.humans)||s.humans.length!==4 || !Array.isArray(s.robots)||s.robots.length>12) return false;
    const ids=new Set(s.robots.map(r=>r.id)); if(ids.size!==s.robots.length) return false;
    const rid=id=>id===null||ids.has(id), hid=id=>id===null||integer(id,0,3);
    if(!s.humans.every((h,i)=>h.id===i&&validFighter(h)&&HNUM.every(k=>num(h[k],-1000,1000000))&&integer(h.stock,0,3)&&num(h.hp,0,h.maxHp)&&num(h.maxHp,1,1000)
      && bool(h.dead)&&bool(h.out)&&rid(h.riding)&&rid(h.boardTarget)&&h.combo&&['n','dmg','best'].every(k=>num(h.combo[k],0,1000000)))) return false;
    if(!s.robots.every(r=>integer(r.id,100,1000000)&&ROBOT_ORDER.includes(r.type)&&validFighter(r)&&RNUM.every(k=>num(r[k],-1000,10000))&&num(r.armor,0,r.maxArmor)&&num(r.maxArmor,1,10000)
      && hid(r.owner)&&hid(r.pilot)&&r.cds&&['k','l','dash'].every(k=>num(r.cds[k],-7200,1000))&&validRoot(r.ring))) return false;
    if(!s.humans.every(h=>h.riding===null||s.robots.find(r=>r.id===h.riding)?.pilot===h.id) || !s.robots.every(r=>r.pilot===null||s.humans[r.pilot].riding===r.id)) return false;
    if(!Array.isArray(s.projectiles)||s.projectiles.length>64||!s.projectiles.every(p=>validRoot(p)&&['shot','boomer','fist','missile'].includes(p.type)))return false;
    if(!Array.isArray(s.carrots)||s.carrots.length>8||!s.carrots.every(validRoot))return false;
    if(!Array.isArray(s.shields)||s.shields.length>8||!s.shields.every(p=>validRoot(p)&&integer(p.color,0,0xffffff)&&num(p.alpha,0,1)))return false;
    if(!Array.isArray(s.rings)||s.rings.length>40||!s.rings.every(p=>validRoot(p)&&vector(p.color,3,100)&&num(p.alpha,0,5)))return false;
    if(!Array.isArray(s.beams)||s.beams.length>4||!s.beams.every(b=>vector(b.from,3)&&vector(b.to,3)&&num(b.width,.01,10)&&integer(b.color,0,0xffffff)))return false;
    return new TextEncoder().encode(JSON.stringify(s)).length<=44000;
  }catch{return false;}
}

function setRoot(mesh,s) { mesh.position.fromArray(s.p); mesh.quaternion.fromArray(s.q).normalize(); mesh.scale.fromArray(s.s); mesh.visible=s.visible; }
export class PeerReplica {
  constructor(game,{matchId,localIndex=1}) {
    this.game=game; this.matchId=matchId; this.localIndex=localIndex; this.seq=-1; this.targets=new Map(); this.pools={};
    this.group=new THREE.Group(); game.scene.add(this.group);
    this.geometries={shot:new THREE.SphereGeometry(.42,8,6),boomer:new THREE.TorusGeometry(.7,.16,6,12),fist:new THREE.BoxGeometry(1.6,1.6,2),missile:new THREE.ConeGeometry(.45,1.7,8),carrot:new THREE.ConeGeometry(.4,1.7,8),shield:new THREE.IcosahedronGeometry(1,1),ring:new THREE.PlaneGeometry(2,2),beam:new THREE.CylinderGeometry(1,1,1,8)};
    this.geometries.beam.translate(0,.5,0); this.up=new THREE.Vector3(0,1,0); this.direction=new THREE.Vector3();
  }
  accept(s) {
    if(s?.seq<=this.seq||!validateSnapshot(s,this.matchId))return false;
    const g=this.game, first=this.seq<0, previousPhase=g.phase;
    this.seq=s.seq;
    // Detach pilots before removing a robot, so a robot disposer cannot own their rigs.
    for(const h of g.humans) if(h.rig.root.parent!==g.scene && (s.humans[h.id].riding!==h.riding?.id || !s.robots.some(r=>r.id===h.riding?.id&&r.type===h.riding.type))) g.scene.attach(h.rig.root);
    for(const r of [...g.robots]) if(!s.robots.some(x=>x.id===r.id&&x.type===r.type)) { this.targets.delete(r); r.dispose(); g.robots.splice(g.robots.indexOf(r),1); }
    for(const x of s.robots) {
      let r=g.robots.find(r=>r.id===x.id);
      if(!r){r=g.createPeerRobot(x.type,g.humans[x.owner??0],x.pos[0],x.pos[2]);r.id=x.id;g.robots.push(r);}
      Object.assign(r,Object.fromEntries(RNUM.map(k=>[k,x[k]])),{state:x.state,owner:x.owner===null?null:g.humans[x.owner],pilot:x.pilot===null?null:g.humans[x.pilot],cds:{...x.cds}});
      this.fighter(r,x,first); setRoot(r.ring,x.ring); r.setEyes(x.eyeLevel);
    }
    for(const x of s.humans) {
      const h=g.humans[x.id], wasRiding=h.riding?.id??null, oldHp=h.hp, oldStock=h.stock;
      Object.assign(h,Object.fromEntries(HNUM.map(k=>[k,x[k]])),{state:x.state,dead:x.dead,out:x.out,combo:{...h.combo,...x.combo},riding:g.robots.find(r=>r.id===x.riding)||null,boardTarget:g.robots.find(r=>r.id===x.boardTarget)||null});
      if(h.riding && h.rig.root.parent!==h.riding.rig.cockpit) h.riding.rig.cockpit.add(h.rig.root);
      this.fighter(h,x,first||wasRiding!==x.riding);
      if(!first&&x.hp<oldHp&&x.stock===oldStock) { g.fx.hit(h.pos,this.up,1,h.color); if(h.isPlayer) {g.ui.flash(.15);audio.sfx('punch');} }
      if(!first&&wasRiding!==x.riding&&x.riding!==null) audio.sfx('board');
    }
    g.time=s.time;g.timeLeft=s.timeLeft;g.phase=s.phase;
    if(s.phase==='intro'&&g.introStep!==s.introStep&&s.introStep>=0){g.ui.banner(['3','2','1'][s.introStep]||'FIGHT!','ready');audio.sfx('countdown');}
    g.introStep=s.introStep;
    if(previousPhase==='intro'&&s.phase==='fight'){g.ui.banner('FIGHT!','go');audio.sfx('go');}
    if(previousPhase!=='end'&&s.phase==='end'){const win=g.results()[0].h===g.player;g.ui.banner(win?'VICTORY!':'GAME SET',win?'win':'ko');audio.stopMusic();audio.sfx(win?'victory':'defeat');}
    this.visuals('projectiles',s.projectiles,p=>p.type);
    this.visuals('carrots',s.carrots,()=> 'carrot');
    this.visuals('shields',s.shields,()=> 'shield');
    this.visuals('rings',s.rings,()=> 'ring');
    this.visuals('beams',s.beams,()=> 'beam');
    return true;
  }
  fighter(f,s,snap) {
    f.pos.fromArray(s.pos);f.onGround=s.onGround;f.state=s.state;
    for(let i=0;i<KEYS.length;i++)f.pose[KEYS[i]]=s.pose[i];
    applyRig(f.rig,f.pose,f.restHips,f.sc);f.rig.hips.position.y=s.hipY;
    ['remote','handL','handR'].forEach((k,i)=>{if(f.rig[k])f.rig[k].visible=s.parts[i];});
    const root=f.rig.root;
    if(snap||!this.targets.has(f))setRoot(root,s);
    root.scale.fromArray(s.s);root.visible=s.visible;
    // Reuse one target per fighter; 20Hz snapshots would otherwise allocate a Vector3+Quaternion each.
    let t=this.targets.get(f);
    if(!t)this.targets.set(f,t={p:new THREE.Vector3(),q:new THREE.Quaternion()});
    t.p.fromArray(s.p);t.q.fromArray(s.q).normalize();
  }
  visuals(key,items,typeOf) {
    const pool=this.pools[key] ||= [];
    items.forEach((s,i)=>{
      const type=typeOf(s);let entry=pool[i];
      if(!entry||entry.type!==type){if(entry){this.group.remove(entry.mesh);entry.mesh.material.dispose();}
        const material=new THREE.MeshBasicMaterial({color:type==='shot'?0xff68d0:type==='fist'?0xaeeeff:0xffa233,transparent:true,depthWrite:!['ring','shield','beam'].includes(type),side:THREE.DoubleSide});
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
    const a=1-Math.exp(-dt*30);
    for(const [f,t]of this.targets){f.rig.root.position.lerp(t.p,a);f.rig.root.quaternion.slerp(t.q,a);}
    const g=this.game;g.fx.update(dt,dt);g.arena.update(dt,g.time);g.updateCamera(dt);
  }
  dispose() {
    for(const pool of Object.values(this.pools))for(const p of pool)p.mesh.material.dispose();
    for(const geometry of Object.values(this.geometries))geometry.dispose();
    this.group.removeFromParent();this.targets.clear();
    for(const h of this.game.humans)if(h.rig.root.parent!==this.game.scene)this.game.scene.attach(h.rig.root);
  }
}
