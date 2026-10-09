// Local first-person comfort cutaway. Only the fragments of another robot
// touching the seated camera are removed; distant surfaces keep normal depth.
// Arena materials, gameplay hitboxes and snapshots are never changed.
export class CloseContactView {
  constructor(){this.entries=new Map();this.camera=null;this.enabled=false;}
  update(game,local,enabled){
    this.camera=game.camera;this.enabled=enabled;
    if (!enabled) return;
    if(this.quality!==game.arena?.quality){this.reset();this.camera=game.camera;this.enabled=enabled;this.quality=game.arena?.quality}
    for(const robot of game.robots||[]){
      if(robot===local||robot.state==='dead')continue;
      // Install once when a mounted view starts, while the whole roster first
      // renders. Crossing melee range must not swap shader programs mid-punch.
      if(!this.entries.has(robot.rig.root))this.prepare(robot.rig.root);
    }
    for(const[root,entry]of this.entries)if(!root.parent){this.release(entry);this.entries.delete(root)}
  }
  prepare(root){
    const materials=new Map(),meshes=[],owner=this;
    const clone=source=>{
      if(materials.has(source))return materials.get(source);
      const material=source.clone(),uniform={value:0};
      // Flash/damage code retains original material references, whereas eyes
      // animate through mesh.material. Keep both routes connected while the
      // shader variant is installed, including a flash already in progress.
      if(source.color)material.color=source.color;
      if(source.emissive)material.emissive=source.emissive;
      if('emissiveIntensity' in source)Object.defineProperty(material,'emissiveIntensity',{enumerable:true,configurable:true,get:()=>source.emissiveIntensity,set:v=>{source.emissiveIntensity=v}});
      const originalCompile=source.onBeforeCompile,originalKey=source.customProgramCacheKey();
      material.onBeforeCompile=function(shader,renderer){
        originalCompile.call(source,shader,renderer);
        shader.uniforms.rrContact=uniform;
        shader.vertexShader='varying vec3 rrViewPosition;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nrrViewPosition=mvPosition.xyz;');
        shader.fragmentShader='uniform float rrContact;\nvarying vec3 rrViewPosition;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
          if(rrContact>0.5){
            // Only protect the near plane. The former 1.6m sphere removed
            // readable enemy faces and torsos at ordinary melee distance.
            float coverage=smoothstep(0.18,0.42,length(rrViewPosition));
            // Fixed screen-space ordered coverage, no time-varying sparkle.
            vec2 cell=mod(floor(gl_FragCoord.xy),4.0);
            float threshold=(mod(cell.x*2.0+cell.y*3.0,4.0)*4.0+mod(cell.y+cell.x*3.0,4.0)+0.5)/16.0;
            if(coverage<threshold)discard;
          }`);
      };
      material.customProgramCacheKey=()=>originalKey+'|rr-contact-v2';
      material.userData={...material.userData,rrContactUniform:uniform};materials.set(source,material);return material;
    };
    root.traverse(mesh=>{
      if(!mesh.isMesh||mesh.userData.rrGroundMark)return;
      const original=mesh.material,before=mesh.onBeforeRender;
      mesh.material=Array.isArray(original)?original.map(clone):clone(original);
      mesh.onBeforeRender=function(renderer,scene,camera,...args){
        before.call(this,renderer,scene,camera,...args);
        for(const material of(Array.isArray(this.material)?this.material:[this.material])){
          const u=material.userData.rrContactUniform;if(u)u.value=owner.enabled&&camera===owner.camera?1:0;
        }
      };
      meshes.push({mesh,original,before});
    });
    this.entries.set(root,{materials,meshes});
  }
  release(entry){for(const{mesh,original,before}of entry.meshes){mesh.material=original;mesh.onBeforeRender=before}for(const material of entry.materials.values())material.dispose()}
  reset(){for(const entry of this.entries.values())this.release(entry);this.entries.clear();this.enabled=false;this.camera=null}
}
