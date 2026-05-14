// Eurorack Module Designer
// Coordinates are in mm. SVG viewBox is in mm. Y goes down.

const HP = 5.08;
const PANEL_H = 128.5;       // 3U panel height (mm)
const PANEL_PAD = 8;         // svg margin around panel (mm)
const RAIL_INSET_Y = 3.0;    // mounting hole offset from top/bottom edges (mm)
const HOLE_X_INSET = 7.5;    // mounting hole offset from left/right edges (mm)
const RAIL_KEEPOUT_H = 9.25; // depth of rail no-PCB zone at top and bottom (mm); leaves 110mm usable between rails
const MM_PER_IN = 25.4;
const SNAP_IN = 0.05;        // snap step in inches
const SVG_NS = 'http://www.w3.org/2000/svg';

const mmToIn = (mm) => mm / MM_PER_IN;
const inToMm = (i) => i * MM_PER_IN;

// ---------- Default embedded library (kept in sync with elements.json so the file works without a server) ----------
const DEFAULT_LIBRARY = {
  version: 1,
  name: "Project Library",
  elements: [
    { id: "pot-small", name: "Small Pot", category: "Pots",
      panel:       [{ type: "circle", cx: 0, cy: 0, r: 3.0 }],
      decorations: [{ type: "rect", x: -0.3, y: -2.7, w: 0.6, h: 2.4, rotation: 223 }],
      keepout:     [{ type: "rect", x: -6.5, y: -5.4, w: 13, h: 14 }] },
    { id: "pot-cg-selco", name: "CG Selco Pot (0.6\")", category: "Pots",
      panel:       [{ type: "circle", cx: 0, cy: 0, r: 7.62 }],
      decorations: [{ type: "rect", x: -0.3, y: -7.0, w: 0.6, h: 6.4, rotation: 223 }],
      keepout:     [{ type: "rect", x: -6.5, y: -5.4, w: 13, h: 14 }] },
    { id: "pot-big", name: "Big Pot (0.75\")", category: "Pots",
      panel:       [{ type: "circle", cx: 0, cy: 0, r: 9.525 }],
      decorations: [{ type: "rect", x: -0.3, y: -9.0, w: 0.6, h: 8.2, rotation: 223 }],
      keepout:     [{ type: "rect", x: -6.5, y: -5.4, w: 13, h: 14 }] },
    { id: "slider-30mm", name: "30mm Slider", category: "Sliders",
      panel:       [{ type: "rect", x: -0.889, y: -15, w: 1.778, h: 30 }],
      keepout:     [{ type: "rect", x: -5.7, y: -22.9, w: 11.4, h: 45.8 }] },
    { id: "button-cg-wood", name: "CG Wood Button (0.45\")", category: "Buttons",
      panel:       [{ type: "circle", cx: 0, cy: 0, r: 5.715 }],
      keepout:     [{ type: "rect", x: -3, y: -4, w: 6, h: 8 }] },
    { id: "button-small", name: "Small Button", category: "Buttons",
      panel:       [{ type: "circle", cx: 0, cy: 0, r: 2.5 }],
      keepout:     [{ type: "rect", x: -5.8, y: -3.1, w: 11.6, h: 6.2 }] },
    { id: "led-rgb-4mm", name: "RGB LED (4mm)", category: "LEDs",
      panel:       [{ type: "circle", cx: 0, cy: 0, r: 2.0 }],
      decorations: [{ type: "circle", cx: 0, cy: 0, r: 1.3, fill: "url(#led-rgb)" }],
      keepout:     [{ type: "rect", x: -3.4, y: -2.45, w: 6.8, h: 4.9 }] },
    { id: "jack-thonkiconn", name: "Thonkiconn 3.5mm Jack", category: "Jacks",
      panel:       [{ type: "circle", cx: 0, cy: 0, r: 2.5 }],
      decorations: [
        { type: "circle", cx: 0, cy: 0, r: 1.6, fill: "#999" },
        { type: "circle", cx: 0, cy: 0, r: 0.75, fill: "#000" }
      ],
      keepout:     [{ type: "rect", x: -4.6, y: -6, w: 9.2, h: 12.7 }] }
  ]
};

