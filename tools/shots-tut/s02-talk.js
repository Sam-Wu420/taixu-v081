(async () => { const g = window.__game; g.closeModal(true); g.tutorial.jump('talk'); await new Promise(r => setTimeout(r, 1200)); return [g.tutorial.step, g.tutorial.getView()?.text]; })()
