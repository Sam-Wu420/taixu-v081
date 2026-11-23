// 水墨样式：宣纸、印章、墨晕。配色与字体沿用游戏的 CSS 变量。
// 动效：面板展开 260ms、目录树与分组用 grid-rows 收放、图标格逐格 10ms 错开、按下 0.97 下沉、印章盖下回弹、标签下的墨痕滑动；尊重「减少动态效果」。
// 布局：左「法宝匣」（标签 + 目录树 + 图标格 + 生成选项）、右「工具」（工具 / 模组 / 设置）、上「阵枢」；窄屏一次只开一块，不出横向滚动条。
export const css = (IMG) => `
.sh-root{--ink:#26231e;--paper:#efe6d2;--jade:#2f6b5e;--jade2:#5aa08e;--ver:#a8352a;--gold:#b89650;--soft:#5a5246;--line:rgba(110,90,60,.32);--ease:cubic-bezier(.2,.8,.2,1);--ic:64px;
  --pt:56px;--pb:132px;position:fixed;inset:0;z-index:70;pointer-events:none;font-family:var(--body-font,serif);color:var(--ink);overflow:hidden;overflow:clip}
.sh-root button{font:inherit;color:inherit;cursor:pointer}
.sh-root kbd{font:11px/1 ui-monospace,monospace;padding:2px 5px;border:1px solid rgba(80,66,44,.4);border-bottom-width:2px;border-radius:3px;background:rgba(255,250,238,.8);color:var(--soft)}
.sh-root button:active:not(:disabled){transform:translateY(1px) scale(.97)}
.sh-root [hidden]{display:none!important}
.sh-root ::-webkit-scrollbar{width:8px;height:8px}.sh-root ::-webkit-scrollbar-thumb{background:rgba(90,76,54,.28);border-radius:4px;border:2px solid transparent;background-clip:padding-box}.sh-root ::-webkit-scrollbar-track{background:transparent}
.sh-ic{display:inline-block;flex:none;width:20px;height:20px;background:currentColor;-webkit-mask:var(--m) center/contain no-repeat;mask:var(--m) center/contain no-repeat;font-style:normal}
.sh-ic.sm{width:14px;height:14px}.sh-ic.big{width:46px;height:46px}
/* ---------- 入阵卷轴 ---------- */
.sh-gate{position:absolute;inset:0;pointer-events:auto;display:flex;align-items:center;justify-content:flex-start;padding-left:6vw;background:rgba(20,16,10,.35);opacity:0;transition:opacity .26s}
.sh-gate.in{opacity:1}
.sh-gbg{position:absolute;inset:0;background:center/cover no-repeat;transform:scale(1.06);transition:transform 1.6s var(--ease)}
.sh-gate.in .sh-gbg{transform:scale(1)}
.sh-gcard{position:relative;width:min(470px,86vw);max-height:92vh;overflow:auto;padding:26px 30px 20px;background:url('${IMG.paper}') center/cover,#f1e8d4;border:1px solid rgba(110,90,60,.5);border-radius:4px;
  box-shadow:0 20px 60px rgba(20,14,6,.45),inset 0 0 50px rgba(160,130,90,.25);clip-path:inset(0 0 100% 0);transition:clip-path .55s var(--ease) .08s}
.sh-gate.in .sh-gcard{clip-path:inset(0 0 0 0)}
.sh-gcard::before,.sh-gcard::after{content:'';position:absolute;left:-6px;right:-6px;height:10px;border-radius:5px;background:linear-gradient(#6b4a2a,#3d2a18);box-shadow:0 2px 4px rgba(0,0,0,.3)}
.sh-gcard::before{top:-4px}.sh-gcard::after{bottom:-4px}
.sh-gcard h1{font-family:var(--title-font,serif);font-weight:400;font-size:52px;margin:4px 0 0;letter-spacing:.12em;color:#1d1914}
.sh-sub{margin:2px 0 14px;color:var(--soft);font-size:14px}
.sh-gsec{margin:12px 0}
.sh-qnote{display:block;margin-top:5px;font-size:12px;line-height:1.5;opacity:.72}
.sh-gsec>b{display:block;font-family:var(--title-font,serif);font-weight:400;font-size:20px;margin-bottom:6px}
.sh-optc{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.sh-opt{display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto;column-gap:10px;text-align:left;padding:10px 12px;border:1px solid rgba(110,90,60,.4);border-radius:4px;background:rgba(255,250,238,.6);transition:all .15s}
.sh-opt i{grid-row:span 2;width:40px;height:40px;display:grid;place-items:center;font:400 24px var(--title-font,serif);font-style:normal;border:2px solid var(--soft);border-radius:4px;color:var(--soft);transition:all .2s}
.sh-opt span{font-weight:700}.sh-opt small{color:var(--soft);font-size:12px}
.sh-opt:hover{border-color:var(--ver);transform:translateY(-1px)}
.sh-opt.on{background:rgba(226,239,228,.9);border-color:var(--jade2)}
.sh-opt.on i{background:var(--ver);border-color:var(--ver);color:#f6ead2;transform:rotate(-6deg)}
.sh-realms{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.sh-warn{font-size:12.5px;color:#7a5520;background:rgba(184,150,80,.14);border-left:3px solid var(--gold);padding:6px 10px;margin:14px 0 10px}
.sh-grow{display:flex;gap:10px;align-items:center}
.sh-go{position:relative;padding:10px 34px;border:none;border-radius:4px;background:radial-gradient(circle at 30% 30%,#c9533f,#8e2a20);color:#fbefd8;font:400 26px var(--title-font,serif)!important;letter-spacing:.3em;box-shadow:0 4px 0 #5e1a13,0 8px 18px rgba(120,30,20,.35);transition:transform .12s,box-shadow .12s}
.sh-go:hover{transform:translateY(-2px) rotate(-1deg);box-shadow:0 6px 0 #5e1a13,0 12px 24px rgba(120,30,20,.4)}
.sh-go:active{transform:translateY(3px)!important;box-shadow:0 1px 0 #5e1a13}
.sh-keys{margin:14px 0 0;font-size:11.5px;color:var(--soft);line-height:2}
/* ---------- 墨晕转场 ---------- */
.sh-ink{position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at var(--x) var(--y),#100c08 0,#1d1710 40%,#2a2117 100%);clip-path:circle(0 at var(--x,50%) var(--y,50%));opacity:1}
.sh-ink.grow{transition:clip-path .52s cubic-bezier(.7,0,.3,1);clip-path:circle(150% at var(--x) var(--y))}
.sh-ink.fade{clip-path:circle(150% at var(--x) var(--y));opacity:0;transition:opacity .7s ease}
/* ---------- 常驻 ---------- */
.sh-hud{position:absolute;inset:0;pointer-events:none}
.sh-hud>*{pointer-events:auto}
.sh-hud.in .sh-top{animation:sh-drop .45s var(--ease) both}
.sh-hud.in .sh-box{animation:sh-slidel .42s var(--ease) .05s both}
.sh-hud.in .sh-tools{animation:sh-slider .42s var(--ease) .1s both}
.sh-hud.in .sh-tab{animation:sh-pop .32s var(--ease) both;animation-delay:calc(.18s + var(--i) * 30ms)}
.sh-box,.sh-tools,.sh-top,.sh-feed{transition:opacity .2s,transform .26s var(--ease)}
.sh-hud.tucked .sh-box{opacity:0;transform:translateX(-30px);pointer-events:none}
.sh-hud.tucked .sh-tools{opacity:0;transform:translateX(30px);pointer-events:none}
.sh-hud.tucked .sh-top{opacity:.55;transform:translate(-50%,-6px)}
.sh-hud.tucked .sh-top>:not(.sh-seal):not(b):not(.sh-clock):not([data-a]){display:none}
/* ---------- 阵枢（顶栏） ---------- */
.sh-top{position:absolute;top:8px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:4px 6px 4px 5px;background:url('${IMG.paper}') center/cover,#efe5cf;border:1px solid rgba(110,90,60,.5);border-radius:22px;box-shadow:0 4px 14px rgba(30,20,10,.25);white-space:nowrap;max-width:calc(100vw - 16px)}
.sh-seal{width:28px;height:28px;flex:none;display:grid;place-items:center;background:var(--ver);color:#f8ead0;font:400 18px var(--title-font,serif);font-style:normal;border-radius:50%;box-shadow:inset 0 0 0 2px rgba(255,230,200,.35)}
.sh-top>b{font:400 19px var(--title-font,serif);letter-spacing:.08em}
.sh-clock{font:600 12.5px ui-monospace,monospace;color:var(--jade);min-width:40px}
.sh-tg{display:flex;align-items:center;gap:3px;padding:0 4px;border-left:1px solid var(--line)}
.sh-tb{border:1px solid rgba(80,66,44,.4);background:rgba(255,250,238,.7);border-radius:14px;padding:3px 11px;font-size:13px;transition:all .15s}
.sh-tb:hover{border-color:var(--ver);color:var(--ver)}
.sh-exit{background:var(--ver);color:#fbefd8;border-color:#7c2219}
.sh-exit:hover{background:#c0422f;color:#fff}
.sh-db{position:relative;width:28px;height:28px;display:grid;place-items:center;border:1px solid rgba(80,66,44,.35);border-radius:50%;background:rgba(255,250,238,.75);padding:0;transition:all .14s}
.sh-db.big{width:30px;height:30px;background:var(--jade);border-color:#245247}
.sh-db.big svg{fill:#f4ecd8}
.sh-db svg{width:14px;height:14px;fill:var(--ink)}
.sh-db:hover:not(:disabled){border-color:var(--ver);transform:scale(1.06)}
.sh-db:disabled{opacity:.35;cursor:default}
.sh-db em{position:absolute;right:-4px;top:-4px;min-width:14px;height:14px;border-radius:7px;background:var(--ver);color:#fff;font:700 9px/14px ui-monospace,monospace;font-style:normal}
.sh-db em:empty{display:none}
.sh-speed{position:relative;display:flex;padding:2px;border:1px solid rgba(80,66,44,.35);border-radius:16px;background:rgba(255,250,238,.6)}
.sh-speed button{position:relative;z-index:1;width:30px;border:none;background:none;padding:3px 0;font:600 11.5px ui-monospace,monospace;transition:color .2s}
.sh-speed button.on{color:#f4ecd8}
.sh-ind{position:absolute;left:2px;top:2px;bottom:2px;width:30px;border-radius:14px;background:var(--jade);transform:translateX(calc(var(--k) * 30px));transition:transform .26s var(--ease)}
/* ---------- 法宝匣 ---------- */
.sh-box{position:absolute;left:8px;top:var(--pt);bottom:var(--pb);width:var(--bw,clamp(440px,46vw,800px));max-width:calc(100vw - var(--tw,300px) - 44px);display:grid;grid-template-rows:auto minmax(0,1fr);
  background:url('${IMG.panel}') center/cover,#efe6d2;border:1px solid rgba(110,90,60,.5);border-radius:6px;box-shadow:0 12px 34px rgba(30,20,10,.32);container-type:inline-size;transition:width .26s var(--ease),opacity .2s,transform .26s var(--ease)}
.sh-hud:has(.sh-tools.shut) .sh-box{max-width:calc(100vw - 80px)}
.sh-box.sizing{transition:none}
.sh-tabs{position:relative;display:flex;align-items:flex-end;gap:1px;padding:6px 10px 0;border-bottom:1px solid var(--line);overflow:hidden;min-width:0}
.sh-tab{position:relative;display:flex;align-items:center;gap:5px;flex:0 1 auto;min-width:0;border:none;background:none;padding:6px 8px 9px;font:400 15px var(--title-font,serif);color:var(--soft);border-radius:6px 6px 0 0;transition:color .15s,background .15s}
.sh-tab span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sh-tab .sh-ic{width:19px;height:19px;transition:transform .25s var(--ease)}
.sh-tab:hover{color:var(--ink);background:rgba(255,250,238,.5)}
.sh-tab:hover .sh-ic{transform:rotate(-8deg) scale(1.1)}
.sh-tab.on{color:var(--ink)}
.sh-tab.on .sh-ic{color:var(--ver)}
.sh-tab.mod img,.sh-tab.mod b{width:19px;height:19px;border-radius:4px;object-fit:cover;display:grid;place-items:center;background:#7a3a5a;color:#f8eedb;font:400 13px var(--title-font,serif)}
.sh-tab.more{flex:none;font-size:13.5px;color:#7a3a5a}
.sh-tsep{width:1px;align-self:stretch;margin:6px 4px 8px;background:var(--line);flex:none}
.sh-tink{position:absolute;left:0;bottom:-1px;height:7px;width:40px;background:var(--ver);-webkit-mask:url('${IMG.stroke}') center/100% 100% no-repeat;mask:url('${IMG.stroke}') center/100% 100% no-repeat;transition:transform .32s var(--ease),width .32s var(--ease),opacity .2s;pointer-events:none}
@container (max-width:760px){.sh-tab span{display:none}.sh-tab{padding:6px 9px 9px}.sh-tab.on span,.sh-tab.more span{display:inline}}
@container (max-width:520px){.sh-tab.on span{display:none}}
.sh-bxb{display:grid;grid-template-columns:var(--tree,178px) minmax(0,1fr);min-height:0}
.sh-box.page .sh-bxb{grid-template-columns:0 minmax(0,1fr)}.sh-box.page .sh-side{visibility:hidden}
.sh-side{display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--line);background:rgba(240,232,212,.45)}
.sh-srch{display:flex;align-items:center;gap:6px;margin:8px 8px 4px;padding:0 8px;border:1px solid rgba(80,66,44,.4);border-radius:14px;background:rgba(255,251,242,.92);color:var(--soft);transition:border-color .15s,box-shadow .15s}
.sh-srch:focus-within{border-color:var(--jade2);box-shadow:0 0 0 3px rgba(90,160,142,.2)}
.sh-srch .sh-ic{width:14px;height:14px}
.sh-search,.sh-tq,.sh-pname{flex:1;min-width:0;width:100%;box-sizing:border-box;padding:5px 0;border:none;background:none;font:inherit;font-size:13px;outline:none;color:var(--ink)}
.sh-tree{flex:1;min-height:0;overflow:auto;padding:2px 0 8px;scrollbar-width:thin}
.sh-node{display:flex;align-items:center;gap:5px;height:27px;padding:0 8px 0 calc(4px + var(--d) * 14px);font-size:13.5px;cursor:pointer;position:relative;transition:background .12s;user-select:none}
.sh-node span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sh-node small{font:11px ui-monospace,monospace;color:var(--soft);opacity:.75}
.sh-node .sh-ic{width:16px;height:16px;color:var(--soft)}
.sh-node:hover{background:rgba(255,250,238,.75)}
.sh-node.on{background:rgba(47,107,94,.14);color:#1d3f37}
.sh-node.on::before{content:'';position:absolute;left:0;top:4px;bottom:4px;width:3px;border-radius:2px;background:var(--jade)}
.sh-node.on .sh-ic{color:var(--jade)}
.sh-node.empty{opacity:.55}
.sh-nimg{width:16px;height:16px;border-radius:3px;object-fit:cover;flex:none}
.sh-dot{width:5px;height:5px;margin:0 5px;border-radius:50%;background:rgba(90,82,70,.4);flex:none}
.sh-tw,.sh-tw0{width:16px;height:16px;flex:none;display:grid;place-items:center;border:none;background:none;padding:0}
.sh-tw svg,.sh-oh svg,.sh-tgh svg,.sh-gh svg{width:10px;height:10px;fill:none;stroke:currentColor;stroke-width:1.6;transition:transform .2s var(--ease)}
.sh-tw.open svg,.sh-oh.open svg{transform:rotate(90deg)}
.sh-kids,.sh-ob,.sh-tgb,.sh-gb{display:grid;grid-template-rows:0fr;transition:grid-template-rows .22s var(--ease)}
.sh-kids.open,.sh-ob.open{grid-template-rows:1fr}
.sh-kids>div,.sh-ob>div,.sh-tgb>div,.sh-gb>div{overflow:hidden;min-height:0}
.sh-opts{border-top:1px solid var(--line);background:rgba(232,222,198,.6);max-height:52%;overflow:auto}
.sh-oh{display:flex;align-items:center;gap:6px;width:100%;border:none;background:none;padding:6px 10px;font:400 15px var(--title-font,serif);text-align:left}
.sh-ob>div>*:first-child{margin-top:0}
.sh-ob>div{padding:0 10px}.sh-ob.open>div{padding-bottom:8px}
.sh-fr{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin:4px 0}
.sh-fr>label{min-width:34px;font-size:12px;color:var(--soft);flex:none;white-space:nowrap}
.sh-checks{display:grid;grid-template-columns:1fr 1fr;gap:2px 6px;margin-top:4px}
.sh-ck{display:flex;align-items:center;gap:5px;font-size:12.5px;cursor:pointer;white-space:nowrap}
.sh-ck input{position:absolute;opacity:0;pointer-events:none}
.sh-ck i{width:14px;height:14px;flex:none;border:1.5px solid rgba(80,66,44,.55);border-radius:3px;background:rgba(255,251,242,.9);position:relative;transition:all .15s}
.sh-ck input:checked+i{background:var(--jade);border-color:var(--jade)}
.sh-ck input:checked+i::after{content:'';position:absolute;left:3.5px;top:0;width:4px;height:8px;border:solid #f4ecd8;border-width:0 2px 2px 0;transform:rotate(40deg)}
.sh-ck input:focus-visible+i{box-shadow:0 0 0 3px rgba(90,160,142,.3)}
.sh-main{display:grid;grid-template-rows:auto minmax(0,1fr);min-width:0;min-height:0}
.sh-mh{display:flex;align-items:baseline;gap:8px;padding:8px 12px 6px;min-width:0}
.sh-mh>b{font:400 21px var(--title-font,serif);white-space:nowrap}
.sh-mh>small{flex:1;min-width:0;color:var(--soft);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sh-size{display:flex;align-items:center;gap:4px;color:var(--soft);align-self:center}
.sh-size input{width:76px;accent-color:var(--jade)}
.sh-grid{overflow:auto;padding:4px 10px 12px;scrollbar-width:thin;min-height:0}
.sh-grid.cells{display:grid;grid-template-columns:repeat(auto-fill,minmax(calc(var(--ic) + 14px),1fr));gap:6px;align-content:start}
.sh-cell{position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0;padding:6px 3px 5px;border:1px solid rgba(110,90,60,.22);border-radius:7px;background:rgba(255,251,242,.66);
  transition:transform .14s var(--ease),border-color .14s,box-shadow .14s,background .14s;content-visibility:auto;contain-intrinsic-size:auto calc(var(--ic) + 34px)}
.sh-grid.anim .sh-cell{animation:sh-card .3s var(--ease) both;animation-delay:calc(var(--i) * 10ms)}
.sh-cell:hover{transform:translateY(-2px);border-color:var(--tone);background:rgba(255,252,245,.95);box-shadow:0 4px 12px rgba(40,30,15,.18)}
.sh-th{width:var(--ic);height:var(--ic);display:grid;place-items:center;border-radius:6px;background:radial-gradient(circle at 50% 60%,rgba(255,255,255,.75),rgba(226,214,186,.35) 70%,transparent 72%)}
.sh-th img{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 2px 2px rgba(40,30,15,.25));transition:transform .2s var(--ease)}
.sh-th.fresh img{animation:sh-fade .35s ease both}
.sh-cell:hover .sh-th img{transform:scale(1.07)}
.sh-glyph{width:calc(var(--ic) * .7);height:calc(var(--ic) * .7);display:grid;place-items:center;font:400 calc(var(--ic) * .4) var(--title-font,serif);color:#f8eedb;background:var(--tone);border-radius:5px;box-shadow:inset 0 0 0 2px rgba(255,240,215,.25),inset 0 -6px 10px rgba(0,0,0,.18)}
.sh-nm{max-width:100%;font-size:12px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 2px}
.sh-nonames .sh-nm{display:none}
.sh-star{position:absolute;right:3px;top:2px;font:14px/1 serif;font-style:normal;color:rgba(90,76,54,.4);opacity:0;transition:opacity .15s,transform .2s var(--ease),color .15s;padding:2px}
.sh-cell:hover .sh-star{opacity:1}.sh-star:hover{color:var(--gold);transform:scale(1.25)}
.sh-cell.fav .sh-star{opacity:1;color:var(--gold);text-shadow:0 0 4px rgba(184,150,80,.5)}
.sh-cell.placing{border-color:var(--ver);box-shadow:0 0 0 2px rgba(168,53,42,.35);background:#fbeee4}
.sh-cell.placing .sh-th{animation:sh-breathe 1.2s ease-in-out infinite}
.sh-cell.hit{animation:sh-hit .4s var(--ease)}
.sh-float{position:absolute;right:6px;top:4px;font:700 14px var(--body-font);font-style:normal;color:var(--jade);pointer-events:none;animation:sh-float .9s ease-out forwards}
.sh-empty,.sh-more{grid-column:1/-1;text-align:center;color:rgba(60,50,35,.5);font:400 20px var(--title-font,serif);padding:30px 10px}
.sh-more{font-size:15px;padding:8px}
.sh-grid.flow{display:flex;flex-direction:column;gap:8px}
.sh-rail{display:none}
.sh-grip{position:absolute;right:-5px;top:12px;bottom:12px;width:10px;cursor:ew-resize}
.sh-grip::after{content:'';position:absolute;left:4px;top:45%;height:44px;width:2px;border-radius:1px;background:rgba(90,76,54,.25);transition:background .15s}
.sh-grip:hover::after{background:var(--jade2)}
.sh-fold{position:absolute;top:50%;width:16px;height:46px;margin-top:-23px;display:grid;place-items:center;padding:0;border:1px solid rgba(110,90,60,.5);background:#efe5cf;box-shadow:0 2px 6px rgba(30,20,10,.2);z-index:2;transition:background .15s}
.sh-fold svg{width:9px;height:9px;fill:none;stroke:var(--soft);stroke-width:1.6;transition:transform .26s var(--ease)}
.sh-fold:hover{background:#fff8ea}
.sh-box .sh-fold{right:-17px;border-radius:0 6px 6px 0;border-left:none}
.sh-tools .sh-fold{left:-17px;border-radius:6px 0 0 6px;border-right:none}
.sh-root:not(.sh-touch) .sh-box.shut{width:50px!important;grid-template-rows:1fr}
.sh-root:not(.sh-touch) .sh-box.shut>:not(.sh-rail):not(.sh-fold){display:none}
.sh-root:not(.sh-touch) .sh-box.shut .sh-rail{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 0;overflow:auto;scrollbar-width:none}
.sh-box.shut .sh-fold svg,.sh-tools.shut .sh-fold svg{transform:rotate(180deg)}
.sh-rb{width:36px;height:36px;flex:none;display:grid;place-items:center;border:1px solid transparent;border-radius:8px;background:none;color:var(--soft);transition:all .15s}
.sh-rb:hover{background:rgba(255,250,238,.8);color:var(--ink);transform:scale(1.06)}
.sh-rb.on{color:var(--ver);border-color:rgba(168,53,42,.3);background:rgba(255,250,238,.7)}
/* ---------- 试场 / 预设 / 模组页 ---------- */
.sh-scenes{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px}
.sh-scene{text-align:left;padding:8px 10px;border:1px solid rgba(110,90,60,.35);border-radius:5px;background:linear-gradient(135deg,rgba(255,251,242,.9),rgba(232,222,198,.8));animation:sh-card .3s var(--ease) both;animation-delay:calc(var(--i) * 30ms);transition:transform .12s,border-color .12s}
.sh-scene:hover{transform:translateY(-1px);border-color:var(--ver)}
.sh-scene b{display:block;font:400 18px var(--title-font,serif)}.sh-scene small{font-size:11.5px;color:var(--soft)}
.sh-psave{display:flex;gap:6px;padding:4px 4px 4px 10px;border:1px solid rgba(80,66,44,.4);border-radius:16px;background:rgba(255,251,242,.92)}
.sh-preset{display:flex;align-items:center;gap:6px;padding:6px 8px;border:1px solid rgba(110,90,60,.25);border-radius:5px;background:rgba(255,251,242,.75);animation:sh-card .28s var(--ease) both;animation-delay:calc(var(--i) * 25ms)}
.sh-preset>div{flex:1;min-width:0}.sh-preset b{display:block;font-size:13px}.sh-preset small{font-size:11px;color:var(--soft)}
.sh-units{display:flex;flex-direction:column;gap:3px}
.sh-unit{position:relative;display:flex;align-items:center;gap:6px;text-align:left;padding:4px 8px 6px;border:1px solid rgba(110,90,60,.22);border-radius:4px;background:rgba(255,251,242,.75);font-size:13px;overflow:hidden;transition:border-color .12s}
.sh-unit:hover{border-color:var(--c)}
.sh-unit i{width:8px;height:8px;border-radius:50%;background:var(--c);flex:none}
.sh-unit small{margin-left:auto;font-size:11px;color:var(--soft);white-space:nowrap}
.sh-unit em{position:absolute;left:0;bottom:0;height:2px;background:var(--c);transition:width .3s}
.sh-unit.on{border-color:var(--c);background:#fff8ea}
.sh-log{font-size:12px;line-height:1.75}
.sh-log p{margin:0}.sh-log i{font-style:normal;color:var(--soft);margin-right:6px;font-family:ui-monospace,monospace}
.sh-log .good{color:var(--jade)}.sh-log .bad{color:var(--ver)}.sh-log .warn{color:#8a6a20}
.sh-rules{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:5px}
.sh-rule{display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto;column-gap:8px;align-items:center;text-align:left;padding:6px 8px;border:1px solid rgba(110,90,60,.28);border-radius:5px;background:rgba(255,251,242,.75);transition:border-color .15s,background .15s}
.sh-rule .sh-sw{grid-row:span 2}
.sh-rule b{font-size:13px}.sh-rule small{font-size:11px;color:var(--soft)}
.sh-rule.on{border-color:var(--jade2);background:rgba(226,239,228,.85)}
.sh-sw{width:30px;height:16px;border-radius:8px;background:rgba(90,82,70,.3);position:relative;transition:background .2s}
.sh-sw::after{content:'';position:absolute;left:2px;top:2px;width:12px;height:12px;border-radius:50%;background:#fbf6ea;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .22s var(--ease)}
.sh-rule.on .sh-sw,.sh-switch.on{background:var(--jade)}
.sh-rule.on .sh-sw::after{transform:translateX(14px)}
.sh-envr{display:flex;flex-direction:column;gap:6px;padding:6px 8px;border:1px solid rgba(110,90,60,.25);border-radius:5px;background:rgba(255,251,242,.7)}
.sh-wx{display:flex;flex-wrap:wrap;gap:2px}
.sh-wx button{width:28px;height:28px;border:1px solid transparent;border-radius:50%;background:none;font:400 15px var(--title-font,serif);color:var(--soft);padding:0;transition:all .15s}
.sh-wx button:hover{border-color:rgba(80,66,44,.4)}
.sh-wx button.on{background:var(--jade);color:#f4ecd8}
.sh-time{display:flex;align-items:center;gap:6px}
.sh-time input{flex:1;min-width:0;accent-color:var(--gold)}
.sh-time small{font-size:11.5px;color:var(--soft);min-width:30px}
.sh-sun{--p:.3;width:18px;height:18px;flex:none;border-radius:50%;background:radial-gradient(circle,#ffe7a0,#e0a840);box-shadow:0 0 8px rgba(255,200,90,.7);filter:brightness(calc(.55 + .45 * (1 - (2 * var(--p) - 1) * (2 * var(--p) - 1))))}
/* ---------- 工具面板 ---------- */
.sh-tools{position:absolute;right:8px;top:var(--pt);bottom:var(--pb);width:var(--tw,300px);max-width:calc(100vw - 16px);display:grid;grid-template-rows:auto minmax(0,1fr);
  background:url('${IMG.panel2}') top right/cover,#eeeadf;border:1px solid rgba(110,90,60,.5);border-radius:6px;box-shadow:0 12px 34px rgba(30,20,10,.32);transition:width .26s var(--ease),opacity .2s,transform .26s var(--ease)}
.sh-ttabs{display:flex;gap:2px;padding:6px 6px 0;border-bottom:1px solid var(--line)}
.sh-ttabs button{flex:1;display:flex;align-items:center;justify-content:center;gap:5px;border:none;background:none;padding:6px 4px 7px;border-radius:6px 6px 0 0;font:400 15px var(--title-font,serif);color:var(--soft);position:relative;transition:color .15s,background .15s}
.sh-ttabs .sh-ic{width:17px;height:17px}
.sh-ttabs button:hover{background:rgba(255,250,238,.5);color:var(--ink)}
.sh-ttabs button.on{color:var(--ink);background:rgba(255,251,242,.6)}
.sh-ttabs button.on::after{content:'';position:absolute;left:18%;right:18%;bottom:-1px;height:6px;background:var(--jade);-webkit-mask:url('${IMG.stroke}') center/100% 100% no-repeat;mask:url('${IMG.stroke}') center/100% 100% no-repeat;animation:sh-ink .3s var(--ease)}
.sh-tbody{display:flex;flex-direction:column;min-height:0;overflow:hidden}
.sh-tf{display:flex;align-items:center;gap:6px;margin:8px 8px 4px;padding:0 8px;border:1px solid rgba(80,66,44,.4);border-radius:14px;background:rgba(255,251,242,.92);color:var(--soft);flex:none}
.sh-tf:focus-within{border-color:var(--jade2);box-shadow:0 0 0 3px rgba(90,160,142,.2)}
.sh-tf .sh-ic{width:14px;height:14px}
.sh-tbody.sheet .sh-tlist{max-height:26%}
.sh-tlist{flex:0 1 auto;max-height:44%;transition:max-height .26s var(--ease);overflow:auto;padding:0 6px 6px;scrollbar-width:thin}
.sh-tg2{margin-top:2px}
.sh-tgh{display:flex;align-items:center;gap:6px;width:100%;border:none;background:none;padding:4px 4px;font:400 14.5px var(--title-font,serif);color:var(--soft);text-align:left}
.sh-tgh img{width:16px;height:16px;border-radius:3px;object-fit:cover}
.sh-tgh span{flex:1}.sh-tgh small{font:11px ui-monospace,monospace;opacity:.7}
.sh-tgh svg{transform:rotate(90deg)}
.sh-tg2.shut .sh-tgh svg{transform:none}
.sh-tgb{grid-template-rows:1fr}.sh-tg2.shut .sh-tgb{grid-template-rows:0fr}
.sh-tgb>div{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:2px}
.sh-tool{display:flex;align-items:center;gap:7px;min-width:0;border:1px solid transparent;background:none;border-radius:5px;padding:4px 7px;font-size:13px;text-align:left;transition:background .12s,border-color .12s,color .12s}
.sh-tool span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sh-tool .sh-ic{width:18px;height:18px;color:var(--soft);transition:transform .2s var(--ease),color .15s}
.sh-tool img,.sh-tool>b{width:18px;height:18px;flex:none;border-radius:4px;object-fit:cover;display:grid;place-items:center;background:var(--tone,#7a3a5a);color:#f8eedb;font:400 12px var(--title-font,serif)}
.sh-tool:hover{background:rgba(255,250,238,.85)}.sh-tool:hover .sh-ic{transform:rotate(-8deg)}
.sh-tool.on{background:var(--jade);color:#f4ecd8;border-color:#245247}.sh-tool.on .sh-ic{color:#f4ecd8}
.sh-cp{flex:1 1 auto;min-height:0;overflow:auto;padding:8px 10px 14px;border-top:1px solid var(--line);background:rgba(250,245,232,.55);scrollbar-width:thin}
.sh-cp.in{animation:sh-fade .22s ease both}
.sh-cph{display:flex;align-items:center;gap:7px;margin-bottom:2px}.sh-cph b{font:400 20px var(--title-font,serif)}.sh-cph .sh-ic{color:var(--ver)}
.sh-cp>*+*{margin-top:8px}
.sh-tmini{display:none}
.sh-root:not(.sh-touch) .sh-tools.shut{width:46px!important;grid-template-rows:1fr}
.sh-root:not(.sh-touch) .sh-tools.shut>:not(.sh-tmini):not(.sh-fold){display:none}
.sh-root:not(.sh-touch) .sh-tools.shut .sh-tmini{display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 0;cursor:pointer;color:var(--soft)}
.sh-tmini span{writing-mode:vertical-rl;font:400 15px var(--title-font,serif);letter-spacing:.2em}
.sh-tmini b{width:22px;height:22px;display:grid;place-items:center;border-radius:4px;background:#7a3a5a;color:#f8eedb;font:400 13px var(--title-font,serif)}
.sh-tmini:hover{color:var(--ver)}
.sh-mods{display:flex;flex-direction:column;gap:6px;padding:8px;overflow:auto;min-height:0}
.sh-modc{display:flex;gap:9px;padding:8px;border:1px solid rgba(110,90,60,.26);border-radius:6px;background:rgba(255,251,242,.78);animation:sh-card .28s var(--ease) both;animation-delay:calc(var(--i) * 30ms)}
.sh-modc>img,.sh-modc>b{width:40px;height:40px;flex:none;border-radius:7px;object-fit:cover;display:grid;place-items:center;background:#7a3a5a;color:#f8eedb;font:400 22px var(--title-font,serif)}
.sh-modc>div{flex:1;min-width:0}.sh-modc>div>b{font-size:14px}.sh-modc small{display:block;font-size:11px;color:var(--soft)}
.sh-modc p{margin:3px 0 5px;font-size:12px;color:var(--soft)}.sh-modc span{display:flex;gap:4px;flex-wrap:wrap}
.sh-sets{padding:10px 12px;overflow:auto;min-height:0}.sh-sets h4{margin:14px 0 4px;font:400 17px var(--title-font,serif)}
.sh-sets code,.sh-tip code{font-size:10.5px;background:rgba(255,251,242,.8);padding:1px 3px;border-radius:2px;word-break:break-all}
/* ---------- 属性表 ---------- */
.sh-empty2{text-align:center;padding:12px 6px;color:var(--soft)}.sh-empty2 .sh-ic{color:rgba(90,76,54,.4)}
.sh-empty2>b{display:block;font:400 22px var(--title-font,serif);color:var(--ink);margin:4px 0}.sh-empty2 p{font-size:12.5px;line-height:1.7;margin:6px 0}.sh-empty2 .sh-acts{justify-content:center}
.sh-ih{display:flex;gap:10px;align-items:center}
.sh-ih>div{flex:1;min-width:0}.sh-ih>div>b{display:block;font:400 22px var(--title-font,serif);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sh-ih small{color:var(--soft);font-size:12px}
.sh-ph{width:52px;height:52px;flex:none;display:grid;place-items:center;border-radius:6px;background:var(--tone);overflow:hidden;box-shadow:inset 0 0 0 2px rgba(255,240,215,.25)}
.sh-ph.pic{background:radial-gradient(circle at 50% 60%,#fffaf0,#e6dac0)}
.sh-ph img{width:100%;height:100%;object-fit:cover;object-position:50% 20%}
.sh-ph b{font:400 28px var(--title-font,serif);color:#f8eedb}
.sh-x{border:none;background:none;font-size:22px;line-height:1;color:var(--soft);padding:0 4px}
.sh-x:hover{color:var(--ver)}
.sh-sbar{display:flex;justify-content:flex-end}
.sh-note{font-size:11.5px;color:#7a5520;background:rgba(184,150,80,.14);border-left:3px solid var(--gold);padding:4px 8px;margin:0}
.sh-bar{position:relative;height:16px;border:1px solid rgba(60,50,35,.4);border-radius:2px;background:rgba(40,30,20,.12);overflow:hidden}
.sh-bar+.sh-bar{margin-top:3px}
.sh-bar i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(#c45a4a,#9a2f24);transition:width .25s var(--ease)}
.sh-bar.mp i{background:linear-gradient(#5a8fc0,#2f5f8e)}
.sh-bar span{position:relative;display:block;text-align:center;font-size:11px;line-height:16px;color:#fff8ea;text-shadow:0 1px 2px rgba(0,0,0,.6)}
.sh-meter{display:grid;grid-template-columns:auto auto 1fr;gap:10px;align-items:end;padding:6px 8px;background:rgba(255,251,242,.75);border-radius:4px;border:1px solid rgba(110,90,60,.2)}
.sh-meter small{display:block;font-size:10.5px;color:var(--soft)}.sh-meter b{font:700 17px ui-monospace,monospace;color:var(--ver)}
.sh-meter canvas{width:100%;height:34px}
.sh-grp{border:1px solid rgba(110,90,60,.2);border-radius:5px;background:rgba(255,251,242,.55)}
.sh-gh{display:flex;align-items:center;gap:6px;width:100%;border:none;background:none;padding:5px 8px;font:400 15px var(--title-font,serif);text-align:left}
.sh-gh small{margin-left:auto;font:11px ui-monospace,monospace;color:var(--soft)}
.sh-gh svg{transform:rotate(90deg)}.sh-grp.shut .sh-gh svg{transform:none}
.sh-gb{grid-template-rows:1fr}.sh-grp.shut .sh-gb{grid-template-rows:0fr}
.sh-gb>div{padding:0 6px}.sh-grp:not(.shut) .sh-gb>div{padding-bottom:6px}
.sh-row{display:grid;grid-template-columns:minmax(58px,38%) minmax(0,1fr) 18px;align-items:center;gap:6px;min-height:28px;padding:1px 2px;border-radius:4px;transition:background .3s}
.sh-row>label{font-size:12.5px;color:var(--soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:help}
.sh-q{font-style:normal;font-size:9.5px;margin-left:3px;padding:0 2px;border-radius:2px;background:rgba(184,150,80,.25);color:#7a5520;vertical-align:1px}
.sh-row.changed{background:rgba(184,150,80,.14)}
.sh-row.changed>label{color:#7a5520;font-weight:700}
.sh-rst{width:18px;height:18px;padding:0;border:none;background:none;color:#7a5520;font-size:13px;line-height:1;opacity:0;pointer-events:none;transition:opacity .15s,transform .25s var(--ease)}
.sh-row.changed .sh-rst{opacity:1;pointer-events:auto}.sh-rst:hover{transform:rotate(-120deg)}
.sh-params .sh-row,.sh-sets .sh-row{grid-template-columns:minmax(58px,40%) minmax(0,1fr)}
.sh-scrub{--d:0;position:relative;height:24px;display:flex;align-items:center;padding:0 8px;border:1px solid rgba(110,90,60,.3);border-radius:4px;background:rgba(255,251,242,.9);cursor:ew-resize;user-select:none;touch-action:none;overflow:hidden;transition:border-color .12s,background .12s}
.sh-scrub:hover{border-color:var(--jade2)}
.sh-scrub b{font:700 13px ui-monospace,monospace;white-space:nowrap}
.sh-scrub.blank b{color:rgba(90,82,70,.45);font-weight:400}
.sh-scrub i{position:absolute;left:50%;bottom:0;height:2px;width:calc(var(--d) * 50%);background:var(--ver);transform-origin:left}
.sh-scrub.drag{border-color:var(--ver);background:#fff7ea}
.sh-scrin{width:100%;box-sizing:border-box;font:700 13px ui-monospace,monospace;border:none;outline:none;background:transparent;padding:0}
.sh-switch{justify-self:start;width:34px;height:18px;padding:0;border:none;border-radius:9px;background:rgba(90,82,70,.3);position:relative;transition:background .2s}
.sh-switch i{position:absolute;left:2px;top:2px;width:14px;height:14px;border-radius:50%;background:#fbf6ea;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .22s var(--ease)}
.sh-switch.on i{transform:translateX(16px)}
.sh-sel{min-width:0;max-width:100%;font:inherit;font-size:12.5px;padding:2px 4px;border:1px solid rgba(80,66,44,.4);border-radius:4px;background:#fbf6ea;color:var(--ink)}
.sh-num,.sh-txt{min-width:0;width:100%;box-sizing:border-box;font:12.5px ui-monospace,monospace;padding:3px 6px;border:1px solid rgba(80,66,44,.4);border-radius:4px;background:#fbf6ea;color:var(--ink)}
.sh-txt{font-family:inherit}
.sh-color{display:flex;align-items:center;gap:6px;min-width:0;cursor:pointer}
.sh-color input{position:absolute;opacity:0;width:0;height:0}
.sh-color span{width:22px;height:18px;flex:none;border-radius:3px;border:1px solid rgba(60,50,35,.35);box-shadow:inset 0 0 0 1px rgba(255,255,255,.5)}
.sh-color code{font-size:11px;color:var(--soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sh-wrap{display:flex;flex-wrap:wrap;gap:4px}
.sh-chip{border:1px solid rgba(80,66,44,.35);background:rgba(255,250,238,.7);border-radius:12px;padding:2px 10px;font-size:12.5px;transition:all .14s}
.sh-chip.sm{padding:1px 8px;font-size:12px}
.sh-chip:hover{border-color:var(--jade2)}
.sh-chip.on{background:var(--jade);border-color:var(--jade);color:#f3ead4}
.sh-step{display:flex;align-items:center;border:1px solid rgba(80,66,44,.4);border-radius:12px;overflow:hidden;margin-right:2px}
.sh-step button{border:none;background:rgba(255,250,238,.8);width:22px;padding:1px 0}
.sh-step b{min-width:22px;text-align:center;font-size:13px}
.sh-seg{display:inline-flex;max-width:100%;border:1px solid rgba(80,66,44,.4);border-radius:14px;overflow:hidden;background:rgba(255,250,238,.6)}
.sh-seg button{border:none;background:none;padding:4px 14px;font-size:13.5px;white-space:nowrap;transition:background .15s,color .15s}
.sh-seg.sm button{padding:2px 9px;font-size:12.5px}
.sh-seg button+button{border-left:1px solid rgba(80,66,44,.25)}
.sh-seg button.on{background:var(--c,var(--jade));color:#f6ecd6}
.sh-range{flex:1;min-width:0;accent-color:var(--jade)}
.sh-tip{margin:4px 0 0;font-size:12px;color:var(--soft);line-height:1.6}
.sh-acts{display:flex;flex-wrap:wrap;gap:5px}
.sh-btn{border:1px solid rgba(80,66,44,.55);background:linear-gradient(#f6eedb,#e3d5b4);border-radius:4px;padding:5px 12px;font-size:13px;transition:border-color .12s,filter .12s,opacity .12s}
.sh-btn.sm{padding:3px 9px;font-size:12.5px}
.sh-btn:hover:not(:disabled){border-color:var(--ver);filter:brightness(1.03)}
.sh-btn:disabled{opacity:.45;cursor:default}
.sh-btn.jade{background:linear-gradient(#5aa08e,#2f6b5e);color:#f4ecd8;border-color:#245247}
.sh-btn.bad{background:linear-gradient(#c45a4a,#a8352a);color:#f8eedc;border-color:#7c2219}
.sh-btn.ghost{background:transparent}
/* ---------- 提示、战报、浮层 ---------- */
.sh-hint{position:absolute;left:50%;top:52px;transform:translateX(-50%);max-width:calc(100vw - 24px);padding:6px 14px;background:rgba(38,35,30,.9);color:#f3e7c8;border-radius:16px;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none!important;z-index:3}
.sh-hint.in{animation:sh-drop .3s var(--ease) both}
.sh-hint b{color:#ffd9a0}.sh-hint kbd{background:rgba(255,255,255,.15);color:#f3e7c8;border-color:rgba(255,255,255,.3)}
.sh-feed{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(var(--pb) + 10px);width:min(360px,calc(100vw - 24px));display:flex;flex-direction:column;align-items:center;gap:3px;pointer-events:none!important}
.sh-feed p{margin:0;padding:3px 10px;font-size:12.5px;background:rgba(38,35,30,.78);color:#efe2c4;border-radius:3px;animation:sh-feed .3s var(--ease) both;transition:opacity .8s,transform .8s;max-width:100%}
.sh-feed p.out{opacity:0;transform:translateX(16px)}
.sh-feed i{font-style:normal;opacity:.6;margin-right:6px;font-family:ui-monospace,monospace;font-size:11px}
.sh-feed .good{border-left:3px solid var(--jade2)}.sh-feed .bad{border-left:3px solid #e06a50}.sh-feed .warn{border-left:3px solid var(--gold)}
.sh-pop{position:fixed;z-index:5;width:220px;padding:10px 12px;background:url('${IMG.paper}') center/cover,#f1e8d4;border:1px solid rgba(110,90,60,.55);border-radius:5px;box-shadow:0 10px 28px rgba(30,20,10,.35);opacity:0;transform:scale(.96);transform-origin:left top}
.sh-pop.in{opacity:1;transform:none;transition:opacity .14s,transform .14s var(--ease)}
.sh-pop b{display:block;font:400 20px var(--title-font,serif)}.sh-pop p{font-size:12px;color:var(--soft);margin:4px 0 8px;line-height:1.6}
.sh-pop>div{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
.sh-menu{position:fixed;z-index:6;min-width:140px;max-height:60vh;overflow:auto;padding:4px;background:#f3ebd8;border:1px solid rgba(110,90,60,.55);border-radius:5px;box-shadow:0 10px 28px rgba(30,20,10,.35)}
.sh-menu.in{animation:sh-fade .14s ease both}
.sh-menu button{display:block;width:100%;text-align:left;border:none;background:none;padding:5px 10px;border-radius:3px;font-size:13px}
.sh-menu button:hover{background:rgba(47,107,94,.14)}.sh-menu button.on{color:var(--ver)}
.sh-ttip{position:fixed;z-index:7;max-width:260px;padding:7px 10px;background:rgba(38,35,30,.94);color:#efe2c4;border-radius:5px;box-shadow:0 8px 22px rgba(0,0,0,.3);pointer-events:none!important;font-size:12px;line-height:1.5}
.sh-ttip.in{animation:sh-fade .15s ease both}
.sh-ttip b{display:block;font:400 17px var(--title-font,serif);color:#fff3d8}.sh-ttip small{display:block;color:#cdbf9f}.sh-ttip p{margin:4px 0;color:#e9dcbd}
.sh-ttip em{display:block;font-style:normal;color:#9fd2c2;margin-top:3px}.sh-ttip code{display:block;font-size:10.5px;color:#9a8f78;margin-top:2px}
.sh-toast{position:absolute;left:50%;top:60px;transform:translate(-50%,-10px);opacity:0;padding:8px 18px;border-radius:4px;background:rgba(38,35,30,.92);color:#f0e4c8;font-size:14px;transition:all .25s var(--ease);pointer-events:none;max-width:calc(100vw - 24px)}
.sh-toast.show{opacity:1;transform:translate(-50%,0)}
.sh-toast.good{background:rgba(47,107,94,.95)}.sh-toast.bad{background:rgba(168,53,42,.95)}.sh-toast.warn{background:rgba(140,108,40,.95)}
.stamp{animation:sh-stamp .3s var(--ease)}
@keyframes sh-drop{from{opacity:0;transform:translate(-50%,-16px)}to{opacity:1;transform:translate(-50%,0)}}
@keyframes sh-slidel{from{opacity:0;transform:translateX(-26px)}to{opacity:1;transform:none}}
@keyframes sh-slider{from{opacity:0;transform:translateX(26px)}to{opacity:1;transform:none}}
@keyframes sh-pop{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:none}}
@keyframes sh-card{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes sh-fade{from{opacity:0}to{opacity:1}}
@keyframes sh-ink{from{transform:scaleX(.2);opacity:0}to{transform:none;opacity:1}}
@keyframes sh-feed{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:none}}
@keyframes sh-stamp{0%{transform:scale(1)}35%{transform:scale(1.14) rotate(-5deg)}100%{transform:scale(1)}}
@keyframes sh-breathe{50%{transform:scale(1.08);filter:brightness(1.12)}}
@keyframes sh-hit{30%{transform:scale(.95);border-color:var(--jade2)}100%{transform:none}}
@keyframes sh-float{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-22px)}}
/* ---------- 窄屏：一次只开一块，面板占满宽度，留出另一块的收起条 ---------- */
@media (max-width:1100px){.sh-top>b{display:none}}
@media (max-width:900px){
  .sh-root{--pt:50px;--pb:118px}
  .sh-box{left:6px;right:58px;width:auto!important;max-width:none!important;--tree:118px}
  .sh-box.shut{right:auto}
  .sh-tools{left:62px;right:6px;width:auto!important}
  .sh-tools.shut{left:auto}
  .sh-hud:has(.sh-tools:not(.shut)) .sh-box.shut{z-index:1}
  .sh-grip{display:none}
  .sh-top{gap:5px}.sh-top small,.sh-clock{display:none}
  .sh-checks{grid-template-columns:1fr}
}
@media (max-width:560px){.sh-speed{display:none}.sh-size{display:none}.sh-tgb>div{grid-template-columns:1fr 1fr}.sh-tabs{overflow-x:auto;scrollbar-width:none}.sh-tabs::-webkit-scrollbar{display:none}.sh-tab{flex:none}.sh-bxb{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,40%) minmax(0,1fr)}.sh-side{border-right:none;border-bottom:1px solid var(--line)}.sh-tree{min-height:70px}.sh-opts{max-height:46%}.sh-checks{grid-template-columns:1fr 1fr}}
/* ---------- 1.3.7：顶栏占住主界面「顶栏堆叠」最上一格，首领条、锁定目标条排到它下面（.hz-top 有 zoom，按界面大小折回去） ---------- */
html.sh-on .game-root .hud>.hz-top{padding-top:calc(var(--sh-top-pad,0px) / var(--hud-scale,1));padding-left:var(--sh-top-pl,0px);padding-right:var(--sh-top-pr,0px)}
.sh-root{--sl:env(safe-area-inset-left,0px);--sr:env(safe-area-inset-right,0px);--st:env(safe-area-inset-top,0px);--sb:env(safe-area-inset-bottom,0px)}
.sh-dx,.sh-modebar,.sh-pb,.sh-tx,.sh-tkeys{display:none}
/* ---------- 1.3.7：入阵窗口——矮屏 / 窄屏（手机横竖屏）：整张能滚、底部「入阵」常驻、按钮够大、避开安全区 ---------- */
@media (max-height:560px),(max-width:620px){
  .sh-gate{justify-content:center;align-items:center;padding:calc(8px + var(--st)) calc(10px + var(--sr)) calc(8px + var(--sb)) calc(10px + var(--sl))}
  .sh-gcard{width:min(560px,100%);max-height:100%;box-sizing:border-box;padding:12px 18px 0;clip-path:none;opacity:0;transform:translateY(16px);transition:opacity .28s,transform .4s var(--ease);touch-action:pan-y;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
  .sh-gate.in .sh-gcard{clip-path:none;opacity:1;transform:none}
  .sh-gcard::before,.sh-gcard::after{display:none}
  .sh-gcard h1{font-size:34px;margin:0}
  .sh-sub{margin:0 0 6px;font-size:13px}
  .sh-gsec{margin:8px 0}
  .sh-gsec>b{font-size:17px;margin-bottom:4px}
  .sh-opt{min-height:54px;padding:7px 10px;align-items:center}
  .sh-opt i{width:34px;height:34px;font-size:20px}
  .sh-gate .sh-chip{min-height:36px;padding:4px 14px;font-size:14px}
  .sh-gate .sh-seg{display:flex;flex-wrap:wrap}
  .sh-gate .sh-seg button{min-height:38px;flex:1 1 auto;padding:4px 10px}
  .sh-warn{margin:8px 0 0;font-size:12px;padding:5px 9px}
  .sh-grow{position:sticky;bottom:0;z-index:2;margin:0 -18px;padding:10px 18px calc(10px + var(--sb));background:linear-gradient(rgba(241,232,212,0),#efe5cf 34%)}
  .sh-go{padding:6px 30px;font-size:22px!important;min-height:44px}
  .sh-grow .sh-btn{min-height:44px;padding:6px 20px;font-size:15px}
  .sh-keys{margin:2px 0 12px;line-height:1.7}
}
@media (max-height:560px) and (min-width:700px){
  .sh-gcard{width:min(880px,100%);display:grid;grid-template-columns:1fr 1fr;column-gap:22px;align-content:start}
  .sh-gcard>h1{grid-column:1}.sh-gcard>.sh-sub{grid-column:2;align-self:end;margin:0 0 6px}
  .sh-gcard>.sh-warn,.sh-gcard>.sh-grow,.sh-gcard>.sh-keys{grid-column:1/-1}
}
/* ================= 1.3.7：触屏 ================= */
.sh-touch .sh-tkeys{display:block}
.sh-touch .sh-mkeys,.sh-touch .sh-fold,.sh-touch .sh-grip,.sh-touch .sh-rail,.sh-touch .sh-tmini,.sh-touch .sh-hint,.sh-touch .sh-size{display:none!important}
.sh-touch .sh-gate .sh-chip{min-height:38px;padding:4px 14px}
.sh-touch .sh-gate .sh-seg button{min-height:40px}
.sh-touch .sh-grow .sh-btn{min-height:44px;padding:6px 20px}
/* 阵枢：一枚小药丸（试 · 匣 · 具 · 暂停 · ⋯），「⋯」展开整条 */
.sh-touch .sh-top{gap:4px;padding:3px;border-radius:25px;z-index:6;transition:opacity .2s,transform .26s var(--ease)}
.sh-touch .sh-top .sh-seal{width:40px;height:40px;border:none;padding:0;font-size:22px}
.sh-touch .sh-pb{display:grid;width:40px;height:40px;place-items:center;padding:0;border:1px solid rgba(80,66,44,.35);border-radius:50%;background:rgba(255,250,238,.78);font:400 19px var(--title-font,serif);transition:background .15s,color .15s,border-color .15s}
.sh-pb b{font-weight:400}
.sh-pb.on{background:var(--jade);border-color:#245247;color:#f4ecd8}
.sh-pb.more b{font:700 17px/1 ui-monospace,monospace}
.sh-touch .sh-top.open .sh-pb.more{border-color:var(--ver);color:var(--ver)}
.sh-touch .sh-top .sh-db,.sh-touch .sh-top .sh-db.big{width:40px;height:40px}
.sh-touch .sh-top .sh-db svg{width:16px;height:16px}
.sh-touch .sh-tx{display:flex;position:absolute;top:calc(100% + 6px);left:50%;flex-direction:column;gap:6px;padding:8px;background:url('${IMG.paper}') center/cover,#efe5cf;border:1px solid rgba(110,90,60,.55);border-radius:14px;box-shadow:0 10px 26px rgba(30,20,10,.35);
  opacity:0;transform:translate(-50%,-8px) scale(.97);transform-origin:50% 0;pointer-events:none;transition:opacity .16s,transform .22s var(--ease)}
.sh-touch .sh-top.open .sh-tx{opacity:1;transform:translate(-50%,0);pointer-events:auto}
.sh-txr{display:flex;align-items:center;justify-content:center;gap:6px}
.sh-touch .sh-tx .sh-clock{display:inline!important;min-width:44px}
.sh-touch .sh-tx .sh-speed{display:flex!important}
.sh-touch .sh-tx .sh-speed button{width:40px;height:36px}
.sh-touch .sh-tx .sh-ind{width:40px;transform:translateX(calc(var(--k) * 40px))}
.sh-touch .sh-tx .sh-tb{min-height:40px;padding:0 14px;font-size:15px;border-radius:20px}
.sh-touch .sh-hud.tucked .sh-top{opacity:.85;transform:translateX(-50%)}
.sh-touch .sh-hud.tucked .sh-top>:not(.sh-seal){display:none}
.sh-touch .sh-hud.drawer .sh-top{opacity:0;transform:translate(-50%,-12px);pointer-events:none}
/* 两块面板：抽屉（横屏左右滑出，竖屏底部弹出），收起时整块滑走 */
.sh-touch .sh-hud.in .sh-box,.sh-touch .sh-hud.in .sh-tools{animation:none}
.sh-root.sh-touch .sh-box,.sh-root.sh-touch .sh-tools{top:calc(6px + var(--st));bottom:calc(6px + var(--sb));max-width:none!important;z-index:4;
  transition:transform .28s var(--ease),opacity .22s,visibility 0s;box-shadow:0 12px 40px rgba(20,14,6,.45)}
.sh-root.sh-touch .sh-box{left:calc(6px + var(--sl));right:auto!important;width:min(760px,64vw,calc(100vw - 120px))!important;--tree:132px}
.sh-root.sh-touch .sh-tools{right:calc(6px + var(--sr));left:auto!important;width:min(400px,48vw,calc(100vw - 120px))!important}
.sh-root.sh-touch .sh-box.shut{transform:translateX(calc(-100% - 24px));opacity:0;pointer-events:none;visibility:hidden;transition:transform .26s var(--ease),opacity .2s,visibility 0s .28s}
.sh-root.sh-touch .sh-tools.shut{transform:translateX(calc(100% + 24px));opacity:0;pointer-events:none;visibility:hidden;transition:transform .26s var(--ease),opacity .2s,visibility 0s .28s}
.sh-touch .sh-dx{display:grid;position:absolute;top:4px;right:4px;width:40px;height:40px;place-items:center;padding:0;border:1px solid rgba(110,90,60,.45);border-radius:50%;background:rgba(255,250,238,.92);font:400 26px/1 serif;color:var(--soft);z-index:3}
.sh-touch .sh-tabs{padding-right:50px;overflow-x:auto;scrollbar-width:none;touch-action:pan-x}
.sh-touch .sh-tabs::-webkit-scrollbar{display:none}
.sh-touch .sh-ttabs{padding-right:50px}
.sh-touch .sh-tab{flex:none;min-height:44px;padding:6px 10px 9px}
.sh-touch .sh-ttabs button{min-height:44px}
@media (max-aspect-ratio:1/1){
  .sh-root.sh-touch .sh-box,.sh-root.sh-touch .sh-tools{left:calc(4px + var(--sl))!important;right:calc(4px + var(--sr))!important;top:auto;bottom:0;width:auto!important;height:min(74vh,660px);border-radius:14px 14px 0 0;padding-bottom:var(--sb);box-sizing:border-box}
  .sh-root.sh-touch .sh-tools{height:min(68vh,620px)}
  .sh-root.sh-touch .sh-box.shut,.sh-root.sh-touch .sh-tools.shut{transform:translateY(calc(100% + 24px))}
}
/* 手指尺寸：点按区 ≥ 36px，输入框 16px 字（iOS 不自动放大） */
.sh-touch .sh-grid,.sh-touch .sh-tree,.sh-touch .sh-cp,.sh-touch .sh-tlist,.sh-touch .sh-opts,.sh-touch .sh-mods,.sh-touch .sh-sets,.sh-touch .sh-menu{touch-action:pan-y;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
.sh-touch .sh-node{height:38px;font-size:14px}
.sh-touch .sh-tw{width:30px;height:36px}
.sh-touch .sh-srch,.sh-touch .sh-tf{min-height:38px}
.sh-touch .sh-search,.sh-touch .sh-tq,.sh-touch .sh-pname{font-size:16px}
.sh-touch .sh-oh,.sh-touch .sh-tgh,.sh-touch .sh-gh{min-height:40px}
.sh-touch .sh-chip,.sh-touch .sh-chip.sm{min-height:36px;padding:4px 12px;font-size:13.5px}
.sh-touch .sh-seg button{min-height:38px;padding:4px 14px}
.sh-touch .sh-seg.sm button{min-height:36px;padding:2px 11px;font-size:13px}
.sh-touch .sh-step button{width:38px;height:38px;font-size:18px}
.sh-touch .sh-step b{min-width:30px}
.sh-touch .sh-fr{gap:6px;margin:6px 0}
.sh-touch .sh-ck{min-height:38px;font-size:14px}
.sh-touch .sh-ck i{width:20px;height:20px}
.sh-touch .sh-ck input:checked+i::after{left:6px;top:2px;width:5px;height:10px}
.sh-touch .sh-sel{min-height:38px;font-size:15px}
.sh-touch .sh-btn,.sh-touch .sh-btn.sm{min-height:40px;padding:6px 14px;font-size:14.5px}
.sh-touch .sh-tool{min-height:42px;font-size:14.5px}
.sh-touch .sh-tgb>div{grid-template-columns:repeat(auto-fill,minmax(124px,1fr))}
.sh-touch .sh-row{min-height:44px;grid-template-columns:minmax(64px,36%) minmax(0,1fr) 36px}
.sh-touch .sh-params .sh-row,.sh-touch .sh-sets .sh-row{grid-template-columns:minmax(64px,42%) minmax(0,1fr)}
.sh-touch .sh-row>label{font-size:14px}
.sh-touch .sh-scrub{height:38px;touch-action:pan-y}
.sh-touch .sh-scrub b,.sh-touch .sh-scrin{font-size:16px}
.sh-touch .sh-rst{width:36px;height:36px;font-size:18px}
.sh-touch .sh-switch{width:48px;height:28px;border-radius:14px}
.sh-touch .sh-switch i{left:3px;top:3px;width:22px;height:22px}
.sh-touch .sh-switch.on i{transform:translateX(20px)}
.sh-touch .sh-num,.sh-touch .sh-txt{min-height:38px;font-size:16px}
.sh-touch .sh-color{min-height:38px}.sh-touch .sh-color span{width:34px;height:28px}
.sh-touch .sh-x{width:40px;height:40px;font-size:26px}
.sh-touch .sh-rule{min-height:48px}
.sh-touch .sh-wx button{width:38px;height:38px;font-size:17px}
.sh-touch .sh-unit{min-height:40px;font-size:14px}
.sh-touch .sh-scene{min-height:52px}
.sh-touch .sh-menu button{min-height:40px;font-size:14.5px}
.sh-touch .sh-pop{width:min(260px,calc(100vw - 16px));z-index:6}
.sh-touch .sh-pop>div .sh-btn{flex:1 1 auto}
.sh-touch .sh-time input,.sh-touch .sh-range{height:32px}
.sh-touch .sh-grid.cells{--ic:56px}
.sh-touch .sh-cell{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}
.sh-touch .sh-cell:hover{transform:none;box-shadow:none}
.sh-touch .sh-star{opacity:.5;right:0;top:0;padding:6px 7px;font-size:17px}
/* 底部操作条：落子中 / 拿着「到场上点」的工具 */
.sh-touch .sh-modebar{display:flex;position:absolute;left:50%;bottom:calc(8px + var(--sb));transform:translateX(-50%);align-items:center;gap:8px;max-width:calc(100vw - 16px);box-sizing:border-box;padding:5px 6px;
  background:url('${IMG.paper}') center/cover,#efe5cf;border:1px solid rgba(110,90,60,.55);border-radius:28px;box-shadow:0 6px 18px rgba(30,20,10,.35);z-index:4}
.sh-modebar.in{animation:sh-up .26s var(--ease) both}
.sh-mth{--ic:44px;width:44px;height:44px;flex:none;display:grid;place-items:center;border-radius:50%;overflow:hidden;color:var(--ver);background:radial-gradient(circle at 50% 60%,#fffaf0,#e6dac0)}
.sh-mth img{width:100%;height:100%;object-fit:contain}
.sh-mth .sh-ic{width:24px;height:24px}
.sh-mtx{min-width:0;display:flex;flex-direction:column;line-height:1.25}
.sh-mtx b{font:400 17px var(--title-font,serif);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:9em}
.sh-mtx small{display:block;font-size:12px;color:var(--soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sh-mtx small i{display:inline-block;margin-right:4px;vertical-align:1px}
.sh-touch .sh-tbody.sheet .sh-tf{display:none}
.sh-touch .sh-tbody.sheet .sh-tlist{max-height:30%}
.sh-mtx small i{width:8px;height:8px;flex:none;border-radius:50%;background:var(--c)}
.sh-modebar .sh-btn{border-radius:20px;flex:none}
.sh-modebar .sh-step{flex:none}
/* 提示、战报挪到底部，不压顶上的首领条 / 目标条 */
.sh-touch .sh-toast{top:auto;bottom:calc(66px + var(--sb));transform:translate(-50%,10px)}
.sh-touch .sh-toast.show{transform:translate(-50%,0)}
.sh-touch .sh-feed{bottom:calc(110px + var(--sb));width:min(300px,calc(100vw - 24px))}
.sh-touch .sh-feed p:nth-last-child(n+4){display:none}
@media (max-aspect-ratio:1/1){.sh-touch .sh-toast{bottom:46%}.sh-touch .sh-feed{bottom:calc(46% + 44px)}}
@keyframes sh-up{from{opacity:0;transform:translate(-50%,12px)}to{opacity:1;transform:translate(-50%,0)}}
.sh-calm *,.sh-calm *::before,.sh-calm *::after{animation-duration:.01ms!important;transition-duration:.01ms!important}
@media (prefers-reduced-motion:reduce){.sh-root *,.sh-root *::before,.sh-root *::after{animation:none!important;transition:none!important}.sh-gcard{clip-path:none}}
`;
