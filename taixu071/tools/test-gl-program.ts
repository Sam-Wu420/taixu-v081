import assert from 'node:assert/strict';
import {compileProgram} from '../src/gl/program';
function mock(fail='') {
 let seq=0, uniform=0;const deletedShaders:any[]=[],deletedPrograms:any[]=[],detached:any[]=[];
 const gl:any={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,
 createProgram:()=>fail==='program-null'?null:{p:1}, createShader:(type:number)=>fail==='fragment-null'&&type===2?null:{id:++seq,type},shaderSource(){},compileShader(){},getShaderParameter:(s:any)=>fail!==(s.type===1?'vertex':'fragment'),getShaderInfoLog:()=> 'bad shader',attachShader(){},linkProgram(){},getProgramParameter:()=>fail!=='link',getProgramInfoLog:()=> 'bad link',detachShader:(_p:any,s:any)=>detached.push(s),deleteShader:(s:any)=>deletedShaders.push(s),deleteProgram:(p:any)=>deletedPrograms.push(p),getUniformLocation:(_p:any,n:string)=>{uniform++;return n==='none'?null:{n}}};
 return {gl,deletedShaders,deletedPrograms,detached,get uniform(){return uniform}};
}
{
 const t=mock(),p=compileProgram(t.gl,'v','f');assert.equal(t.deletedShaders.length,2);assert.equal(t.detached.length,2);assert.equal(t.deletedPrograms.length,0);assert.strictEqual(p.u('x'),p.u('x'));assert.equal(p.u('none'),null);assert.equal(p.u('none'),null);assert.equal(t.uniform,2);
}
for(const [failure,shaders,programs] of [['program-null',0,0],['vertex',1,1],['fragment-null',1,1],['fragment',2,1],['link',2,1]] as const){const t=mock(failure);assert.throws(()=>compileProgram(t.gl,'v','f'));assert.equal(t.deletedShaders.length,shaders,failure);assert.equal(t.deletedPrograms.length,programs,failure)}
console.log('GL program: linked shader cleanup, uniform memo and allocation/compile/link failure cleanup passed (mock GL)');