// ---------- State ----------
const state = {
  library: DEFAULT_LIBRARY,
  panel: { hp: 12 },
  instances: [],                // { id, libraryId, x, y, rot }
  selectedIds: new Set(),
  nextId: 1,
  showKeepouts: true,
  showGrid: true,
  snapGrid: true,
  badInstances: new Set(),
  drag: null,                   // { kind:'palette'|'instance', libraryId?, instId?, dx?, dy?, ghost? }
};

// ---------- DOM refs ----------
const svg = document.getElementById('canvas');
const paletteItems = document.getElementById('palette-items');
const inspectorContent = document.getElementById('inspector-content');
const mousePosEl = document.getElementById('mouse-pos');
const hpInput = document.getElementById('hp-width');
const showKeepoutsCb = document.getElementById('show-keepouts');
const showGridCb = document.getElementById('show-grid');
const snapGridCb = document.getElementById('snap-grid');
const fileInput = document.getElementById('file-input');

// ---------- Utilities ----------
function panelWidth() { return state.panel.hp * HP; }
function panelViewBox() {
  const w = panelWidth() + PANEL_PAD * 2;
  const h = PANEL_H + PANEL_PAD * 2;
  return `${-PANEL_PAD} ${-PANEL_PAD} ${w} ${h}`;
}
function findLibElement(libId) { return state.library.elements.find(e => e.id === libId); }
function maybeSnap(vMm) {
  if (!state.snapGrid) return vMm;
  const stepMm = SNAP_IN * MM_PER_IN;          // 0.05" = 1.27mm
  return Math.round(vMm / stepMm) * stepMm;
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function mouseToSvg(evt) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX; pt.y = evt.clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) {
    if (attrs[k] !== undefined && attrs[k] !== null) node.setAttribute(k, attrs[k]);
  }
  for (const c of children) if (c) node.appendChild(c);
  return node;
}

// ---------- Rendering ----------
function render() {
  svg.setAttribute('viewBox', panelViewBox());
  svg.innerHTML = '';
  svg.appendChild(makeDefs());

  // Background-grid (optional, drawn outside panel area only for context)
  // Panel rect
  const panelW = panelWidth();
  svg.appendChild(el('rect', {
    class: 'panel-rect',
    x: 0, y: 0, width: panelW, height: PANEL_H, rx: 0.5
  }));

  // Optional grid inside panel: 0.05" minor + 0.1" major lines, both axes
  if (state.showGrid) {
    const grid = el('g');
    const minor = inToMm(0.05);
    const major = inToMm(0.1);
    // vertical
    for (let x = 0; x <= panelW + 1e-6; x += minor) {
      const isMajor = Math.abs((x / major) - Math.round(x / major)) < 1e-3;
      grid.appendChild(el('line', { class: 'grid-line' + (isMajor ? ' major' : ''), x1: x, y1: 0, x2: x, y2: PANEL_H }));
    }
    // horizontal
    for (let y = 0; y <= PANEL_H + 1e-6; y += minor) {
      const isMajor = Math.abs((y / major) - Math.round(y / major)) < 1e-3;
      grid.appendChild(el('line', { class: 'grid-line' + (isMajor ? ' major' : ''), x1: 0, y1: y, x2: panelW, y2: y }));
    }
    svg.appendChild(grid);
  }

  // Rail keepout bands (top + bottom) — PCB can't extend into these
  const topRail = el('rect', { class: 'rail-keepout', x: 0, y: 0, width: panelW, height: RAIL_KEEPOUT_H });
  const botRail = el('rect', { class: 'rail-keepout', x: 0, y: PANEL_H - RAIL_KEEPOUT_H, width: panelW, height: RAIL_KEEPOUT_H });
  svg.appendChild(topRail);
  svg.appendChild(botRail);

  // Mounting holes (only if panel wide enough)
  if (panelW >= 2 * HOLE_X_INSET + 2) {
    const holes = [
      [HOLE_X_INSET, RAIL_INSET_Y],
      [panelW - HOLE_X_INSET, RAIL_INSET_Y],
      [HOLE_X_INSET, PANEL_H - RAIL_INSET_Y],
      [panelW - HOLE_X_INSET, PANEL_H - RAIL_INSET_Y],
    ];
    for (const [hx, hy] of holes) {
      svg.appendChild(el('circle', { class: 'mount-hole', cx: hx, cy: hy, r: 1.6 }));
    }
  }

  // Elements
  for (const inst of state.instances) {
    svg.appendChild(renderInstance(inst));
  }

  updateMouseStatus();
}

