// Constelación decorativa de dientes: la firma visual de Dentia, derivada del
// odontograma vectorial del producto. Anteriores = círculos (como el clip
// circular de Tooth.tsx), posteriores = rects redondeados; cada uno con su
// zona oclusal interior insinuada. Posiciones FIJAS (SSR-estable, sin
// aleatoriedad → sin hydration mismatch). Decorativo puro.

type Kind = "anterior" | "posterior";
interface Node {
  x: number;
  y: number;
  s: number; // radio (anterior) o medio-lado (posterior)
  kind: Kind;
  delay: number; // segundos, escalona el pulso
}

const TEETH: Node[] = [
  { x: 70,  y: 60,  s: 15, kind: "anterior",  delay: 0 },
  { x: 160, y: 40,  s: 20, kind: "posterior", delay: 0.4 },
  { x: 265, y: 75,  s: 13, kind: "anterior",  delay: 0.9 },
  { x: 340, y: 45,  s: 17, kind: "posterior", delay: 1.3 },
  { x: 45,  y: 170, s: 21, kind: "posterior", delay: 0.6 },
  { x: 150, y: 150, s: 12, kind: "anterior",  delay: 1.1 },
  { x: 250, y: 185, s: 19, kind: "posterior", delay: 0.2 },
  { x: 350, y: 160, s: 14, kind: "anterior",  delay: 0.8 },
  { x: 90,  y: 290, s: 16, kind: "anterior",  delay: 1.4 },
  { x: 195, y: 265, s: 22, kind: "posterior", delay: 0.5 },
  { x: 305, y: 300, s: 15, kind: "anterior",  delay: 1.0 },
  { x: 65,  y: 400, s: 18, kind: "posterior", delay: 0.3 },
  { x: 185, y: 380, s: 13, kind: "anterior",  delay: 0.7 },
  { x: 300, y: 415, s: 20, kind: "posterior", delay: 1.2 },
];

// Aristas de la constelación (índices en TEETH).
const LINKS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [0, 4], [1, 5], [5, 6], [6, 7], [3, 7],
  [4, 8], [5, 9], [8, 9], [9, 10], [7, 10], [8, 11], [9, 12], [11, 12], [12, 13], [10, 13],
];

export function ToothConstellation({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 460"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
    >
      {LINKS.map(([a, b]) => (
        <line
          key={`${a}-${b}`}
          x1={TEETH[a].x}
          y1={TEETH[a].y}
          x2={TEETH[b].x}
          y2={TEETH[b].y}
          stroke="#5eead4"
          strokeOpacity={0.14}
          strokeWidth={1}
        />
      ))}
      {TEETH.map((t, i) => (
        <g
          key={i}
          className="motion-safe:animate-ghost-pulse"
          style={{ animationDelay: `${t.delay}s` }}
          stroke="#99f6e4"
          strokeOpacity={0.55}
          strokeWidth={1.2}
          fill="none"
        >
          {t.kind === "anterior" ? (
            <>
              <circle cx={t.x} cy={t.y} r={t.s} />
              <circle cx={t.x} cy={t.y} r={t.s * 0.45} strokeOpacity={0.3} />
            </>
          ) : (
            <>
              <rect
                x={t.x - t.s}
                y={t.y - t.s}
                width={t.s * 2}
                height={t.s * 2}
                rx={5}
              />
              <rect
                x={t.x - t.s * 0.45}
                y={t.y - t.s * 0.45}
                width={t.s * 0.9}
                height={t.s * 0.9}
                rx={2}
                strokeOpacity={0.3}
              />
            </>
          )}
        </g>
      ))}
    </svg>
  );
}
