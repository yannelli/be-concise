const paths = {
  overview: ["M3 3h7v7H3z", "M14 3h7v7h-7z", "M3 14h7v7H3z", "M14 14h7v7h-7z"],
  configuration: ["M4 6h16M4 12h16M4 18h16", "M8 3v6M16 9v6M10 15v6"],
  playground: ["m9 5 10 7-10 7z"],
  activity: ["M3 12h4l3-8 4 16 3-8h4"],
  rules: ["M8 4h12v16H8z", "M4 8h8M4 12h8M4 16h8"],
  terminal: ["M3 4h18v16H3z", "m7 8 3 4-3 4M13 16h4"],
  folder: ["M3 7V4h6l3 3h9v13H3z"],
  chevron: ["m9 5 7 7-7 7"],
  down: ["m6 9 6 6 6-6"],
  check: ["m5 12 4 4L19 6"],
  minus: ["M5 12h14"],
};

export function icon(name, className = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const attributes = { viewBox: "0 0 24 24", width: "16", height: "16", fill: "none", stroke: "currentColor",
    "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", class: `icon ${className}` };
  for (const [key, value] of Object.entries(attributes)) svg.setAttribute(key, value);
  for (const d of paths[name] || paths.terminal) {
    const path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}
