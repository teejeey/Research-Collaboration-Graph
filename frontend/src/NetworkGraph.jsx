import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";

// Draw the author network and keep the canvas fitted to its container.
export default function NetworkGraph({ graph, selectedAuthor, searchText, onSelect }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(300);

  // The library moves nodes and edits links, so give it copies of our data.
  const graphData = useMemo(() => ({
    nodes: graph.nodes.map((node) => ({ ...node })),
    links: graph.links.map((link) => ({ ...link })),
  }), [graph]);

  // Watch the available space so the graph also fits smaller screens.
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(1, Math.floor(entry.contentRect.width)));
    });

    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, []);

  // Use plain text for the hover label so author names cannot become HTML.
  function getNodeLabel(node) {
    const label = document.createElement("span");
    label.textContent = `${node.name}: ${node.paperCount} papers`;

    return label;
  }

  // Make the selected author and search matches easy to spot.
  function getNodeColor(node) {
    if (node.name === selectedAuthor) return "#f97316";
    if (searchText && node.name.toLowerCase().includes(searchText)) return "#16a34a";

    return "#528675";
  }

  return (
    <div className="graph-container" ref={containerRef} aria-label="Interactive author network">
      <ForceGraph2D
        graphData={graphData}
        width={width}
        height={500}
        nodeLabel={getNodeLabel}
        nodeVal={(node) => node.paperCount}
        nodeColor={getNodeColor}
        onNodeClick={(node) => onSelect(node.name)}
        linkWidth={(link) => link.sharedPapers}
        linkColor={() => "#b7c9c0"}
        backgroundColor="#f8faf7"
        cooldownTicks={100}
      />
    </div>
  );
}
