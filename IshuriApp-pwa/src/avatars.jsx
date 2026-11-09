export function Portrait({ tone = "lake", delay = "0s" }) {
  return (
    <svg className="portrait" style={{ animationDelay: delay }} viewBox="0 0 80 96" aria-hidden="true">
      <ellipse className="shadow" cx="40" cy="90" rx="18" ry="4" />
      <g className="figure">
        <path d="M18 78c4-16 12-22 22-22s18 6 22 22" fill={tone === "clay" ? "#C46B3A" : tone === "ink" ? "#1A2744" : "#1F6F6A"} />
        <circle cx="40" cy="36" r="16" fill="#F3D5B5" />
        <path d={tone === "clay" ? "M24 34c2-14 30-16 34 2-8-8-24-8-34-2z" : "M24 30c4-12 28-14 32 0v8H24z"} fill={tone === "ink" ? "#E2B15A" : "#1A2744"} />
        <circle className="eye" cx="34" cy="36" r="1.6" />
        <circle className="eye" cx="46" cy="36" r="1.6" />
        <path d="M35 42c2 2 8 2 10 0" fill="none" stroke="#1A2744" strokeWidth="1.2" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export function Hillscape() {
  return (
    <svg className="hills" viewBox="0 0 640 180" aria-hidden="true">
      <path className="hill hill-a" d="M0 120c60-50 120-50 180 0s120 50 180 0 120-50 180 0 80 40 100 20v40H0z" />
      <path className="hill hill-b" d="M0 150c80-36 140-20 210 8 70 28 120 10 190-12 60-18 140-8 240 16v18H0z" />
      <circle className="sun" cx="520" cy="42" r="16" />
    </svg>
  );
}
