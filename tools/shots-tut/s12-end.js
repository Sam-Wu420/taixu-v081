(async () => { const g = window.__game; g.closeModal(true); g.tutorial.jump('end'); await new Promise(r => setTimeout(r, 1500)); return [g.tutorial.step, g.tutorial.getView()?.text]; })()
