import * as THREE from 'three';

// One wide mirrored texture is divided between two windows; no second world pass.
export function rearViewLayout(width,height,safe={},controls={}) {
  const inset=k=>Math.max(0,Number(safe[k])||0),portrait=height>width;
  const available=width-inset('left')-inset('right')-24;
  const w=Math.min(portrait?112:width<900?132:168,Math.max(72,(available-48)/2));
  const leftTop=controls.left??height-inset('bottom')-(portrait?132:width<900?132:48);
  const rightTop=controls.right??height-inset('bottom')-(portrait?168:width<900?168:188);
  const space=Math.min(leftTop,rightTop)-12-inset('top')-66;
  const h=space<32?0:Math.min(portrait?64:width<900?60:84,space);
  const box=(side,top)=>({left:side==='left'?inset('left')+12:width-inset('right')-w-12,top:Math.max(inset('top')+66,top-h-12),width:w,height:h});
  return {left:box('left',leftTop),right:box('right',rightTop)};
}
export class RearView {
  constructor(renderer,scene,controller) {
    this.renderer=renderer;this.scene=scene;this.controller=controller;this.nextWorld=0;this.robot=null;
    this.camera=new THREE.PerspectiveCamera(58,4,.12,85);
    this.quadScene=new THREE.Scene();this.quadCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,2);this.quadCamera.position.z=1;
    this.material=new THREE.MeshBasicMaterial({depthTest:false,depthWrite:false,toneMapped:true});
    this.quads=['left','right'].map((side,i)=>{
      const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material),uv=quad.geometry.attributes.uv;
      for(let n=0;n<uv.count;n++)uv.setX(n,1-i*.5-uv.getX(n)*.5);
      uv.needsUpdate=true;quad.visible=false;this.quadScene.add(quad);return quad;
    });
    this.viewport=new THREE.Vector4();this.scissor=new THREE.Vector4();this.hidden=[];
    this.stats={worldRenders:0,composites:0,worldCpuMs:[],worldDraws:0,worldTriangles:0,width:0,height:0,rate:8};
    if(typeof document!=='undefined'&&document.body?.append)this.install();
  }
  install() {
    const panel=document.createElement('div');panel.id='rear-view';panel.hidden=true;panel.style.pointerEvents='none';
    this.panes=['left','right'].map((side,i)=>{
      const el=document.createElement('div');el.id='rear-view-'+side;el.setAttribute('role','img');el.setAttribute('aria-label',(i?'오른쪽':'왼쪽')+' 후방 아래 시야');
      el.style.cssText='position:fixed;z-index:13;box-sizing:border-box;border:1px solid #e4f0ed88;border-radius:5px;pointer-events:none;overflow:hidden';
      panel.append(el);return el;
    });document.body.append(panel);this.panel=panel;
    const button=document.createElement('button');button.id='rear-view-toggle';button.type='button';button.className='btn';
    button.addEventListener('click',()=>{this.controller.toggleRearView();this.nextWorld=0;this.layoutKey='';this.label();button.blur()});
    (document.querySelector('#pause .col')||document.body).append(button);this.button=button;this.label();
  }
  label(){if(this.button){this.button.textContent='후방 화면: '+(this.controller.rearEnabled?'켜짐':'꺼짐');this.button.setAttribute('aria-pressed',String(this.controller.rearEnabled))}}
  layout(width,height) {
    const control=document.getElementById('touch-controls'),s=control?getComputedStyle(control):{};
    const safe=Object.fromEntries(['top','right','bottom','left'].map(k=>[k,parseFloat(s['padding'+k[0].toUpperCase()+k.slice(1)])||0]));
    const controls={};
    const reserve=(side,top)=>{if(top>0)controls[side]=Math.min(controls[side]??Infinity,top)};
    if(control&&!control.hidden){
      const stick=control.querySelector('.touch-stick')?.getBoundingClientRect();
      if(stick?.width){const side=stick.x+stick.width/2<width/2?'left':'right';reserve(side,stick.top);
        // Reserve the context action's slot even while it is hidden. Read the
        // stable layout position, not a temporary ready/pressed animation.
        const opposite=side==='left'?'right':'left';for(const el of control.querySelectorAll('.touch-btn')){
          const top=parseFloat(el.style.getPropertyValue('--touch-y')),b=el.getBoundingClientRect();
          if(Number.isFinite(top))reserve(opposite,top);else if(b.width)reserve(opposite,b.top);
        }
      }
    }else{
      for(const[id,side]of[['keyhint','left'],['skills','right']]){const el=document.getElementById(id),b=el?.getBoundingClientRect();if(b?.height&&getComputedStyle(el).display!=='none')reserve(side,b.top)}
    }
    this.rects=rearViewLayout(width,height,safe,controls);
    for(const[i,side]of['left','right'].entries()){const b=this.rects[side];Object.assign(this.panes[i].style,{left:b.left+'px',top:b.top+'px',width:b.width+'px',height:b.height+'px'})}
    const b=this.rects.left;this.camera.aspect=b.width*2/(b.height||64);this.camera.updateProjectionMatrix();
    const tw=width<900?256:320,th=Math.round(tw/this.camera.aspect);
    if(!this.target){this.target=new THREE.WebGLRenderTarget(tw,th,{depthBuffer:true});this.material.map=this.target.texture;this.material.needsUpdate=true;}
    else if(this.target.width!==tw||this.target.height!==th)this.target.setSize(tw,th);
    this.stats.width=tw;this.stats.height=th;this.nextWorld=0;
  }
  render(now,game,active,width,height,thermal=0) {
    const robot=game.player?.riding;if(!this.panel)return;
    const mounted=robot&&!game.player.dead&&!game.player.out&&robot.state!=='dead'&&game.phase!=='end';
    this.panel.hidden=!(active&&mounted&&this.controller.rearEnabled);if(this.button)this.button.hidden=!mounted;
    if(!active||!mounted){this.robot=null;return}
    const touch=typeof document==='undefined'?null:document.getElementById('touch-controls');
    const key=[width,height,this.controller.rearEnabled,touch?.hidden,touch?.className,touch?.style.cssText,typeof document==='undefined'?'':document.getElementById('keyhint')?.className,robot.type].join('/');
    if(key!==this.layoutKey){this.layout(width,height);this.layoutKey=key;this.label()}
    if(!this.controller.rearEnabled)return;
    // Extremely short viewports cannot fit a readable window above both thumbs.
    // Restore automatically after rotation instead of covering an action button.
    if(!this.rects.left.height){this.panel.hidden=true;return}
    if(this.robot!==robot){this.robot=robot;this.nextWorld=0}
    const r=this.renderer,oldTarget=r.getRenderTarget(),auto=r.autoClear,shadow=r.shadowMap.autoUpdate,scissorTest=r.getScissorTest();
    r.getViewport(this.viewport);r.getScissor(this.scissor);
    try {
      if(now>=this.nextWorld){
        const sx=Math.sin(robot.facing),sz=Math.cos(robot.facing),y=(this.controller.eyeY??(robot.pos.y+4.1))-.85;
        this.camera.position.set(robot.pos.x-sx*.25,y,robot.pos.z-sz*.25);this.camera.up.set(0,1,0);
        this.camera.lookAt(this.camera.position.x-sx*4,this.camera.position.y-3.8,this.camera.position.z-sz*4);
        for(const root of[robot.rig.root,game.player.rig.root])root.traverse(o=>{if(o.isMesh){this.hidden.push([o,o.layers.mask]);o.layers.disable(0)}});
        r.shadowMap.autoUpdate=false;r.autoClear=true;r.setRenderTarget(this.target);r.setScissorTest(false);
        const start=performance.now(),draws=r.info.render.calls,triangles=r.info.render.triangles;r.render(this.scene,this.camera);
        const cpu=performance.now()-start;this.stats.worldRenders++;this.stats.worldDraws=r.info.render.calls-draws;this.stats.worldTriangles=r.info.render.triangles-triangles;
        if(this.stats.worldRenders>3){this.stats.worldCpuMs.push(cpu);if(this.stats.worldCpuMs.length>120)this.stats.worldCpuMs.shift()}
        const recent=this.stats.worldCpuMs.slice(-8);if(recent.length===8&&recent.reduce((a,b)=>a+b,0)/8>5)this.slow=true;
        this.stats.rate=thermal>=2||this.slow?4:8;this.nextWorld=now+1000/this.stats.rate;
        for(const[o,mask]of this.hidden)o.layers.mask=mask;this.hidden.length=0;
      }
      r.setRenderTarget(oldTarget);r.shadowMap.autoUpdate=shadow;r.autoClear=false;
      for(const[i,side]of['left','right'].entries()){
        const b=this.rects[side];r.setViewport(b.left,height-b.top-b.height,b.width,b.height);r.setScissor(b.left,height-b.top-b.height,b.width,b.height);r.setScissorTest(true);r.clearDepth();
        this.quads[i].visible=true;r.render(this.quadScene,this.quadCamera);this.quads[i].visible=false;this.stats.composites++;
      }
    } finally {
      for(const[o,mask]of this.hidden)o.layers.mask=mask;this.hidden.length=0;for(const q of this.quads)q.visible=false;
      r.setRenderTarget(oldTarget);r.setViewport(this.viewport);r.setScissor(this.scissor);r.setScissorTest(scissorTest);r.autoClear=auto;r.shadowMap.autoUpdate=shadow;
    }
  }
  dispose(){this.target?.dispose();for(const q of this.quads)q.geometry.dispose();this.material.dispose();this.panel?.remove();this.button?.remove()}
}
