import './env';
import assert from 'node:assert/strict';
(globalThis as any).window={innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};
(globalThis as any).localStorage={getItem:()=>null,setItem(){},removeItem(){}};
const {parseFog,encodeFog,decodeFog,MAX_FOG_CELLS}=await import('../src/world/fog');
const {validateSaveForLoad}=await import('../src/world/saveGuard');
const {Game}=await import('../src/world/game');
let seed=123;const rnd=()=>{seed=Math.imul(seed,1664525)+1013904223|0;return (seed>>>0)/2**32};
for(const length of [0,1,2,100,10000,22680]) for(let mode=0;mode<4;mode++) {
 const a=Uint8Array.from({length},(_,i)=>mode===0?0:mode===1?1:mode===2?i%2:(rnd()<0.35?1:0));
 const enc=encodeFog(a),out=new Uint8Array(length);assert.equal(parseFog(enc).length,length);decodeFog(enc,out);assert.deepEqual(out,a);
 const old=Array.from(a).join('');out.fill(7);decodeFog(old,out);assert.deepEqual(out,a);
}
const invalid=['r','r1,','r-1','r1,,2','r1,!', 'rx!','r1.2','rzzzzzz','012','r1, 2'];
for(const text of invalid) {
 assert.throws(()=>parseFog(text));const dest=new Uint8Array([1,1,1]);assert.throws(()=>decodeFog(text,dest));assert.deepEqual([...dest],[1,1,1]);
 assert.throws(()=>validateSaveForLoad({p:{x:1,y:2},fogs:{tiannan:text}},['tiannan','luanxing','dajin'],300));
}
assert.throws(()=>parseFog('r'+(MAX_FOG_CELLS+1).toString(36)));
// 旧版统一地图迷雾既可能是明文也可能是压缩；迁移必须先按解码长度而非压缩串长度分配。
const old=new Uint8Array(180*126);for(let i=2000;i<17000;i++)old[i]=1;
const text=Array.from(old).join(''),packed=encodeFog(old);assert.ok(packed.length<text.length/10);
const a=(Game.prototype as any).migrateFog(text,180),b=(Game.prototype as any).migrateFog(packed,180);
assert.deepEqual(b,a);assert.ok(Object.values(a).some((f:any)=>parseFog(f).length>0));
console.log('fog safety: old/RLE round trips, malformed and oversized rejection, atomic decode and compressed legacy migration passed');
