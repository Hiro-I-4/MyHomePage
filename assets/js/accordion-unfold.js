document.addEventListener("DOMContentLoaded", () => {
  const stages = document.querySelectorAll(".accordion-stage");
  if (!stages.length) return;

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) {
    stages.forEach(s => s.style.setProperty("--acc", "1"));
    return;
  }

  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  // “どの範囲のスクロールで開くか”
  // start: ステージ上端が画面下に入ったあたり
  // end:   ステージ中央が画面中央を少し越えたあたり
  const computeProgress = (el) => {
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight || 1;

    const start = vh * 0.92; // ここで 0
    const end   = vh * 0.28; // ここで 1（小さいほど早く全開）

    // r.top が start→end へ動くほど進む
    const t = (start - r.top) / (start - end);
    return clamp01(t);
  };

  let ticking = false;
  const update = () => {
    ticking = false;
    stages.forEach((stage) => {
      const p = computeProgress(stage);
      stage.style.setProperty("--acc", String(p));

      // 折り目の強調・光スイープ（任意）
      // pが動いてる間だけ “is-unfolding” を付ける（簡易版）
      if (p > 0 && p < 1) stage.classList.add("is-unfolding");
      else stage.classList.remove("is-unfolding");
    });
  };

  const requestUpdate = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);
  requestUpdate(); // 初回
});