// assets/js/timeline-origami.js
document.addEventListener("DOMContentLoaded", () => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  
    const root = document.querySelector(".origami-timeline");
    if (!root) return;
  
    const card = root.querySelector(".origami-card");
    const contentHost = root.querySelector(".origami-content");
    const pieces = [...root.querySelectorAll(".origami-piece")];
    const templates = [...root.querySelectorAll("template[data-year]")];
  
    if (!card || !contentHost || pieces.length === 0 || templates.length === 0) return;
  
    const years = templates.map(t => t.dataset.year);
    const getTemplate = (year) => templates.find(t => t.dataset.year === year);
  
    const setContentByIndex = (idx) => {
      const year = years[idx % years.length];
      const tpl = getTemplate(year);
      if (!tpl) return;
      contentHost.replaceChildren(tpl.content.cloneNode(true));
      card.setAttribute("aria-label", `Timeline card: Year ${year}. Click to continue.`);
    };
  
    let index = Number(root.dataset.index || 0);
    if (Number.isNaN(index)) index = 0;
    index = ((index % years.length) + years.length) % years.length;
    root.dataset.index = String(index);
  
    // initial content
    setContentByIndex(index);
  
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  
    // Piece motion presets (6 strips)
    // 0%: none
    // 45%: split outward
    // 70%: rearrange (swap-ish)
    // 100%: regroup
    const split = [
      { x: -34, y: -14, r: -3.5 },
      { x: -16, y: -22, r: -2.0 },
      { x:  10, y: -26, r:  1.2 },
      { x:  22, y: -18, r:  2.4 },
      { x:  26, y:  -4, r:  3.2 },
      { x:  18, y:  10, r:  2.0 },
    ];
  
    // Rearrange: give “pieces re-ordered” feeling before regroup
    const rearrange = [
      { x:  18, y: -6,  r:  2.4 },
      { x:  28, y: -2,  r:  3.0 },
      { x:  10, y:  6,  r:  1.2 },
      { x: -10, y:  8,  r: -1.2 },
      { x: -26, y:  2,  r: -3.0 },
      { x: -18, y: -4,  r: -2.4 },
    ];
  
    const play = async () => {
      if (root.dataset.animating === "1") return;
      root.dataset.animating = "1";
      card.classList.add("is-animating");
  
      const nextIndex = (index + 1) % years.length;
  
      // Reduced motion: instant swap
      if (prefersReduced) {
        index = nextIndex;
        root.dataset.index = String(index);
        setContentByIndex(index);
        card.classList.remove("is-animating");
        root.dataset.animating = "0";
        return;
      }
  
      // Animate pieces (overlay) and content
      const duration = 920;
      const easing = "cubic-bezier(.22,1,.36,1)";
  
      // 1) Fade out content while pieces split
      const contentAnim = contentHost.animate(
        [
          { opacity: 1, filter: "blur(0px)", transform: "translateY(0px)" },
          { opacity: 0, filter: "blur(3px)", transform: "translateY(6px)" },
          { opacity: 0, filter: "blur(3px)", transform: "translateY(6px)" },
          { opacity: 1, filter: "blur(0px)", transform: "translateY(0px)" },
        ],
        { duration, easing, fill: "forwards" }
      );
  
      // 2) Pieces do split → rearrange → regroup
      const pieceAnims = pieces.map((p, i) => {
        const a = split[i] || split[split.length - 1];
        const b = rearrange[i] || rearrange[rearrange.length - 1];
  
        return p.animate(
          [
            { transform: "translate(0px,0px) rotate(0deg)", opacity: 0 },
            { transform: `translate(${a.x}px, ${a.y}px) rotate(${a.r}deg)`, opacity: 1, offset: 0.45 },
            { transform: `translate(${b.x}px, ${b.y}px) rotate(${b.r}deg)`, opacity: 1, offset: 0.70 },
            { transform: "translate(0px,0px) rotate(0deg)", opacity: 0 },
          ],
          { duration, easing, fill: "forwards" }
        );
      });
  
      // swap content near the peak (around 55%)
      const swapAt = clamp(Math.floor(duration * 0.55), 250, duration - 250);
      await new Promise((res) => setTimeout(res, swapAt));
  
      index = nextIndex;
      root.dataset.index = String(index);
      setContentByIndex(index);
  
      // wait for animations to finish
      await Promise.allSettled([contentAnim.finished, ...pieceAnims.map(a => a.finished)]);
  
      // cleanup
      card.classList.remove("is-animating");
      root.dataset.animating = "0";
    };
  
    card.addEventListener("click", play);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") {
        e.preventDefault();
        play();
      }
    });
  });