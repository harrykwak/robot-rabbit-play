// Small local visual lead, never physics, hit detection, or authoritative state.
import * as THREE from 'three';
import { robotMods } from './robot-systems.js';

const HORIZON = .15, MAX_OFFSET = 1.2, MAX_INPUTS = 12;
const buttons = ['jump','atk','hvy','dash','actP','grdP','atkD','hvyD','grd','act'];
const finite = Number.isFinite;

export class LocalPrediction {
  constructor({ game, localIndex, now = () => performance.now() }) {
    Object.assign(this, { game, localIndex, now, lastAck: -1, lastInput: -1, lastState: -1 });
    this.shown = new THREE.Vector3(); this.wanted = new THREE.Vector3(); this.result = new THREE.Vector3();
    this.probe = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), state: 'normal', radius: .45, height: 1.9 };
    this.reset();
  }
  reset() {
    this.pending = []; this.authority = null; this.received = -Infinity;
    this.shown.set(0,0,0); this.wanted.set(0,0,0); this.result.set(0,0,0);
  }
  stop() { this.pending.length=0; this.shown.set(0,0,0); this.result.set(0,0,0); }
  record(input, dt = 1/30) {
    if(!input||!Number.isSafeInteger(input.seq)||input.seq<=this.lastInput||!finite(input.mx)||!finite(input.mz)
      ||Math.hypot(input.mx,input.mz)>1.001||!finite(dt)||dt<=0)return false;
    this.lastInput=input.seq;
    if(buttons.some(key=>input[key])||Math.hypot(input.mx,input.mz)<.15){this.stop();return true;}
    this.pending.push({ seq:input.seq, x:input.mx, z:input.mz, dt:Math.min(dt,1/15), at:this.now()/1000 });
    if(this.pending.length>MAX_INPUTS)this.pending.shift();
    return true;
  }
  acknowledge(ack, state) {
    if(!Number.isSafeInteger(ack)||ack< -1){this.reset();return false;}
    if(!state||!Number.isSafeInteger(state.seq)||state.seq<=this.lastState||ack<this.lastAck)return false;
    const human=state.humans?.[this.localIndex];
    const body=human?.riding==null?human:state.robots?.find(r=>r.id===human.riding&&r.pilot===human.id);
    if(!human||!body){this.reset();return false;}
    const id=(human.riding==null?'human:':'robot:')+body.id;
    if(this.authority&&(this.authority.id!==id||human.stock!==this.authority.stock
      ||human.hp<this.authority.hp||body.armor<this.authority.armor))this.stop();
    this.lastState=state.seq;this.lastAck=ack;this.lastInput=Math.max(this.lastInput,ack);
    this.pending=this.pending.filter(input=>input.seq>ack);
    this.authority={id,body,human,stock:human.stock,hp:human.hp,armor:body.armor,phase:state.phase};
    this.received=this.now()/1000;
    return true;
  }
  eligible(actor) {
    const a=this.authority,h=this.game.humans[this.localIndex];
    if(!a||this.game.phase!=='fight'||a.phase!=='fight'||h.dead||h.out||a.human.dead||a.human.out
      ||actor!== (h.riding||h)||a.id!==actor.kind+':'+actor.id||!actor.onGround||!a.body.onGround
      ||actor.act||a.body.action!==null||actor.dashT>0||actor.hs>0||actor.stagger>0||h.supplyHeld
      ||h.ejectHold>0||h.boardTarget||a.human.boardTarget!==null)return false;
    return actor.kind==='human'?actor.state==='normal'&&a.body.state==='normal'
      :actor.state==='active'&&a.body.state==='active';
  }
  safeOffset(actor, vector) {
    const arena=this.game.arena,out=this.result;out.set(0,0,0);
    if(typeof arena?.groundAt!=='function'||typeof arena.pushOut!=='function'
      ||!finite(actor.radius)||actor.radius<=0||!finite(actor.height)||actor.height<=0)return out;
    const base=actor.pos,y=base.y, radius=actor.radius*.65;
    const distance=vector.length();if(!finite(distance)||distance===0)return out;
    const steps=Math.max(1,Math.ceil(distance/.12)),probe=this.probe;
    probe.radius=actor.radius;probe.height=actor.height;
    for(let step=1;step<=steps;step++){
      const x=base.x+vector.x*step/steps,z=base.z+vector.z*step/steps;
      // Conservative flat-ground check includes the footprint and rejects holes,
      // steps, ramps with a substantial height difference, pads, and movers.
      for(const [dx,dz] of [[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius]]){
        const ground=arena.groundAt(x+dx,z+dz,y);
        if(!finite(ground)||Math.abs(ground-y)>.12)return out;
      }
      const surface=arena.surfaceAt?.(x,z,y);
      if(surface&&(surface.pad||surface.s?.moving))return out;
      probe.pos.set(x,y,z);probe.vel.set(0,0,0);arena.pushOut(probe);
      if(Math.hypot(probe.pos.x-x,probe.pos.z-z)>1e-6)return out;
      out.set(x-base.x,0,z-base.z);
    }
    return out;
  }
  offset(dt, actor) {
    const time=this.now()/1000;
    if(!finite(dt)||dt<0||!this.eligible(actor)||time-this.received>.25){this.stop();return this.result;}
    this.pending=this.pending.filter(input=>input.seq>this.lastAck&&time-input.at<=HORIZON);
    const human=this.game.humans[this.localIndex],robot=actor.kind==='robot';
    const speed=robot?(actor.stats?.speed||0)*(human.P?.robot?.speed||1)*robotMods(actor.broken||0,actor.juice).speed:(human.P?.speed||0);
    this.wanted.set(0,0,0);let budget=HORIZON;
    for(let i=this.pending.length-1;i>=0&&budget>0;i--){
      const input=this.pending[i],span=Math.min(input.dt,budget);budget-=span;
      if(robot){
        // Raw cockpit mx turns; only straight forward walking is predictable.
        if(Math.abs(input.x)>.05||input.z>=-.15){this.stop();return this.result;}
        this.wanted.x+=Math.sin(this.authority.body.facing)*-input.z*speed*span;
        this.wanted.z+=Math.cos(this.authority.body.facing)*-input.z*speed*span;
      }else{this.wanted.x+=input.x*speed*span;this.wanted.z+=input.z*speed*span;}
    }
    this.wanted.clampLength(0,MAX_OFFSET);
    this.shown.lerp(this.wanted,1-Math.exp(-Math.min(dt,.1)*28));
    this.safeOffset(actor,this.shown);this.shown.copy(this.result);
    return this.result;
  }
}
