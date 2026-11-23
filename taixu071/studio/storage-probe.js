/* 存档兜底：创空间是把应用嵌在 iframe 里的，部分浏览器（Safari / 无痕模式）
       会禁掉第三方 localStorage，导致游戏一进就存不了档。这里探一下，不可用就
       先用内存顶上，并借第一次点击申请存储权限，成功后自动重载。 */
    (function () {
      var usable = true;
      try { localStorage.setItem('__probe', '1'); localStorage.removeItem('__probe'); }
      catch (e) { usable = false; }
      if (usable) return;
      var mem = Object.create(null);
      try {
        Object.defineProperty(window, 'localStorage', {
          configurable: true,
          value: {
            getItem: function (k) { return k in mem ? mem[k] : null; },
            setItem: function (k, v) { mem[k] = String(v); },
            removeItem: function (k) { delete mem[k]; },
            clear: function () { mem = Object.create(null); },
            key: function (i) { return Object.keys(mem)[i] || null; },
            get length() { return Object.keys(mem).length; }
          }
        });
      } catch (e) {}
      var bump = function () {
        try {
          if (document.requestStorageAccess) {
            document.requestStorageAccess().then(function () {
              try { localStorage.setItem('__probe', '1'); localStorage.removeItem('__probe'); location.reload(); } catch (e) {}
            }).catch(function () {});
          }
        } catch (e) {}
      };
      window.addEventListener('pointerdown', bump, { once: true });
    })();
