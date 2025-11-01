# Sunburst Chart - Radial Partition Visualization

## Overview

The **Sunburst Chart** (also known as a Radial Treemap or Radial Partition Chart) is an interactive visualization that displays dependency hierarchies as nested circular segments.

**File**: `deps-sunburst.html` (29 KB)

---

## 🎯 What Makes It Special

The Sunburst Chart is perfect for:
- **Seeing hierarchy at a glance** - Repository at center, direct deps in inner ring, transitive deps in outer rings
- **Understanding proportions** - Arc size shows how many children each dependency has
- **Interactive exploration** - Click any segment to zoom in and focus on that branch
- **Presentations** - Visually striking and easy to explain
- **Finding heavy dependencies** - Larger arcs = more transitive dependencies

---

## 🎨 Visual Design

### Structure
```
        ┌─────────────────────────┐
        │                         │
        │    ┌─────────────┐      │  Transitive
        │    │             │      │  Dependencies
        │    │   ┌─────┐   │      │  (Gray)
        │    │   │REPO │   │  Direct
        │    │   └─────┘   │  Dependencies
        │    │             │  (Blue)
        │    └─────────────┘      │
        │                         │
        └─────────────────────────┘
```

### Color Coding
- 🟢 **Green Center** - Repository (root)
- 🔵 **Blue Inner Ring** - Direct dependencies
- ⚫ **Gray Outer Rings** - Transitive dependencies

### Arc Size
- **"Count" mode** (default) - Arc size = number of child dependencies
- **"Equal" mode** - All dependencies have equal arc size (good for seeing all packages)

---

## 🎮 Interactive Features

### 1. **Click to Zoom**
- Click any segment to zoom in and focus on that dependency
- The clicked segment becomes the new "center"
- Its children spread out to fill the circle

### 2. **Breadcrumb Navigation**
```
All Repositories → microsoft/vscode → chalk@4.1.2
```
- Shows your current location in the hierarchy
- Click any breadcrumb item to jump back to that level

### 3. **Center Click to Zoom Out**
- Click the center circle to zoom back out to the parent level
- Or use the "Reset View" button to return to the top

### 4. **Hover for Details**
- Hover over any segment to see:
  - Package name and version
  - Type (repo, direct, transitive)
  - Depth in the hierarchy
  - Number of children
  - Total descendants

### 5. **Click for Full Details**
- Click a segment to see full details in the side panel:
  - Complete package information
  - Ecosystem and language
  - List of first 10 children
  - Usage across repositories

---

## 🔧 Controls

### Filters
- **Analysis Selector** - Choose which project to visualize
- **Repository Filter** - Focus on specific repositories or view all
- **Ecosystem Filter** - Filter by npm, pip, cargo, etc.
- **Size By** - Choose how arc sizes are calculated:
  - `Child Count` - Proportional to number of children (shows "heavy" dependencies)
  - `Equal Size` - All dependencies same size (shows everything equally)

### Buttons
- **Reset View** - Return to the top-level view
- All standard filters (analysis, repo, ecosystem)

---

## 📊 Use Cases

### 1. **Finding Heavy Dependencies**
**Goal**: Identify which direct dependencies bring in the most transitive dependencies

**Steps**:
1. Set "Size By" to "Child Count"
2. Look for the largest blue arcs in the inner ring
3. Click on a large arc to see all its children
4. Evaluate if the transitive dependency load is justified

**Example**: "Express brings in 30 transitive dependencies - is that acceptable?"

---

### 2. **Exploring Dependency Chains**
**Goal**: Trace the path from repository to a specific transitive dependency

**Steps**:
1. Start at the top level
2. Click on a direct dependency
3. Navigate through the hierarchy following the breadcrumb
4. See the complete chain in the breadcrumb trail

**Example**: `microsoft/vscode → chalk → ansi-styles → color-convert`

---

### 3. **Comparing Direct Dependencies**
**Goal**: See at a glance which direct dependencies are "heavier"

**Steps**:
1. View the top level
2. Observe the blue inner ring
3. Larger arcs = more transitive dependencies
4. Click any arc to drill down

**Visual**: Immediately see that `webpack` has a much larger arc than `lodash`

---

### 4. **Presentations and Reports**
**Goal**: Create a visually striking image of dependency structure

**Steps**:
1. Set up the filters for your target view
2. Optionally zoom into a specific dependency
3. Take a screenshot
4. The circular layout looks great in presentations

**Why it works**: The sunburst chart is intuitive even for non-technical audiences

---

### 5. **Finding Isolated Dependencies**
**Goal**: Identify dependencies with few or no children (potential leaf nodes)

**Steps**:
1. Set "Size By" to "Equal Size"
2. Look for very small arcs in the outer rings
3. These are dependencies with few/no children
4. Useful for understanding termination points

---

## 🎯 Comparison with Other Views

