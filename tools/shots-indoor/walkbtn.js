// 点丹药铺卡上的「走过去」：面板关掉，地上指路
(async () => { const g = window.__game; const b = document.querySelector('[data-fac="pill"] .tf-walk'); if (!b) return 'no btn'; b.click(); await new Promise((r) => setTimeout(r, 600)); return { modal: g.modal?.kind, guide: g.guide?.name, gr: g.indoor.guideRoom?.id }; })()
