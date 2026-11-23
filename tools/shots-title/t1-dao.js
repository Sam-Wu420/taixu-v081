(async () => { [...document.querySelectorAll('.title-menu .menu-btn')].find(b => b.textContent.includes('踏入'))?.click(); await new Promise(r => setTimeout(r, 1300)); return 'dao'; })()
