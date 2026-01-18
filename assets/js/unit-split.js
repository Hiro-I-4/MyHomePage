// assets/js/unit-split.js
document.addEventListener("DOMContentLoaded", () => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  
    const stages = document.querySelectorAll(".unit-stage[data-unit-split='on']");
    if (!stages.length) return;
  
    const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  
    function getRects(items){
      const m = new Map();
      items.forEach(el => m.set(el, el.getBoundingClientRect()));
      return m;
    }
  
    // FLIP: 位置変化を“自然な移動”として見せる
    function playFLIP(stage, items, doLayoutChange){
      const first = getRects(items);
  
      doLayoutChange(); // ここで order / class / DOM 並びを変える
  
      const last = getRects(items);
  
      items.forEach(el => {
        const a = first.get(el);
        const b = last.get(el);
        const dx = a.left - b.left;
        const dy = a.top - b.top;
        el.style.transform = `translate(${dx}px, ${dy}px)`;
      });
  
      // 強制 reflow
      stage.offsetHeight;
  
      stage.classList.add("is-splitting");
  
      // “分割感”をちょい足し（ランダムに散ってから戻る）
      items.forEach((el, i) => {
        const spread = 18;
        const rx = (Math.random() - 0.5) * spread;
        const ry = (Math.random() - 0.5) * spread;
        const rot = (Math.random() - 0.5) * 3;
  
        // まず一瞬だけ散る → すぐFLIPで戻す
        el.animate(
          [
            { transform: `${el.style.transform} translate(${rx}px, ${ry}px) rotate(${rot}deg)` },
            { transform: el.style.transform }
          ],
          { duration: 260, easing: "cubic-bezier(.22,1,.36,1)" }
        );
      });
  
      requestAnimationFrame(() => {
        items.forEach(el => (el.style.transform = "none"));
      });
  
      // 後始末
      const done = () => {
        stage.classList.remove("is-splitting");
        items.forEach(el => (el.style.transform = ""));
        stage.removeEventListener("transitionend", done);
      };
      // reduced-motionなら即終了
      if (prefersReduced) return done();
      stage.addEventListener("transitionend", done, { once: true });
    }
  
    stages.forEach(stage => {
      const items = [...stage.querySelectorAll(".unit")];
      if (items.length < 2) return;
  
      // サンプル：order を回す（1→2→3→…）
      const rotateOrder = () => {
        const orders = items.map(el => Number(el.style.order || 0));
        const max = Math.max(...orders, items.length - 1);
  
        items.forEach((el, i) => {
          const cur = Number(el.style.order || i);
          const next = (cur + 1) % (max + 1);
          el.style.order = String(next);
        });
      };
  
      // 初期 order をセット
      items.forEach((el, i) => (el.style.order = String(i)));
  
      stage.addEventListener("click", (e) => {
        // cardやunitをクリックしたときだけ反応
        if (!e.target.closest(".unit")) return;
  
        playFLIP(stage, items, rotateOrder);
      });
    });
  });