| Feature | Sunburst | Table | List | Tree Graph |
|---------|----------|-------|------|------------|
| **Visual Impact** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| **Show Proportions** | ⭐⭐⭐⭐⭐ | ⭐ | ⭐ | ⭐⭐ |
| **Interactive Zoom** | ⭐⭐⭐⭐⭐ | ⭐ | ⭐ | ⭐⭐⭐ |
| **Ease of Use** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Presentations** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Finding Specific Package** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| **Understanding Hierarchy** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

---

## 💡 Pro Tips

### Tip 1: Use "Child Count" to Find Problem Dependencies
Set the size mode to "Child Count" to immediately identify which direct dependencies have the most transitive children. Large arcs = potential dependency bloat.

### Tip 2: Zoom for Focus
Don't try to see everything at once. Click on a direct dependency to zoom in and focus on just that branch of the tree.

### Tip 3: Use Breadcrumbs for Navigation
The breadcrumb trail is your friend. Click on any level to jump back without clicking "back" multiple times.

### Tip 4: Filter First, Visualize Second
Apply ecosystem filters before viewing the sunburst. For example, view only "npm" dependencies for a cleaner picture.

### Tip 5: Screenshot with Zoom
For presentations, zoom into the interesting part before taking a screenshot. A zoomed view is often clearer than the full tree.

### Tip 6: Equal Size for Complete Picture
Use "Equal Size" mode when you want to see all dependencies, even those with few children. Good for audits.

---

## 🚀 Getting Started

1. **Open `deps-sunburst.html`** or click the link from `deps.html`
2. **Select an analysis** from the dropdown
3. **Observe the visualization** - Repository at center, dependencies radiating out
4. **Click any segment** to zoom in and explore
5. **Use breadcrumbs** to navigate back up

---

## 🎨 Technical Details

### Implementation
- **D3.js v7** - `d3.partition()` layout
- **SVG-based** - Scalable vector graphics, crisp at any resolution
- **Zoom animations** - Smooth 750ms transitions
- **Arc calculations** - Uses `d3.arc()` with padding

### Data Structure
Uses the same hierarchical data as other visualizations:
```
Repository
├── Direct Dependency 1
│   ├── Transitive 1a
│   └── Transitive 1b
├── Direct Dependency 2
│   ├── Transitive 2a
│   ├── Transitive 2b
│   └── Transitive 2c
...
```

### Performance
- Handles thousands of dependencies smoothly
- Animations are GPU-accelerated
- Only renders visible text labels (segments > 9 degrees)

---

## 🎭 When to Use Sunburst Chart

### ✅ Use Sunburst When:
- You want a visually impressive presentation
- You need to understand dependency proportions
- You're exploring a large dependency tree
- You want to identify "heavy" dependencies
- You need to explain dependencies to non-technical stakeholders
- You're creating documentation or reports

### ❌ Use Other Views When:
- You need to search for a specific package → Use **Table View**
- You need to export data → Use **Table** or **Grid View**
- You need to copy dependency lists → Use **List View**
- You need detailed filtering → Use **Grid View**
- You prefer linear/traditional layouts → Use **Tree Graph**

---

## 📊 Example Scenarios

### Scenario 1: Executive Presentation
**Context**: Presenting dependency analysis to leadership

**Approach**:
1. Open sunburst chart
2. Show full view: "These are all our dependencies"
3. Click on a large arc: "This one package brings in all these"
4. Explain the risk: "If this package has a vulnerability, it affects X transitive dependencies"

**Why Sunburst**: Visually striking, easy to explain, shows scale

---

### Scenario 2: Dependency Audit
**Context**: Auditing all dependencies for bloat

**Approach**:
1. Use "Child Count" size mode
2. Identify largest arcs
3. Click each to explore
4. Document findings
5. Switch to Table View for detailed analysis

**Why Sunburst**: Quickly identifies problem areas visually

---

### Scenario 3: Understanding New Codebase
**Context**: Onboarding to a new project

**Approach**:
1. Start with sunburst overview
2. Click through major dependencies
3. Use breadcrumbs to explore different branches
4. Build mental model of dependency structure

**Why Sunburst**: Intuitive exploration, good for learning

---

## 🎉 Summary

The **Sunburst Chart** is a powerful, visually striking way to explore dependency hierarchies. It excels at:

✅ **Showing proportions** - See which dependencies are "heavy"  
✅ **Interactive exploration** - Zoom in and out with clicks  
✅ **Visual presentations** - Impressive for stakeholders  
✅ **Understanding structure** - Hierarchy is immediately clear  
✅ **Finding problem areas** - Large arcs = many transitive deps  

**Best for**: Presentations, exploration, understanding proportions, identifying heavy dependencies

**Combine with**: Table View for details, List View for copying, Grid View for filtering

---

## 🔗 Quick Links

- **Main dependency views**: `deps.html`
- **All visual graphs**: `deps-visual.html`
- **Sunburst chart**: `deps-sunburst.html` ⭐

**Try it now**: Open `deps-sunburst.html` and click around - it's intuitive and fun to explore!