function renderInstance(inst) {
  const lib = findLibElement(inst.libraryId);
  if (!lib) return el('g');
  const g = el('g', {
    class: 'elem-group' + (state.selectedIds.has(inst.id) ? ' selected' : ''),
    transform: `translate(${inst.x.toFixed(3)} ${inst.y.toFixed(3)}) rotate(${inst.rot})`,
    'data-inst-id': inst.id
  });

  // Panel shapes
  for (const s of lib.panel) g.appendChild(shapeNode(s, 'elem-panel'));
  // Decoration shapes (visual details)
  if (lib.decorations) for (const s of lib.decorations) g.appendChild(shapeNode(s, 'elem-deco'));
  // Keepout shapes
  if (state.showKeepouts) {
    const bad = state.badInstances.has(inst.id);
    for (const s of lib.keepout) g.appendChild(shapeNode(s, 'elem-keepout' + (bad ? ' bad' : '')));
  }

  g.addEventListener('pointerdown', onInstancePointerDown);
  return g;
}

function shapeNode(s, cls) {
  let node;
  if (s.type === 'circle') {
    node = el('circle', { class: cls, cx: s.cx, cy: s.cy, r: s.r });
  } else if (s.type === 'rect') {
    node = el('rect', { class: cls, x: s.x, y: s.y, width: s.w, height: s.h });
  } else {
    return el('g');
  }
  if (s.fill !== undefined) node.setAttribute('fill', s.fill);
  if (s.stroke !== undefined) node.setAttribute('stroke', s.stroke);
  if (s.strokeWidth !== undefined) node.setAttribute('stroke-width', s.strokeWidth);
  if (s.rotation !== undefined && s.rotation !== 0) {
    const wrap = el('g', { transform: `rotate(${s.rotation})` });
    wrap.appendChild(node);
    return wrap;
  }
  return node;
}

