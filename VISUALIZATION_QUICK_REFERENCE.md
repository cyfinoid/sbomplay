# Dependency Visualization - Quick Reference Guide

## 🎉 All 4 Layouts Complete!

You now have 4 different ways to visualize your dependency relationships. Each has unique strengths.

---

## 📋 Quick Navigation

**Start Here**: Open `deps.html` to see all options and choose your visualization

**Individual Pages**:
- `deps-tree.html` - Tree Layout ⭐ RECOMMENDED
- `deps-dagre.html` - Professional Directed Graph
- `deps-radial.html` - Circular Radial Layout
- `deps-force.html` - Interactive Force-Directed

---

## 🌳 1. Tree Layout (RECOMMENDED)

**File**: `deps-tree.html`

**When to Use**: This should be your go-to for most use cases.

**Strengths**:
- Crystal clear hierarchy
- Easy to trace dependency chains
- Shows exactly which direct dependency brings in which transitive dependencies
- Collapsible branches for focusing on specific areas
- Horizontal or vertical orientation

**Perfect For**:
- Understanding your dependency structure
- Finding where a specific transitive dependency comes from
- Presentations to non-technical stakeholders
- Daily dependency analysis work

**Controls**:
- Click nodes to expand/collapse branches
- "Expand All" / "Collapse All" buttons
- Toggle between horizontal/vertical layout

---

## 📊 2. Dagre Layout (PROFESSIONAL)

**File**: `deps-dagre.html`

**When to Use**: When you need a polished, professional visualization.

**Strengths**:
- Automatic layer-based positioning (like webpack, npm uses)
- Handles complex graphs with many cross-dependencies
- Multiple direction options (TB, BT, LR, RL)
- Clean, organized appearance
- Minimal edge crossings

**Perfect For**:
- Complex projects with many shared dependencies
- Professional presentations
- Documentation and reports
- When dependencies have multiple paths to the same package

**Controls**:
- Zoom in/out buttons
- Pan and drag the canvas
- 4 direction options in dropdown
- Click nodes for details

---

## ⭕ 3. Radial Layout (COMPACT)

**File**: `deps-radial.html`

**When to Use**: When you want to see the "big picture" at a glance.

**Strengths**:
- Compact, space-efficient visualization
- Shows dependency "depth" visually (distance from center)
- Beautiful circular layout
- Depth rings show hierarchy levels
- Good for presentations

**Perfect For**:
- Getting an overview of dependency structure
- Seeing how "deep" your dependency tree goes
- Comparing dependency levels
- Screenshots and presentations
- Projects with moderate complexity

**Controls**:
- Click nodes to expand/collapse
- Adjustable radius (Small/Medium/Large)
- Zoom and pan controls
- "Expand All" / "Collapse All"

---

## 🕸️ 4. Force-Directed Layout (INTERACTIVE)

**File**: `deps-force.html`

**When to Use**: When you want to explore and interact with dependencies.

**Strengths**:
- Physics-based simulation creates natural clustering
- Drag nodes around to rearrange
- Highly interactive
- Shows patterns through positioning
- Fun to play with!

**Perfect For**:
- Exploratory analysis
- Finding patterns and clusters
- Interactive demos
- When you want to manually arrange nodes

**Caution**: Can get messy with many dependencies

**Controls**:
- Drag nodes to reposition them
- Zoom and pan
- Filter by type, ecosystem, repo
- Search for specific dependencies

---

## 🎯 Which Layout Should I Use?

### Quick Decision Tree:

**First time analyzing?** → Start with **Tree Layout**

**Need a clean professional look?** → Use **Dagre Layout**

**Want to see the big picture quickly?** → Use **Radial Layout**

**Want to explore and interact?** → Use **Force-Directed Layout**

**Complex dependencies with shared packages?** → Use **Dagre Layout**

**Tracing where a transitive dependency comes from?** → Use **Tree Layout**

**Making a presentation?** → Use **Tree or Radial Layout**

---

## 🎨 Common Features (All Layouts)

Every layout includes:

✅ **Analysis Selector** - Switch between different analyzed projects
✅ **Repository Filter** - Focus on specific repos or see all
✅ **Ecosystem Filter** - Filter by npm, pip, cargo, etc.
✅ **Statistics Panel** - Real-time counts of nodes and relationships
✅ **Details Panel** - Click any node for detailed information
✅ **Dark Mode Support** - Respects your theme preference
✅ **Tooltips** - Hover for quick info
✅ **Color Coding**:
  - 🟢 Green = Repository
  - 🔵 Blue = Direct Dependency
  - ⚫ Gray = Transitive Dependency
  - Solid lines = Direct relationships
  - Dashed lines = Transitive relationships

---

## 🚀 Getting Started

1. **Open `deps.html`** in your browser
2. **Review the comparison cards** for each layout
3. **Click a card** to open that visualization
4. **Select an analysis** from the dropdown
5. **Explore** with the filters and controls
6. **Try all 4 layouts** to find your favorite!

Each layout remembers your analysis selection, so you can easily switch between them to compare.

---

## 💡 Pro Tips

### Tree Layout
- Start with everything collapsed, then expand what you need
- Use horizontal layout for wide screens, vertical for tall screens
- Great for screenshots - collapse what you don't want to show

### Dagre Layout
- Try different directions (TB, LR, etc.) to see which is clearest
- Use "Fit to View" to reset the zoom
- Best for projects with 20-100 dependencies

### Radial Layout
- Adjust radius based on number of dependencies
- Depth rings help you see how "deep" dependencies go
- Collapse branches to reduce clutter

### Force-Directed Layout
- Let it settle for a few seconds before interacting
- Drag related nodes close together for custom grouping
- Use search to highlight specific dependencies

---

## 📐 Technical Details

**Data Source**: IndexedDB (via storage-manager.js)
**Visualization Library**: D3.js v7
**Graph Layout**: Dagre (for dagre layout only)
**Size**: ~100 KB total (all 5 files)
**Browser Support**: All modern browsers (Chrome, Firefox, Safari, Edge)

**SPDX Relationships**:
- Uses SPDX `DEPENDS_ON` relationships from SBOMs
- Correctly maps SPDX IDs to package names
- Distinguishes `isDirectFromMain` for accurate hierarchy

---

## 🎭 Comparison at a Glance

| Feature | Tree | Dagre | Radial | Force |
|---------|------|-------|--------|-------|
| **Clarity** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Performance** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Interactivity** | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Best for Hierarchy** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **Best for Complexity** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Compact View** | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |

---

## 🤔 Feedback Welcome!

Try all 4 layouts and see which ones you prefer for different tasks. Each has been designed with specific use cases in mind.

**Recommended workflow**:
1. Use **Tree** for daily work
2. Use **Dagre** for presentations
3. Use **Radial** for quick overviews
4. Use **Force** for exploration

Happy visualizing! 🎉

