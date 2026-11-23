(async () => { const g = window.__game; g.toggleFly(); await new Promise(r => setTimeout(r, 1600)); return [g.tutorial.step, g.tutorial.getView()?.text, g.player.zTarget]; })()