function makeDefs() {
  const defs = el('defs');
  // RGB LED gradient (used by LED decorations via fill="url(#led-rgb)")
  const grad = el('linearGradient', { id: 'led-rgb', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
  grad.appendChild(el('stop', { offset: '0%',   'stop-color': '#ff5566' }));
  grad.appendChild(el('stop', { offset: '50%',  'stop-color': '#55ff77' }));
  grad.appendChild(el('stop', { offset: '100%', 'stop-color': '#5577ff' }));
  defs.appendChild(grad);
  return defs;
}

function renderPalette() {
  paletteItems.innerHTML = '';
  // Group by category
  const groups = {};
  for (const e of state.library.elements) {
    const c = e.category || 'Other';
    (groups[c] = groups[c] || []).push(e);
  }
  for (const cat of Object.keys(groups)) {
    const wrap = document.createElement('div');
    wrap.className = 'palette-group';
    const title = document.createElement('div');
    title.className = 'palette-group-title';
    title.textContent = cat;
    wrap.appendChild(title);
    for (const lib of groups[cat]) {
      wrap.appendChild(renderPaletteItem(lib));
    }
    paletteItems.appendChild(wrap);
  }
}

function renderPaletteItem(lib) {
  const div = document.createElement('div');
  div.className = 'palette-item';
  div.dataset.libId = lib.id;

  // Thumbnail SVG
  const bbox = libBBox(lib);
  const pad = 1;
  const vbW = (bbox.w + pad * 2);
  const vbH = (bbox.h + pad * 2);
  const thumb = document.createElementNS(SVG_NS, 'svg');
  thumb.setAttribute('width', 32);
  thumb.setAttribute('height', 32);
  thumb.setAttribute('viewBox', `${bbox.x - pad} ${bbox.y - pad} ${vbW} ${vbH}`);
  thumb.appendChild(makeDefs());
  for (const s of lib.panel) thumb.appendChild(shapeNode(s, 'elem-panel'));
  if (lib.decorations) for (const s of lib.decorations) thumb.appendChild(shapeNode(s, 'elem-deco'));
  for (const s of lib.keepout) thumb.appendChild(shapeNode(s, 'elem-keepout'));
  div.appendChild(thumb);

  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = lib.name;
  div.appendChild(name);

  div.addEventListener('pointerdown', (e) => startPaletteDrag(e, lib.id));
  return div;
}

function libBBox(lib) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const all = [...lib.panel, ...lib.keepout];
  for (const s of all) {
    if (s.type === 'circle') {
      minX = Math.min(minX, s.cx - s.r); minY = Math.min(minY, s.cy - s.r);
      maxX = Math.max(maxX, s.cx + s.r); maxY = Math.max(maxY, s.cy + s.r);
    } else if (s.type === 'rect') {
      minX = Math.min(minX, s.x); minY = Math.min(minY, s.y);
      maxX = Math.max(maxX, s.x + s.w); maxY = Math.max(maxY, s.y + s.h);
    }
  }
  if (!isFinite(minX)) { minX = -1; minY = -1; maxX = 1; maxY = 1; }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function renderInspector() {
  if (state.selectedIds.size === 0) {
    inspectorContent.innerHTML = `
      <p class="muted">No element selected.</p>
      <p class="muted small">Click an element to edit. Drag in empty space to box-select.<br>R to rotate · Del to remove · Arrows to nudge.</p>
    `;
    return;
  }
  if (state.selectedIds.size > 1) {
    inspectorContent.innerHTML = `
      <p class="muted">${state.selectedIds.size} elements selected.</p>
      <p class="muted small">Drag to move all. Del to remove. Shift+click to toggle.<br>Click empty area to deselect.</p>
    `;
    return;
  }
  const onlyId = [...state.selectedIds][0];
  const inst = state.instances.find(i => i.id === onlyId);
  if (!inst) { inspectorContent.innerHTML = '<p class="muted">No element selected.</p>'; return; }
  const lib = findLibElement(inst.libraryId);
  inspectorContent.innerHTML = '';
  const name = document.createElement('div');
  name.className = 'inspector-name';
  name.textContent = lib ? lib.name : inst.libraryId;
  inspectorContent.appendChild(name);

  inspectorContent.appendChild(makeField('X (in)', mmToIn(inst.x).toFixed(3), v => { inst.x = inToMm(parseFloat(v) || 0); afterChange(); }));
  inspectorContent.appendChild(makeField('Y (in)', mmToIn(inst.y).toFixed(3), v => { inst.y = inToMm(parseFloat(v) || 0); afterChange(); }));
  inspectorContent.appendChild(makeField('Rotation', inst.rot, v => { inst.rot = (parseFloat(v) || 0) % 360; afterChange(); }));

  const actions = document.createElement('div');
  actions.className = 'inspector-actions';
  const rotBtn = document.createElement('button');
  rotBtn.textContent = 'Rotate 90°';
  rotBtn.onclick = () => { inst.rot = (inst.rot + 90) % 360; afterChange(); };
  const delBtn = document.createElement('button');
  delBtn.className = 'danger';
  delBtn.textContent = 'Delete';
  delBtn.onclick = () => { deleteInstance(inst.id); };
  actions.append(rotBtn, delBtn);
  inspectorContent.appendChild(actions);
}

function makeField(label, value, onChange) {
  const f = document.createElement('div');
  f.className = 'field';
  const l = document.createElement('label');
  l.textContent = label;
  const inp = document.createElement('input');
  inp.value = value;
  inp.addEventListener('change', () => onChange(inp.value));
  f.append(l, inp);
  return f;
}

function afterChange() {
  recomputeCollisions();
  render();
  renderInspector();
}

// ---------- Selection / deletion / nudging ----------
function selectInstance(id) {
  state.selectedIds = new Set([id]);
  render();
  renderInspector();
}
function deleteInstance(id) {
  state.instances = state.instances.filter(i => i.id !== id);
  state.selectedIds.delete(id);
  afterChange();
}

// World-space AABB of an instance's panel shapes (falls back to keepout for PCB-only parts).
function instanceBBox(inst) {
  const lib = findLibElement(inst.libraryId);
  if (!lib) return null;
  const shapes = (lib.panel && lib.panel.length) ? lib.panel : lib.keepout;
  if (!shapes || !shapes.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of shapes) {
    let pts;
    if (s.type === 'circle') {
      const c = xform(inst, s.cx, s.cy);
      pts = [{x: c.x - s.r, y: c.y - s.r}, {x: c.x + s.r, y: c.y + s.r}];
    } else if (s.type === 'rect') {
      pts = [
        xform(inst, s.x, s.y),
        xform(inst, s.x + s.w, s.y),
        xform(inst, s.x + s.w, s.y + s.h),
        xform(inst, s.x, s.y + s.h),
      ];
    } else continue;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
function rectsOverlap(a, b) {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}
function instancesInRect(x, y, w, h) {
  const rect = { x, y, w, h };
  const out = [];
  for (const inst of state.instances) {
    const b = instanceBBox(inst);
    if (b && rectsOverlap(rect, b)) out.push(inst.id);
  }
  return out;
}

// ---------- Drag from palette ----------
function startPaletteDrag(evt, libId) {
  evt.preventDefault();
  const ghost = makeGhost(libId);
  svg.appendChild(ghost);
  state.drag = { kind: 'palette', libraryId: libId, ghost };
  window.addEventListener('pointermove', onWindowPointerMove);
  window.addEventListener('pointerup', onWindowPointerUp, { once: true });
  // Set initial ghost position
  onWindowPointerMove(evt);
}
function makeGhost(libId) {
  const lib = findLibElement(libId);
  const g = el('g', { class: 'ghost elem-group', transform: 'translate(0,0)' });
  for (const s of lib.panel) g.appendChild(shapeNode(s, 'elem-panel'));
  for (const s of lib.keepout) g.appendChild(shapeNode(s, 'elem-keepout'));
  return g;
}

// ---------- Drag instance on canvas ----------
function onInstancePointerDown(evt) {
  // Find target inst id by walking up
  let n = evt.target;
  while (n && !n.dataset?.instId) n = n.parentNode;
  if (!n) return;
  const id = parseInt(n.dataset.instId, 10);
  evt.preventDefault();
  evt.stopPropagation();

  const inst = state.instances.find(i => i.id === id);
  if (!inst) return;

  if (evt.shiftKey) {
    // Toggle membership; no drag
    if (state.selectedIds.has(id)) state.selectedIds.delete(id);
    else state.selectedIds.add(id);
    render();
    renderInspector();
    return;
  }

  // If not already in selection, replace selection with just this one
  if (!state.selectedIds.has(id)) state.selectedIds = new Set([id]);

  const m = mouseToSvg(evt);
  const origs = [];
  for (const sid of state.selectedIds) {
    const si = state.instances.find(i => i.id === sid);
    if (si) origs.push({ id: sid, ox: si.x, oy: si.y });
  }
  state.drag = { kind: 'instance', start: m, origs };
  svg.setPointerCapture?.(evt.pointerId);
  window.addEventListener('pointermove', onWindowPointerMove);
  window.addEventListener('pointerup', onWindowPointerUp, { once: true });
  render();
  renderInspector();
}

function onWindowPointerMove(evt) {
  const m = mouseToSvg(evt);
  updateMouseStatus(m);
  if (!state.drag) return;

  if (state.drag.kind === 'palette') {
    const gx = maybeSnap(m.x), gy = maybeSnap(m.y);
    state.drag.ghost.setAttribute('transform', `translate(${gx.toFixed(3)} ${gy.toFixed(3)})`);
  } else if (state.drag.kind === 'instance') {
    const dx = m.x - state.drag.start.x;
    const dy = m.y - state.drag.start.y;
    for (const o of state.drag.origs) {
      const inst = state.instances.find(i => i.id === o.id);
      if (!inst) continue;
      inst.x = maybeSnap(o.ox + dx);
      inst.y = maybeSnap(o.oy + dy);
    }
    recomputeCollisions();
    render();
    renderInspector();
  } else if (state.drag.kind === 'marquee') {
    const s = state.drag.start;
    const x = Math.min(s.x, m.x), y = Math.min(s.y, m.y);
    const w = Math.abs(m.x - s.x), h = Math.abs(m.y - s.y);
    if (w > 0.5 || h > 0.5) state.drag.moved = true;
    const inRect = instancesInRect(x, y, w, h);
    state.selectedIds = new Set([...state.drag.prevSelected, ...inRect]);
    render();
    // Re-append marquee rect because render() wipes the SVG.
    state.drag.rect.setAttribute('x', x);
    state.drag.rect.setAttribute('y', y);
    state.drag.rect.setAttribute('width', w);
    state.drag.rect.setAttribute('height', h);
    svg.appendChild(state.drag.rect);
    renderInspector();
  }
}

function onWindowPointerUp(evt) {
  window.removeEventListener('pointermove', onWindowPointerMove);
  if (!state.drag) return;

  if (state.drag.kind === 'palette') {
    // Drop on canvas if cursor is over panel
    const m = mouseToSvg(evt);
    state.drag.ghost.remove();
    if (m.x >= 0 && m.x <= panelWidth() && m.y >= 0 && m.y <= PANEL_H) {
      const inst = {
        id: state.nextId++,
        libraryId: state.drag.libraryId,
        x: maybeSnap(m.x),
        y: maybeSnap(m.y),
        rot: 0
      };
      state.instances.push(inst);
      state.selectedIds = new Set([inst.id]);
      state.drag = null;
      afterChange();
      return;
    }
  } else if (state.drag.kind === 'marquee') {
    state.drag.rect.remove();
    if (!state.drag.moved) {
      // No drag — treat as click. Without shift, clear selection.
      state.selectedIds = new Set(state.drag.prevSelected);
    }
    // else: selection was already updated live during pointermove.
  }
  state.drag = null;
  recomputeCollisions();
  render();
  renderInspector();
}

// ---------- Canvas background (marquee select / deselect) ----------
// Instance handler calls stopPropagation, so anything reaching here is background.
function onCanvasPointerDown(evt) {
  evt.preventDefault();
  const m = mouseToSvg(evt);
  const prevSelected = evt.shiftKey ? new Set(state.selectedIds) : new Set();
  const rect = el('rect', {
    class: 'marquee',
    x: m.x, y: m.y, width: 0, height: 0,
    fill: 'rgba(120,170,255,0.15)',
    stroke: '#6aa8ff',
    'stroke-width': 0.15,
    'stroke-dasharray': '0.6 0.4',
    'pointer-events': 'none'
  });
  svg.appendChild(rect);
  state.drag = { kind: 'marquee', start: m, rect, prevSelected, moved: false };
  window.addEventListener('pointermove', onWindowPointerMove);
  window.addEventListener('pointerup', onWindowPointerUp, { once: true });
}

// ---------- Mouse status display ----------
function updateMouseStatus(m) {
  if (!m) { mousePosEl.textContent = '—'; return; }
  if (m.x < -PANEL_PAD || m.x > panelWidth() + PANEL_PAD ||
      m.y < -PANEL_PAD || m.y > PANEL_H + PANEL_PAD) {
    mousePosEl.textContent = '—';
    return;
  }
  const xi = mmToIn(m.x).toFixed(3);
  const yi = mmToIn(m.y).toFixed(3);
  mousePosEl.textContent = `${xi}",  ${yi}"`;
}

// ---------- Collision detection ----------
// Transform a local point by element pose.
function xform(inst, lx, ly) {
  const r = inst.rot * Math.PI / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return { x: inst.x + lx * c - ly * s, y: inst.y + lx * s + ly * c };
}
// Build world-space primitives for an instance's keepout shapes.
function worldKeepouts(inst) {
  const lib = findLibElement(inst.libraryId);
  if (!lib) return [];
  const out = [];
  for (const s of lib.keepout) {
    if (s.type === 'circle') {
      const c = xform(inst, s.cx, s.cy);
      out.push({ type: 'circle', cx: c.x, cy: c.y, r: s.r });
    } else if (s.type === 'rect') {
      const corners = [
        xform(inst, s.x, s.y),
        xform(inst, s.x + s.w, s.y),
        xform(inst, s.x + s.w, s.y + s.h),
        xform(inst, s.x, s.y + s.h),
      ];
      out.push({ type: 'poly', points: corners });
    }
  }
  return out;
}
function shapesIntersect(a, b) {
  if (a.type === 'circle' && b.type === 'circle') return circleCircle(a, b);
  if (a.type === 'poly' && b.type === 'poly') return polyPoly(a.points, b.points);
  if (a.type === 'circle' && b.type === 'poly') return circlePoly(a, b.points);
  if (a.type === 'poly' && b.type === 'circle') return circlePoly(b, a.points);
  return false;
}
function circleCircle(a, b) {
  const dx = a.cx - b.cx, dy = a.cy - b.cy;
  const r = a.r + b.r;
  return dx*dx + dy*dy < r*r - 1e-6;
}
function polyPoly(A, B) {
  // SAT
  for (const poly of [A, B]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i], p2 = poly[(i+1) % poly.length];
      const nx = -(p2.y - p1.y), ny = (p2.x - p1.x);
      const len = Math.hypot(nx, ny);
      const ax = nx / len, ay = ny / len;
      let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
      for (const p of A) { const d = p.x*ax + p.y*ay; if (d<aMin) aMin=d; if (d>aMax) aMax=d; }
      for (const p of B) { const d = p.x*ax + p.y*ay; if (d<bMin) bMin=d; if (d>bMax) bMax=d; }
      if (aMax < bMin + 1e-6 || bMax < aMin + 1e-6) return false;
    }
  }
  return true;
}
function circlePoly(circ, poly) {
  // Closest point on poly to circle center
  // First: if center is inside poly, intersect.
  if (pointInPoly(circ.cx, circ.cy, poly)) return true;
  let minD2 = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i+1) % poly.length];
    const d2 = pointToSegmentSq(circ.cx, circ.cy, a, b);
    if (d2 < minD2) minD2 = d2;
  }
  return minD2 < circ.r * circ.r - 1e-6;
}
function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
function pointToSegmentSq(px, py, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx*dx + dy*dy;
  let t = ((px - a.x) * dx + (py - a.y) * dy) / (len2 || 1e-12);
  t = clamp(t, 0, 1);
  const x = a.x + t * dx, y = a.y + t * dy;
  return (px - x) ** 2 + (py - y) ** 2;
}

