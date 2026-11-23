import assert from 'node:assert/strict';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import './env';
(globalThis as any).window={innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};
(globalThis as any).localStorage={getItem:()=>null,setItem(){},removeItem(){}};(globalThis as any).sessionStorage=(globalThis as any).localStorage;
const {ARTS}=await import('../src/data/arts');const {ZHEN}=await import('../src/data/zhenfa');const {skillIconURL,skillIconShape,SKILL_ICON}=await import('../src/gfx/skillIconData');
const shapes=new Map<string,string>(),icons=new Set<string>();
for(const a of Object.values(ARTS)){
 const url=skillIconURL(a.id)!;assert.ok(url.startsWith('data:image/svg+xml;charset=utf-8,'),a.id);assert.equal(skillIconURL(a.id),url);
 const svg=decodeURIComponent(url.slice(url.indexOf(',')+1));assert.ok(svg.includes('<svg')&&!svg.includes('<script')&&!svg.includes('href='));shapes.set(skillIconShape(a),svg);icons.add(url);
}
for(const z of ZHEN){const url=skillIconURL('zf:'+z.id)!;assert.ok(url.startsWith('data:image/svg+xml;charset=utf-8,'),z.id);assert.equal(skillIconURL('zf:'+z.id),url)}
assert.ok(shapes.size>=12,`shapes ${shapes.size}`);assert.ok(icons.size>=75,`visual variants ${icons.size}`);
for(const [shape,svg] of shapes){const im=await loadImage(Buffer.from(svg));const c=createCanvas(64,64),g=c.getContext('2d');g.drawImage(im,0,0,64,64);const p=g.getImageData(0,0,64,64).data;let ink=0;for(let i=3;i<p.length;i+=4)if(p[i]>20)ink++;assert.ok(ink>500,shape)}
assert.equal(skillIconURL('unknown'),undefined);assert.equal(skillIconURL('toString'),undefined);assert.equal(skillIconURL('zf:constructor'),undefined);
const orig=ARTS.huodan, oldColor=orig.color, oldFx=orig.fx;const before=skillIconURL('huodan');
try{orig.color='1,2,3';assert.notEqual(skillIconURL('huodan'),before);assert.ok(decodeURIComponent(skillIconURL('huodan')!).includes('#010203'));orig.color='1,2,3" onload="alert(1)';assert.ok(!decodeURIComponent(skillIconURL('huodan')!).includes('onload'));orig.fx='sword';assert.equal(skillIconShape(orig),'sword')}finally{orig.color=oldColor;orig.fx=oldFx}
// 添加的法术不需要重新生成索引；模组显式图标覆盖后，数据变更也不能抢回优先级。
ARTS.test_dynamic={...orig,id:'test_dynamic',color:'42,70,90'};assert.ok(skillIconURL('test_dynamic')?.startsWith('data:image/svg+xml'));SKILL_ICON.test_dynamic='data:image/png;base64,AA==';assert.equal(skillIconURL('test_dynamic'),'data:image/png;base64,AA==');ARTS.test_dynamic.color='7,8,9';assert.equal(skillIconURL('test_dynamic'),'data:image/png;base64,AA==');delete SKILL_ICON.test_dynamic;assert.ok(skillIconURL('test_dynamic')?.startsWith('data:image/svg+xml'));delete ARTS.test_dynamic;
// UI 真实组件服务端渲染：快捷栏和法术书均引用程序图标。
const {createElement}=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');const {Hotbar,SkillPanel}=await import('../src/ui/CombatUI');
const game:any={hero:{hotbar:['huodan','zf:kun'],arts:[{id:'huodan',xp:0}],bag:[],equip:{},kills:0,realm:1},senseBurstT:0,concealed:false};
const hot=renderToStaticMarkup(createElement(Hotbar,{game,touch:false}));assert.ok(hot.includes(skillIconURL('huodan')!));assert.ok(hot.includes(skillIconURL('zf:kun')!));
const panel=renderToStaticMarkup(createElement(SkillPanel,{game,onClose:()=>{}}));assert.ok(panel.includes(skillIconURL('huodan')!));
// 通过真实模组入口注册技能图片，验证 v053 懒加载不会覆写它。
const {ModHost}=await import('../src/mod/host');const {warm53}=await import('../src/gfx/v053Tex');
const b:any={format:'fanren-mod@1',manifest:{id:'testicon',name:'testicon',version:'1.0.0',author:'test',desc:''},main:'index.js',files:{'index.js':'export default function(api){ api.icon("huodan","icon.png"); }','icon.png':'data:image/png;base64,AA=='}};
const result=await new ModHost().load(b);assert.equal(result.state,'loaded',result.error);assert.equal(skillIconURL('huodan'),'data:image/png;base64,AA==');warm53([]);await new Promise(resolve=>setTimeout(resolve,100));assert.equal(skillIconURL('huodan'),'data:image/png;base64,AA==');delete SKILL_ICON.huodan;
console.log(`skill icons: ${Object.keys(ARTS).length} arts, ${ZHEN.length} formations, ${shapes.size} rasterized shapes, dynamic data and mod priority passed`);
