// Sequential-number any selected groups / frames / instances – prompts for starting number.

figma.on("run", () => {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.notify("No nodes selected.");
    figma.closePlugin();
    return;
  }

  const targetNodes: TextNode[] = [];
  const fontsToLoad = new Set<FontName>();

  /**
   * Recursively collect text nodes named "sequential number"
   * (case‑insensitive) while preserving traversal order.
   */
  function collect(node: SceneNode) {
    if (
      node.type === "TEXT" &&
      node.name.trim().toLowerCase() === "sequential number"
    ) {
      targetNodes.push(node);
      fontsToLoad.add(node.fontName as FontName);
    }

    // Recurse through children if the node can have any.
    if ("children" in node) {
      for (const child of node.children) collect(child);
    }
  }

  // Traverse every selected node in the order the user selected them.
  selection.forEach(collect);

  // Sort collected nodes by **global layer stack order** (Layers panel), regardless of parent.
  function indexPath(node: SceneNode): number[] {
    const path: number[] = [];
    let cur: BaseNode | null = node;
    while (cur && cur.parent) {
      const p = cur.parent as BaseNode & { children?: readonly SceneNode[] };
      if ("children" in p && Array.isArray(p.children)) {
        path.push(p.children.indexOf(cur as SceneNode));
      }
      cur = p;
    }
    return path.reverse(); // root → leaf
  }

  targetNodes.sort((a, b) => {
    const pa = indexPath(a);
    const pb = indexPath(b);
    const len = Math.min(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
      if (pa[i] !== pb[i]) return pa[i] - pb[i];
    }
    // One path is a prefix of the other – shorter (shallower) first
    return pa.length - pb.length;
  });

  if (targetNodes.length === 0) {
    figma.notify("No \"sequential number\" text layers found in selection.");
    figma.closePlugin();
    return;
  }

  // ————————— Inline UI prompt —————————
  const html = `
    <div style="font-family:Inter, sans-serif; padding:16px;">
      <label style="display:block; margin-bottom:8px;">
        Starting number:
        <input id="start" type="number" min="0" value="1" style="width:100%; margin-top:4px;" />
      </label>
      <button id="go" style="padding:6px 12px;">Apply</button>
      <script>
        const start = document.getElementById('start');
        const post = (val) => parent.postMessage({ pluginMessage: { type: 'apply', value: val } }, '*');
        document.getElementById('go').onclick = () => {
          const v = parseInt(start.value, 10);
          post(isNaN(v) ? 1 : v);
        };
        start.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('go').click(); });
      </script>
    </div>`;

  figma.showUI(html, { width: 220, height: 140 });

  figma.ui.onmessage = async (msg) => {
    if (msg.type === "apply") {
      const start = Number(msg.value) || 1;

      await Promise.all(
        [...fontsToLoad].map(f => figma.loadFontAsync(f).catch(() => null))
      );

      targetNodes.forEach((node, idx) => {
        node.characters = String(start + idx);
      });

      figma.notify(`Renumbered ${targetNodes.length} layer(s) starting at ${start}.`);
      figma.closePlugin();
    }
  };
});
