// Original authored cross-section meshes. CC0 external assets are not required:
// topology, silhouette profiles and garment patterns belong to this project.
import * as THREE from 'three';

const cache = new Map();
const profiles = {
  jacket: [[0,.16,.1],[.035,.18,.12],[.09,.20,.14],[.22,.21,.15],[.35,.25,.13],[.42,.25,.12],[.47,.19,.10],[.50,.085,.075]],
  vest: [[.10,.203,.158],[.16,.222,.165],[.27,.243,.160],[.40,.251,.15],[.46,.175,.12]],
  sleeve: [[-.30,.062,.067],[-.26,.074,.076],[-.17,.095,.085],[-.05,.105,.089],[.025,.077,.065],[.065,.026,.03]],
  forearm: [[-.25,.07,.066],[-.20,.078,.073],[-.08,.081,.079],[.015,.067,.066],[.04,.027,.03]],
  thigh: [[-.38,.072,.074],[-.31,.094,.087],[-.18,.11,.101],[-.03,.103,.098],[.03,.067,.072]],
  shin: [[-.36,.073,.075],[-.31,.075,.077],[-.20,.084,.080],[-.08,.092,.087],[.02,.065,.066]],
  boot: [[-.105,.102,.18],[-.075,.114,.19],[-.02,.116,.18],[.04,.106,.152],[.115,.077,.08],[.155,.071,.073]],
  mitten: [[-.105,.012,.02],[-.087,.07,.058],[-.025,.085,.064],[.036,.073,.068],[.09,.045,.044]],
  coat: [[-.39,.25,.13],[-.26,.24,.14],[-.1,.20,.13],[.06,.175,.12]],
};

export function pilotSurface(part, low=false) {
  const key=part+low; if(cache.has(key)) return cache.get(key);
  const rows=profiles[part]; if(!rows) throw new Error('Unknown pilot surface');
  const sides=low?10:24, pos=[], uv=[], indices=[];
  for(let j=0;j<rows.length;j++) {
    const [y,rx,rz]=rows[j];
    for(let i=0;i<=sides;i++) {
      const a=i/sides*Math.PI*2, sin=Math.sin(a), cos=Math.cos(a);
      // Superellipse produces tailored panels and flattened soles, without boxes.
      const power=part==='boot'?.62:part==='jacket'?.8:.9;
      let x=Math.sign(sin)*Math.abs(sin)**power*rx, z=Math.sign(cos)*Math.abs(cos)**power*rz;
      if(part==='boot') z+=.055*(1-j/(rows.length-1));
      if(part==='jacket') z+=Math.max(0,cos)*.016*Math.sin(j/(rows.length-1)*Math.PI);
      pos.push(x,y,z);uv.push(i/sides,j/(rows.length-1));
      if(j<rows.length-1&&i<sides){const a=j*(sides+1)+i,b=a+1,c=a+sides+1;indices.push(a,b,c,b,c+1,c);}
    }
  }
  // End caps keep cuffs/boots closed from all combat viewpoints.
  for(const row of [0,rows.length-1]) {
    const center=pos.length/3;pos.push(0,rows[row][0],part==='boot'&&row===0?.055:0);uv.push(.5,.5);
    for(let i=0;i<sides;i++){const a=row*(sides+1)+i;indices.push(...(row===0?[center,a+1,a]:[center,a,a+1]));}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
  g.userData.authoredSurface=part;cache.set(key,g);return g;
}

export function pilotCape(low=false) {
  const key='cape'+low;if(cache.has(key))return cache.get(key);
  const rows=low?7:16,cols=low?6:14,p=[],uv=[],idx=[];
  for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){
    const t=j/rows,u=i/cols*2-1;
    p.push(u*(.18+t*.10),.44-t*.87,-.15-t*.20+Math.cos(u*3*Math.PI)*t*.022);
    uv.push(i/cols,t);
    if(j<rows&&i<cols){const a=j*(cols+1)+i,b=a+1,c=a+cols+1;idx.push(a,c,b,b,c,c+1);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();g.userData.authoredSurface='cape';cache.set(key,g);return g;
}