function railZones() {
  const w = panelWidth();
  const rect = (x, y, ww, hh) => ({ type: 'poly', points: [
    { x, y }, { x: x + ww, y }, { x: x + ww, y: y + hh }, { x, y: y + hh }
  ]});
  return [
    rect(0, 0, w, RAIL_KEEPOUT_H),
    rect(0, PANEL_H - RAIL_KEEPOUT_H, w, RAIL_KEEPOUT_H),
  ];
}

function recomputeCollisions() {
  state.badInstances = new Set();
  const rails = railZones();
  const kos = state.instances.map(inst => ({ inst, shapes: worldKeepouts(inst) }));

  // Element-element overlap
  for (let i = 0; i < kos.length; i++) {
    for (let j = i + 1; j < kos.length; j++) {
      const A = kos[i], B = kos[j];
      let hit = false;
      for (const sa of A.shapes) {
        for (const sb of B.shapes) {
          if (shapesIntersect(sa, sb)) { hit = true; break; }
        }
        if (hit) break;
      }
      if (hit) {
        state.badInstances.add(A.inst.id);
        state.badInstances.add(B.inst.id);
      }
    }
  }

  // Element-rail overlap
  for (const { inst, shapes } of kos) {
    let hit = false;
    for (const s of shapes) {
      for (const r of rails) {
        if (shapesIntersect(s, r)) { hit = true; break; }
      }
      if (hit) break;
    }
    if (hit) state.badInstances.add(inst.id);
  }
}

