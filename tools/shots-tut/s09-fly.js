(async () => { const g = window.__game; g.tutorial.jump('fly'); await new Promise(r => setTimeout(r, 1000)); return [g.tutorial.step, g.tutorial.getView()?.text]; })()
