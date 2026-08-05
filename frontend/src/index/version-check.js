// index.html（应用外壳/app shell）—— 版本检测/热更新提示子系统
// （拆分自 static/index.html 最后一个独立的内联 <script> 块）。
//
// 范围：定期轮询 `/api/version`（每 5 分钟一次），跟页面加载时记录的
// 初始版本号比较——如果只是补丁版本号变化（c 段），展示一个非强制的
// "检测到新版本，建议刷新"提示条（可以手动关闭）；如果是主版本/次版本
// 变化（a/b 段，代表不兼容更新），展示一个无法手动关闭的强制刷新弹窗
// （毛玻璃背景，只有一个"刷新"按钮）。parseSemver 是纯函数，解析
// `x.y.z` 格式的语义化版本号。
//
// 本来就是一个完全独立、自包含的 IIFE（`(function(){...})()`），跟
// index.html 内联脚本的主体部分（switchUI/侧边栏导航等）没有任何
// 函数级依赖，只共享 DOM（`versionToast`/`versionForceOverlay` 两个
// 元素 id）——是这次会话里跟主体代码耦合度最低的一块，物理搬移风险
// 几乎为零。
//
// 经典 <script>，非 ES module，原因同 help-feedback.js。这个模块本身
// 不需要暴露任何函数给外部（`checkVersion()`/`setInterval` 在 IIFE
// 内部直接调用），所以对 window 全局作用域没有任何新增。
//
// 依赖：无。只用到 fetch/DOM/setInterval，不依赖 main.js 或本次拆分的
// 任何其它模块。

    (function(){
        var initial;

        // 解析 a.b.c 语义化版本号；解析失败返回 null。
        function parseSemver(v){
            var m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v || '').trim());
            if(!m) return null;
            return { major: parseInt(m[1],10), minor: parseInt(m[2],10), patch: parseInt(m[3],10) };
        }

        function showForceUpdateOverlay(){
            document.getElementById('versionToast').style.display = 'none';
            document.getElementById('versionForceOverlay').style.display = 'flex';
        }

        async function checkVersion(){
            try{
                var res = await fetch('/api/version?' + Date.now());
                if(!res.ok) return;
                var v = (await res.text()).trim();
                if(!v) return;
                if(!initial){ initial = v; return; }
                if(v === initial) return;

                var oldSemver = parseSemver(initial);
                var newSemver = parseSemver(v);
                if(oldSemver && newSemver && (oldSemver.major !== newSemver.major || oldSemver.minor !== newSemver.minor)){
                    // a 或 b 段变化：不兼容更新，强制弹窗，无法手动关闭。
                    showForceUpdateOverlay();
                } else {
                    // 仅 c 段变化（或版本号无法解析时兜底为热更新）：维持现有非强制提示。
                    document.getElementById('versionToast').style.display = 'flex';
                }
            }catch(e){}
        }
        checkVersion();
        setInterval(checkVersion, 5 * 60 * 1000);
    })();
