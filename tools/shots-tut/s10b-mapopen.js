(async () => { const g = window.__game; g.onOpenMap(); await new Promise(r => setTimeout(r, 1800)); return [g.tutorial.step, g.tutorial.getView()?.text]; })()
