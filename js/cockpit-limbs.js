import * as THREE from 'three';

const geometryCache = new WeakMap();
// Close the cut at the shoulder. A welded skin's open cross-section must not
// appear as a torn crescent when viewed from its cockpit side.
function closeCuts(geometry) {
  const pos=geometry.attributes.position,si=geometry.attributes.skinIndex,sw=geometry.attributes.skinWeight;
  const ids=new Map(),canonical=[],representative=[];
  for(let i=0;i<pos.count;i++){
    const key=[pos.getX(i),pos.getY(i),pos.getZ(i)].map(v=>Math.round(v*1e5)).join(',');
    if(!ids.has(key)){ids.set(key,ids.size);representative.push(i)}canonical[i]=ids.get(key);
  }
  const indices=[],groups=[],caps=[];
  for(const group of geometry.groups){
    const edges=new Map(),start=indices.length;
    for(let i=group.start;i<group.start+group.count;i+=3){
      const t=[geometry.index.getX(i),geometry.index.getX(i+1),geometry.index.getX(i+2)];indices.push(...t);
      for(let k=0;k<3;k++){const a=t[k],b=t[(k+1)%3],u=canonical[a],v=canonical[b],key=u<v?u+','+v:v+','+u;const e=edges.get(key);if(e)e.count++;else edges.set(key,{a,b,u,v,count:1})}
    }
    const boundary=[...edges.values()].filter(e=>e.count===1),adj=new Map();
    for(const e of boundary)for(const id of [e.u,e.v]){if(!adj.has(id))adj.set(id,[]);adj.get(id).push(e)}
    const seen=new Set();
    for(const first of boundary){
      if(seen.has(first))continue;
      const component=[],queue=[first],vertices=new Set();
      while(queue.length){const e=queue.pop();if(seen.has(e))continue;seen.add(e);component.push(e);vertices.add(e.u);vertices.add(e.v);for(const id of [e.u,e.v])for(const n of adj.get(id))if(!seen.has(n))queue.push(n)}
      // Small open triangles are surface details, not a limb cross-section.
      if(vertices.size<5)continue;
      const verts=[...vertices].map(i=>representative[i]),weights=new Map();
      for(const v of verts)for(let k=0;k<4;k++){const joint=si.getComponent(v,k);weights.set(joint,(weights.get(joint)||0)+sw.getComponent(v,k))}
      const influences=[...weights].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=influences.reduce((n,v)=>n+v[1],0);
      const centre=pos.count+caps.length;caps.push({verts,influences,sum});
      for(const e of component)indices.push(e.b,e.a,centre);
    }
    groups.push({...group,start,count:indices.length-start});
  }
  if(!caps.length)return;
  for(const [name,attribute]of Object.entries(geometry.attributes)){
    const size=attribute.itemSize,array=new attribute.array.constructor((pos.count+caps.length)*size);array.set(attribute.array);
    const expanded=new THREE.BufferAttribute(array,size,attribute.normalized);
    caps.forEach((cap,i)=>{for(let k=0;k<size;k++){
      let value;
      if(name==='skinIndex')value=cap.influences[k]?.[0]||0;
      else if(name==='skinWeight')value=(cap.influences[k]?.[1]||0)/cap.sum;
      else value=cap.verts.reduce((n,v)=>n+attribute.getComponent(v,k),0)/cap.verts.length;
      expanded.setComponent(pos.count+i,k,value);
    }});
    geometry.setAttribute(name,expanded);
  }
  geometry.setIndex(indices);geometry.groups=groups;
}
// Authored robots use a welded skinned body. Showing arm *bones* cannot reveal
// that body's triangles. Retain an arm-only index buffer with the same actual
// skeleton, materials and animation; no second robot or fake weapon animation.
export function prepareCockpitLimbs(rig) {
  if (rig.cockpitLimbs) return rig.cockpitLimbs;
  const sources=[]; rig.root.traverse(o=>{if(o.isSkinnedMesh && !o.userData.rrCockpitOnly)sources.push(o)});
  const limbs=[];
  for(const source of sources){
    const armBones=new Set();
    source.skeleton.bones.forEach((bone,i)=>{
      for(let b=bone;b;b=b.parent)if(/^(arm|fore|hand|wrist)[LR]$/.test(b.name)){armBones.add(i);break}
    });
    if(!armBones.size)continue;
    const original=source.geometry,si=original.attributes.skinIndex,sw=original.attributes.skinWeight;
    if(!si||!sw)continue;
    const key=[...armBones].join(',');let cache=geometryCache.get(original);
    if(!cache)geometryCache.set(original,cache=new Map());
    let geometry=cache.get(key);
    if(geometry===undefined){
      const index=[],groups=[],total=original.index?.count??original.attributes.position.count;
      const belongs=v=>{let weight=0;for(let k=0;k<4;k++)if(armBones.has(si.getComponent(v,k)))weight+=sw.getComponent(v,k);return weight>.6};
      for(const group of original.groups.length?original.groups:[{start:0,count:total,materialIndex:0}]){
        const start=index.length;
        for(let i=group.start;i<Math.min(total,group.start+group.count);i+=3){
          const a=original.index?.getX(i)??i,b=original.index?.getX(i+1)??i+1,c=original.index?.getX(i+2)??i+2;
          if(belongs(a)&&belongs(b)&&belongs(c))index.push(a,b,c);
        }
        if(index.length>start)groups.push({start,count:index.length-start,materialIndex:group.materialIndex});
      }
      geometry=null;
      if(index.length){geometry=new THREE.BufferGeometry();for(const [name,a]of Object.entries(original.attributes))geometry.setAttribute(name,a);geometry.setIndex(index);geometry.groups=groups;closeCuts(geometry);}
      cache.set(key,geometry);
    }
    if(!geometry)continue;
    const mesh=new THREE.SkinnedMesh(geometry,source.material);
    mesh.name='cockpit-arms';mesh.skeleton=source.skeleton;mesh.bindMode=source.bindMode;
    mesh.bindMatrix.copy(source.bindMatrix);mesh.bindMatrixInverse.copy(source.bindMatrixInverse);
    mesh.position.copy(source.position);mesh.quaternion.copy(source.quaternion);mesh.scale.copy(source.scale);
    mesh.frustumCulled=false;mesh.receiveShadow=source.receiveShadow;mesh.layers.set(2);
    mesh.userData.rrCockpitOnly=true;source.parent.add(mesh);limbs.push(mesh);
  }
  rig.cockpitLimbs=limbs;return limbs;
}
