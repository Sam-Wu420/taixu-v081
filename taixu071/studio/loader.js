(function () {
  var w = document.getElementById('wait');
  // 主 JS 延后注入：先让文档 load 事件立即完成（平台外层 iframe 才不会误判超时），
      // 再在首帧之后异步拉 4MB 的游戏包，加载过程由上面的启动页负责遮罩。
      var started = false;
      function start() {
        if (started) return; started = true;
        var s = document.createElement('script');
        s.src = '__MAIN__';
        s.async = true;
        s.onerror = function () {
          w.textContent = '载入不顺利，正在再试一次……';
          setTimeout(function () {
            var s2 = document.createElement('script');
            s2.src = '__MAIN__&retry=1';
            document.body.appendChild(s2);
          }, 1200);
        };
        document.body.appendChild(s);
      }
      if (document.readyState === 'complete') setTimeout(start, 40);
      else window.addEventListener('load', function () { setTimeout(start, 40); });
      setTimeout(start, 3000);
})();