// ---------- Save / Load ----------
function saveLayout() {
  const data = {
    version: 1,
    panel: { hp: state.panel.hp },
    instances: state.instances.map(i => ({
      libraryId: i.libraryId, x: +i.x.toFixed(4), y: +i.y.toFixed(4), rot: i.rot
    }))
  };
  downloadJSON(data, 'layout.json');
}
function loadLayoutData(data) {
  if (!data || !Array.isArray(data.instances)) throw new Error('Bad layout file');
  state.panel.hp = data.panel?.hp ?? state.panel.hp;
  hpInput.value = state.panel.hp;
  state.instances = data.instances.map(d => ({
    id: state.nextId++,
    libraryId: d.libraryId,
    x: d.x, y: d.y, rot: d.rot || 0
  }));
  state.selectedIds = new Set();
  afterChange();
}
function loadLibraryData(data) {
  if (!data || !Array.isArray(data.elements)) throw new Error('Bad library file');
  state.library = data;
  renderPalette();
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function pickJSON(callback) {
  fileInput.value = '';
  fileInput.onchange = () => {
    const f = fileInput.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try { callback(JSON.parse(r.result)); }
      catch (err) { alert('Could not parse JSON: ' + err.message); }
    };
    r.readAsText(f);
  };
  fileInput.click();
}

