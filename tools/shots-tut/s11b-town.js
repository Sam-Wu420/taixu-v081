(async () => { const g = window.__game; g.enterTown(); await new Promise(r => setTimeout(r, 1400)); return [g.tutorial.step, g.tutorial.getView()?.text, g.modal && g.modal.kind]; })()
