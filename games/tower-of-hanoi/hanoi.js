(function () {
  "use strict";

  const MIN_DISKS = 3;
  const MAX_DISKS = 8;
  const DEFAULT_DISKS = 4;

  const DISK_COLORS = [
    "#f87171", "#fb923c", "#fbbf24", "#a3e635",
    "#34d399", "#22d3ee", "#818cf8", "#e879f9",
  ];

  const diskCountSelect = document.getElementById("disk-count");
  const minMovesEl = document.getElementById("min-moves");
  const moveCountEl = document.getElementById("move-count");
  const restartBtn = document.getElementById("restart-btn");
  const statusLine = document.getElementById("status-line");
  const pegWrappers = Array.from(document.querySelectorAll(".peg-wrapper"));
  const pegEls = [
    document.getElementById("peg-0"),
    document.getElementById("peg-1"),
    document.getElementById("peg-2"),
  ];
  const victoryOverlay = document.getElementById("victory-overlay");
  const victoryMessage = document.getElementById("victory-message");
  const victoryAgainBtn = document.getElementById("victory-again-btn");

  let numDisks = DEFAULT_DISKS;
  let pegs = [[], [], []];
  let selectedPeg = null;
  let moveCount = 0;
  let won = false;

  function populateDiskSelect() {
    diskCountSelect.innerHTML = "";
    for (let n = MIN_DISKS; n <= MAX_DISKS; n++) {
      const opt = document.createElement("option");
      opt.value = String(n);
      opt.textContent = `${n} disks`;
      if (n === DEFAULT_DISKS) opt.selected = true;
      diskCountSelect.appendChild(opt);
    }
  }

  function minMovesFor(n) {
    return Math.pow(2, n) - 1;
  }

  function initGame(n) {
    numDisks = n;
    pegs = [[], [], []];
    for (let size = numDisks; size >= 1; size--) {
      pegs[0].push(size);
    }
    selectedPeg = null;
    moveCount = 0;
    won = false;
    victoryOverlay.hidden = true;
    minMovesEl.textContent = String(minMovesFor(numDisks));
    moveCountEl.textContent = "0";
    setStatus("Select a disk to begin.");
    render();
  }

  function setStatus(text) {
    statusLine.textContent = text;
  }

  function diskWidthPercent(size) {
    const minPct = 32;
    const maxPct = 96;
    const span = maxPct - minPct;
    const ratio = numDisks === 1 ? 1 : (size - 1) / (numDisks - 1);
    return minPct + ratio * span;
  }

  function render() {
    pegs.forEach((stack, pegIndex) => {
      const pegEl = pegEls[pegIndex];
      pegEl.querySelectorAll(".disk").forEach((d) => d.remove());

      stack.forEach((size, idxInStack) => {
        const disk = document.createElement("div");
        disk.className = "disk";
        disk.style.width = diskWidthPercent(size) + "%";
        disk.style.background = `linear-gradient(180deg, ${DISK_COLORS[(size - 1) % DISK_COLORS.length]}, ${DISK_COLORS[(size - 1) % DISK_COLORS.length]}cc)`;
        disk.textContent = String(size);
        disk.dataset.size = String(size);

        const isTop = idxInStack === stack.length - 1;
        if (isTop) {
          disk.classList.add("top-disk");
          disk.addEventListener("pointerdown", (e) => onDiskPointerDown(e, pegIndex));
          if (selectedPeg === pegIndex) {
            disk.classList.add("selected");
          }
        }

        pegEl.appendChild(disk);
      });
    });

    pegWrappers.forEach((wrapper) => {
      const idx = Number(wrapper.dataset.peg);
      wrapper.classList.toggle("selected", selectedPeg === idx);
    });
  }

  function pegLetter(i) {
    return ["A", "B", "C"][i];
  }

  function canPlace(pegIndex, size) {
    const stack = pegs[pegIndex];
    if (stack.length === 0) return true;
    return stack[stack.length - 1] > size;
  }

  function attemptMove(fromPeg, toPeg) {
    if (won) return;
    if (fromPeg === toPeg) {
      selectedPeg = null;
      render();
      return;
    }
    const stack = pegs[fromPeg];
    if (stack.length === 0) {
      setStatus(`Tower ${pegLetter(fromPeg)} is empty. Pick a tower with disks first.`);
      selectedPeg = null;
      render();
      return;
    }
    const movingSize = stack[stack.length - 1];
    if (!canPlace(toPeg, movingSize)) {
      setStatus(`Invalid move: disk ${movingSize} can't go on a smaller disk. Try again.`);
      selectedPeg = null;
      render();
      return;
    }

    stack.pop();
    pegs[toPeg].push(movingSize);
    moveCount++;
    moveCountEl.textContent = String(moveCount);
    selectedPeg = null;
    setStatus(`Moved disk ${movingSize} from ${pegLetter(fromPeg)} to ${pegLetter(toPeg)}.`);
    render();
    checkVictory();
  }

  function checkVictory() {
    if (pegs[2].length === numDisks) {
      won = true;
      const optimal = minMovesFor(numDisks);
      const extra = moveCount - optimal;
      victoryMessage.textContent = extra === 0
        ? `Perfect! You solved it in the minimum ${optimal} moves.`
        : `You solved it in ${moveCount} moves. The minimum possible was ${optimal} (${extra} extra move${extra === 1 ? "" : "s"}).`;
      victoryOverlay.hidden = false;
      setStatus("Puzzle solved! 🎉");
    }
  }

  function onPegActivate(pegIndex) {
    if (won) return;
    if (selectedPeg === null) {
      if (pegs[pegIndex].length === 0) {
        setStatus(`Tower ${pegLetter(pegIndex)} is empty. Choose a tower with disks.`);
        return;
      }
      selectedPeg = pegIndex;
      setStatus(`Selected disk ${pegs[pegIndex][pegs[pegIndex].length - 1]} on Tower ${pegLetter(pegIndex)}. Click a tower to move it there.`);
      render();
    } else {
      attemptMove(selectedPeg, pegIndex);
    }
  }

  let suppressNextClick = false;

  pegWrappers.forEach((wrapper) => {
    const idx = Number(wrapper.dataset.peg);
    wrapper.addEventListener("click", () => {
      if (suppressNextClick) {
        suppressNextClick = false;
        return;
      }
      onPegActivate(idx);
    });
    wrapper.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onPegActivate(idx);
      }
    });
  });

  // Pointer-based drag (works for mouse, touch and pen; also driveable by automated tests).
  const DRAG_THRESHOLD_PX = 6;
  let pointerDrag = null;

  function onDiskPointerDown(e, pegIndex) {
    if (won) return;
    if (e.button !== undefined && e.button !== 0) return;
    pointerDrag = {
      pegIndex,
      diskEl: e.currentTarget,
      startX: e.clientX,
      startY: e.clientY,
      dragging: false,
      ghost: null,
      offsetX: 0,
      offsetY: 0,
    };
    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", onWindowPointerUp, { once: true });
  }

  function startGhost(drag, e) {
    const rect = drag.diskEl.getBoundingClientRect();
    const ghost = drag.diskEl.cloneNode(true);
    ghost.classList.add("disk-ghost");
    ghost.style.position = "fixed";
    ghost.style.left = rect.left + "px";
    ghost.style.top = rect.top + "px";
    ghost.style.width = rect.width + "px";
    ghost.style.height = rect.height + "px";
    ghost.style.margin = "0";
    ghost.style.pointerEvents = "none";
    ghost.style.zIndex = "999";
    ghost.style.opacity = "0.85";
    document.body.appendChild(ghost);
    drag.ghost = ghost;
    drag.offsetX = e.clientX - rect.left;
    drag.offsetY = e.clientY - rect.top;
    drag.diskEl.style.visibility = "hidden";
  }

  function moveGhost(drag, e) {
    if (!drag.ghost) return;
    drag.ghost.style.left = e.clientX - drag.offsetX + "px";
    drag.ghost.style.top = e.clientY - drag.offsetY + "px";
  }

  function updateDropTargetHighlight(x, y) {
    pegWrappers.forEach((w) => w.classList.remove("drop-target"));
    const el = document.elementFromPoint(x, y);
    const wrapper = el && el.closest(".peg-wrapper");
    if (wrapper) wrapper.classList.add("drop-target");
  }

  function onWindowPointerMove(e) {
    if (!pointerDrag) return;
    const dx = e.clientX - pointerDrag.startX;
    const dy = e.clientY - pointerDrag.startY;
    if (!pointerDrag.dragging) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      pointerDrag.dragging = true;
      startGhost(pointerDrag, e);
    }
    moveGhost(pointerDrag, e);
    updateDropTargetHighlight(e.clientX, e.clientY);
  }

  function onWindowPointerUp(e) {
    window.removeEventListener("pointermove", onWindowPointerMove);
    if (!pointerDrag) return;
    const drag = pointerDrag;
    pointerDrag = null;
    pegWrappers.forEach((w) => w.classList.remove("drop-target"));

    if (!drag.dragging) return;

    if (drag.ghost) drag.ghost.remove();
    suppressNextClick = true;

    const el = document.elementFromPoint(e.clientX, e.clientY);
    const wrapper = el && el.closest(".peg-wrapper");
    if (wrapper) {
      attemptMove(drag.pegIndex, Number(wrapper.dataset.peg));
    } else {
      selectedPeg = null;
      render();
    }
  }

  diskCountSelect.addEventListener("change", () => {
    initGame(Number(diskCountSelect.value));
  });

  restartBtn.addEventListener("click", () => {
    initGame(numDisks);
  });

  victoryAgainBtn.addEventListener("click", () => {
    victoryOverlay.hidden = true;
    initGame(numDisks);
  });

  populateDiskSelect();
  initGame(DEFAULT_DISKS);
})();
