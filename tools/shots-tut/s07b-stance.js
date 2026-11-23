(async () => { const g = window.__game; g.combat.brawl.toggleStance(); await new Promise(r => setTimeout(r, 1200)); return [g.tutorial.step, g.tutorial.getView()?.text]; })()
