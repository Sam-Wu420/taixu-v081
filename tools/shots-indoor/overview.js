// 城门口 / 地点卡上点「进入」的老路：打开设施总览面板（人在城里，能进的设施卡上有「走过去」）
(async () => { const g = window.__game; g.closeModal(true); g.enterTown(); await new Promise((r) => setTimeout(r, 900)); return { modal: g.modal?.kind, walks: document.querySelectorAll('.tf-walk').length }; })()