// ---------- Export SVG ----------
function exportSVG() {
  // Clone canvas and strip interactive classes
  const clone = svg.cloneNode(true);
  clone.removeAttribute('id');
  // Inline minimal styles for portability
  const style = document.createElementNS(SVG_NS, 'style');
  style.textContent = `
    .panel-rect { fill: #eeeeee; stroke: #333; stroke-width: 0.2; }
    .mount-hole { fill: #aaaaaa; stroke: #333; stroke-width: 0.1; }
    .elem-panel { fill: #1a1a1a; stroke: #000; stroke-width: 0.25; }
    .elem-deco  { fill: #fff; stroke: none; }
    .elem-keepout { fill: none; stroke: #111; stroke-width: 0.3; stroke-dasharray: 0.8 0.5; }
    .grid-line { stroke: rgba(0,0,0,0.08); stroke-width: 0.05; }
    .grid-line.major { stroke: rgba(0,0,0,0.15); stroke-width: 0.1; }
  `;
  clone.insertBefore(style, clone.firstChild);
  const xml = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([xml], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'panel.svg'; a.click();
  URL.revokeObjectURL(url);
}

// ---------- Keyboard ----------
function onKey(evt) {
  // Ignore when typing in an input
  if (evt.target.tagName === 'INPUT' || evt.target.tagName === 'TEXTAREA') return;
  if (state.selectedIds.size === 0) return;

  const selected = [...state.selectedIds]
    .map(id => state.instances.find(i => i.id === id))
    .filter(Boolean);
  const single = selected.length === 1 ? selected[0] : null;
  const nudge = evt.shiftKey ? inToMm(0.25) : inToMm(0.05);
  let handled = true;
  switch (evt.key) {
    case 'Delete': case 'Backspace': {
      const ids = new Set(state.selectedIds);
      state.instances = state.instances.filter(i => !ids.has(i.id));
      state.selectedIds = new Set();
      afterChange();
      break;
    }
    case 'r': if (single) { single.rot = (single.rot + 90) % 360; afterChange(); } break;
    case 'R': if (single) { single.rot = (single.rot + 270) % 360; afterChange(); } break;
    case 'ArrowLeft':  for (const i of selected) i.x = maybeSnap(i.x - nudge); afterChange(); break;
    case 'ArrowRight': for (const i of selected) i.x = maybeSnap(i.x + nudge); afterChange(); break;
    case 'ArrowUp':    for (const i of selected) i.y = maybeSnap(i.y - nudge); afterChange(); break;
    case 'ArrowDown':  for (const i of selected) i.y = maybeSnap(i.y + nudge); afterChange(); break;
    default: handled = false;
  }
  if (handled) evt.preventDefault();
}

// ---------- Init ----------
function init() {
  // Try to fetch elements.json (works when served); if it fails, default library is already loaded.
  fetch('elements.json')
    .then(r => r.ok ? r.json() : null)
    .then(data => { if (data) loadLibraryData(data); })
    .catch(() => {})
    .finally(() => renderPalette());

  hpInput.addEventListener('input', () => {
    const v = clamp(parseInt(hpInput.value, 10) || 1, 2, 84);
    state.panel.hp = v;
    render();
  });
  showKeepoutsCb.addEventListener('change', () => { state.showKeepouts = showKeepoutsCb.checked; render(); });
  showGridCb.addEventListener('change', () => { state.showGrid = showGridCb.checked; render(); });
  snapGridCb.addEventListener('change', () => { state.snapGrid = snapGridCb.checked; });

  document.getElementById('btn-save').onclick = saveLayout;
  document.getElementById('btn-load').onclick = () => pickJSON(loadLayoutData);
  document.getElementById('btn-library').onclick = () => pickJSON(loadLibraryData);
  document.getElementById('btn-export').onclick = exportSVG;

  svg.addEventListener('pointerdown', onCanvasPointerDown);
  svg.addEventListener('pointermove', (e) => updateMouseStatus(mouseToSvg(e)));
  window.addEventListener('keydown', onKey);

  renderPalette();
  render();
  renderInspector();
}

init();
