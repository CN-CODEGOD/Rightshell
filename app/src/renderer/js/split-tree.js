// Split tree: each tab owns a binary tree of panes.
//   leaf:  { kind: 'leaf', pane: TermPane }
//   split: { kind: 'split', dir: 'row'|'col', a, b, ratio }
// Rendering re-uses TermPane instances (xterm stays alive across re-renders).

function leaf(pane) {
  return { kind: 'leaf', pane };
}

function leaves(node, out = []) {
  if (!node) return out;
  if (node.kind === 'leaf') out.push(node.pane);
  else {
    leaves(node.a, out);
    leaves(node.b, out);
  }
  return out;
}

function findLeaf(node, pane) {
  if (!node) return null;
  if (node.kind === 'leaf') return node.pane === pane ? node : null;
  return findLeaf(node.a, pane) || findLeaf(node.b, pane);
}

function findParent(root, node) {
  if (!root || root.kind === 'leaf') return null;
  if (root.a === node || root.b === node) return root;
  return findParent(root.a, node) || findParent(root.b, node);
}

function firstLeaf(node) {
  return node.kind === 'leaf' ? node.pane : firstLeaf(node.a);
}

// Replace `target` node with `replacement` inside root; returns new root.
function replaceNode(root, target, replacement) {
  if (root === target) return replacement;
  if (root.kind === 'leaf') return root;
  root.a = replaceNode(root.a, target, replacement);
  root.b = replaceNode(root.b, target, replacement);
  return root;
}

function renderTree(node, container, ctx) {
  container.textContent = '';
  if (!node) return;
  if (node.kind === 'leaf') {
    node.pane.el.classList.add('pane-root');
    container.appendChild(node.pane.el);
    node.pane.scheduleFit();
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'split split-' + node.dir;

  const childA = document.createElement('div');
  childA.className = 'split-child';
  childA.style.flexGrow = node.ratio;
  const childB = document.createElement('div');
  childB.className = 'split-child';
  childB.style.flexGrow = 1 - node.ratio;

  const divider = document.createElement('div');
  divider.className = 'divider divider-' + node.dir;

  renderTree(node.a, childA, ctx);
  renderTree(node.b, childB, ctx);
  wrap.append(childA, divider, childB);
  container.appendChild(wrap);

  divider.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const rect = wrap.getBoundingClientRect();
    const move = (ev) => {
      const raw =
        node.dir === 'row'
          ? (ev.clientX - rect.left) / rect.width
          : (ev.clientY - rect.top) / rect.height;
      node.ratio = Math.max(0.1, Math.min(0.9, raw));
      childA.style.flexGrow = node.ratio;
      childB.style.flexGrow = 1 - node.ratio;
      for (const p of leaves(node)) p.scheduleFit();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });
}

// Directional focus: pick the nearest leaf whose center lies in the direction.
function focusDirection(root, fromPane, direction) {
  const all = leaves(root);
  if (all.length < 2) return null;
  const fromEl = fromPane.el.getBoundingClientRect();
  const fx = fromEl.left + fromEl.width / 2;
  const fy = fromEl.top + fromEl.height / 2;
  let best = null;
  let bestScore = Infinity;
  for (const p of all) {
    if (p === fromPane) continue;
    const r = p.el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = cx - fx;
    const dy = cy - fy;
    let primary, secondary;
    if (direction === 'left') { primary = -dx; secondary = Math.abs(dy); }
    else if (direction === 'right') { primary = dx; secondary = Math.abs(dy); }
    else if (direction === 'up') { primary = -dy; secondary = Math.abs(dx); }
    else { primary = dy; secondary = Math.abs(dx); }
    if (primary <= 0) continue;
    const score = primary + secondary * 2;
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

// Resize: adjust the nearest ancestor split on the matching axis.
function resizeDirection(root, fromPane, direction, step = 0.05) {
  const axis = direction === 'left' || direction === 'right' ? 'row' : 'col';
  let node = findLeaf(root, fromPane);
  let parent = findParent(root, node);
  while (parent) {
    if (parent.dir === axis) {
      const isA = parent.a === node || containsLeaf(parent.a, fromPane);
      // moving the divider right/down grows A when focus is in A
      const grow = direction === 'right' || direction === 'down' ? 1 : -1;
      const delta = isA ? grow * step : -grow * step;
      parent.ratio = Math.max(0.1, Math.min(0.9, parent.ratio + delta));
      return true;
    }
    node = parent;
    parent = findParent(root, node);
  }
  return false;
}

function containsLeaf(node, pane) {
  return leaves(node).includes(pane);
}

window.SplitTree = { leaf, leaves, findLeaf, findParent, firstLeaf, replaceNode, renderTree, focusDirection, resizeDirection };