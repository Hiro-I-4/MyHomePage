// assets/js/swap-cards.js
document.addEventListener("DOMContentLoaded", () => {
    const decks = document.querySelectorAll(".swap-deck");
    if (!decks.length) return;
  
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  
    /* =========================
       New mode: single-card rebuild (button-driven)
       ========================= */
    const initSingleDeck = (deck) => {
      if (!deck.classList.contains("swap-deck--single")) return false;
  
      const card = deck.querySelector(".swap-card");
      const btn = deck.querySelector(".swap-advance");
      const progressEl = deck.querySelector(".swap-progress");
      const templates = [...deck.querySelectorAll("template")];
  
      if (!card || !btn || templates.length === 0) return false;
  
      // sort by data-step if present
      const hasStep = templates.some(t => t.dataset && t.dataset.step != null);
      const ordered = hasStep
        ? templates.slice().sort((a, b) => (Number(a.dataset.step) || 0) - (Number(b.dataset.step) || 0))
        : templates;
  
      let index = Number(deck.dataset.swapIndex || 0);
      if (Number.isNaN(index) || index < 0) index = 0;
      index = index % ordered.length;
      deck.dataset.swapIndex = String(index);
  
      // prevent jump: lock min-height to max slide height
      const setMaxHeight = () => {
        const meas = document.createElement("div");
        meas.className = card.className; // "card swap-card"
        meas.style.position = "absolute";
        meas.style.left = "-99999px";
        meas.style.top = "0";
        meas.style.width = `${deck.clientWidth}px`;
        meas.style.pointerEvents = "none";
        meas.style.visibility = "hidden";
        document.body.appendChild(meas);
  
        let maxH = 0;
        for (const t of ordered) {
          meas.innerHTML = t.innerHTML;
          maxH = Math.max(maxH, meas.offsetHeight);
        }
        document.body.removeChild(meas);
  
        if (maxH > 0) deck.style.minHeight = `${maxH}px`;
      };
  
      const render = (i) => {
        card.innerHTML = ordered[i].innerHTML;
  
        const total = ordered.length;
        if (progressEl) progressEl.textContent = `${i + 1}/${total}`;
  
        deck.dataset.swapIndex = String(i);
        deck.dataset.swapTotal = String(total);
      };
  
      // init
      render(index);
      setMaxHeight();
  
      let resizeTimer = null;
      window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(setMaxHeight, 120);
      });
  
      const goNext = () => {
        if (deck.dataset.animating === "1") return;
  
        const to = (index + 1) % ordered.length;
  
        if (prefersReduced) {
          index = to;
          render(index);
          return;
        }
  
        deck.dataset.animating = "1";
  
        // leave
        card.classList.remove("is-entering");
        card.classList.add("is-leaving");
  
        const onLeaveEnd = () => {
          // swap content
          card.classList.remove("is-leaving");
          index = to;
          render(index);
  
          // enter
          card.classList.add("is-entering");
          requestAnimationFrame(() => {
            card.classList.remove("is-entering");
          });
  
          deck.dataset.animating = "0";
        };
  
        card.addEventListener("transitionend", onLeaveEnd, { once: true });
      };
  
      // button only
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        goNext();
      });
  
      // keyboard: Enter/Space on button
      btn.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          goNext();
        }
      });
  
      return true;
    };
  
    /* =========================
       Old mode: swap-item stack (keep your original behavior)
       ========================= */
    const setHeightsOld = (deck) => {
      const items = [...deck.querySelectorAll(".swap-item")];
      if (!items.length) return;
  
      const prev = items.map((el) => ({
        el,
        position: el.style.position,
        opacity: el.style.opacity,
        transform: el.style.transform,
        pointerEvents: el.style.pointerEvents,
        display: el.style.display,
      }));
  
      items.forEach((el) => {
        el.style.position = "relative";
        el.style.opacity = "1";
        el.style.transform = "none";
        el.style.pointerEvents = "none";
        el.style.display = "block";
      });
  
      const maxH = Math.max(...items.map((el) => el.offsetHeight));
      deck.style.minHeight = `${maxH}px`;
  
      prev.forEach((s) => {
        s.el.style.position = s.position;
        s.el.style.opacity = s.opacity;
        s.el.style.transform = s.transform;
        s.el.style.pointerEvents = s.pointerEvents;
        s.el.style.display = s.display;
      });
    };
  
    const initOldDeck = (deck) => {
      const items = [...deck.querySelectorAll(".swap-item")];
      if (!items.length) return;
  
      let index = Number(deck.dataset.swapIndex || 0);
      if (Number.isNaN(index) || index < 0) index = 0;
      index = index % items.length;
      deck.dataset.swapIndex = String(index);
  
      items.forEach((el, i) => {
        el.classList.toggle("is-active", i === index);
        el.setAttribute("aria-hidden", i === index ? "false" : "true");
        el.setAttribute("tabindex", i === index ? "0" : "-1");
      });
  
      setHeightsOld(deck);
      window.addEventListener("resize", () => setHeightsOld(deck));
  
      const goNext = () => {
        if (deck.dataset.animating === "1") return;
  
        if (prefersReduced) {
          deck.dataset.swapIndex = String((index + 1) % items.length);
          index = Number(deck.dataset.swapIndex);
          items.forEach((el, i) => {
            el.classList.toggle("is-active", i === index);
            el.setAttribute("aria-hidden", i === index ? "false" : "true");
            el.setAttribute("tabindex", i === index ? "0" : "-1");
          });
          return;
        }
  
        deck.dataset.animating = "1";
        const from = index;
        const to = (index + 1) % items.length;
  
        const current = items[from];
        const next = items[to];
  
        next.classList.remove("is-leaving");
        next.classList.add("is-entering");
        next.classList.add("is-active");
        next.setAttribute("aria-hidden", "false");
        next.setAttribute("tabindex", "0");
  
        requestAnimationFrame(() => {
          current.classList.add("is-leaving");
          next.classList.remove("is-entering");
        });
  
        const cleanup = () => {
          current.classList.remove("is-active", "is-leaving");
          current.setAttribute("aria-hidden", "true");
          current.setAttribute("tabindex", "-1");
  
          deck.dataset.swapIndex = String(to);
          index = to;
  
          deck.dataset.animating = "0";
        };
  
        current.addEventListener("transitionend", cleanup, { once: true });
      };
  
      deck.addEventListener("click", (e) => {
        const targetItem = e.target.closest(".swap-item");
        if (!targetItem) return;
        goNext();
      });
  
      deck.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") {
          e.preventDefault();
          goNext();
        }
      });
    };
  
    decks.forEach((deck) => {
      if (deck.classList.contains("swap-deck--single")) {
        const ok = initSingleDeck(deck);
        if (ok) return;
      }
      initOldDeck(deck);
    });
  });