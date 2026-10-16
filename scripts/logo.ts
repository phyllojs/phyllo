import { join } from 'node:path';

type Point = [number, number];
type Circle = { center: Point; radius: number };
type Corner = Circle & { contacts: [Point, Point]; sheet: number };

const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const scale = (p: Point, n: number): Point => [p[0] * n, p[1] * n];
const length = (p: Point) => Math.hypot(...p);
const unit = (p: Point) => scale(p, 1 / length(p));
const number = (n: number) => String(Number(n.toFixed(5)));
const point = (p: Point) => p.map(number).join(' ');
const circle = (center: Point, radius: number): Circle => ({ center, radius });
const project = (c: Circle, p: Point) =>
  add(c.center, scale(unit(sub(p, c.center)), c.radius));

function intersections(a: Circle, b: Circle): Point[] {
  const delta = sub(b.center, a.center);
  const distance = length(delta);
  const along =
    (a.radius ** 2 - b.radius ** 2 + distance ** 2) / (2 * distance);
  const height = Math.sqrt(a.radius ** 2 - along ** 2);

  if (!Number.isFinite(height)) {
    throw new Error('Construction circles do not intersect.');
  }
  const direction = unit(delta);
  const middle = add(a.center, scale(direction, along));
  const normal: Point = [-direction[1] * height, direction[0] * height];

  return [add(middle, normal), sub(middle, normal)];
}

// 所有曲边均为圆弧，两处纸页间隙宽度一致。
const gap = 5;
const radius = 1.5;
const left = circle([0, 80], 65);
const leftGap = circle(left.center, left.radius + gap);
const middleTop = circle([108, 80], 59);
const lastTop = circle([132, 104], 57);
const leftTip: Point = [65, 114];
const middleTip: Point = [70, 109];
// 由点 (99, 62) 处的竖直切线和端点 (70, 109) 确定此圆。
const middleX = (99 ** 2 - 70 ** 2 - (109 - 62) ** 2) / (2 * (99 - 70));
const middle = circle([middleX, 62], 99 - middleX);
const middleGap = circle(middle.center, middle.radius + gap);
const lastTip = project(middleGap, middleTip);
// 最外层圆经过 lastTip，并与竖直线 x=118 相切。
const lastY =
  lastTop.center[1] - Math.sqrt(lastTop.radius ** 2 - (118 - 132) ** 2);
const lastX =
  (118 ** 2 - lastTip[0] ** 2 - (lastTip[1] - lastY) ** 2) /
  (2 * (118 - lastTip[0]));
const last = circle([lastX, lastY], 118 - lastX);

function verticalCorner(
  c: Circle,
  x: number,
  side: number,
  sheet: number,
): Corner {
  const cx = x + side * radius;
  const cy =
    c.center[1] - Math.sqrt((c.radius - radius) ** 2 - (cx - c.center[0]) ** 2);
  const center: Point = [cx, cy];

  return { center, radius, sheet, contacts: [[x, cy], project(c, center)] };
}

const c1 = verticalCorner(left, 12, 1, 0);
const c2 = verticalCorner(middleTop, 99, -1, 1);
const c3Center = intersections(
  circle(left.center, leftGap.radius + radius),
  circle(middleTop.center, middleTop.radius - radius),
).sort((a, b) => a[1] - b[1])[0]!;
const c3: Corner = {
  center: c3Center,
  radius,
  sheet: 1,
  contacts: [project(leftGap, c3Center), project(middleTop, c3Center)],
};
const c4Center = intersections(
  circle(lastTop.center, lastTop.radius - radius),
  circle(last.center, last.radius - radius),
).sort((a, b) => length(sub(a, [116, 50])) - length(sub(b, [116, 50])))[0]!;
const c4: Corner = {
  center: c4Center,
  radius,
  sheet: 2,
  contacts: [project(lastTop, c4Center), project(last, c4Center)],
};
const c5 = verticalCorner(lastTop, 104, 1, 2);
// 左下角圆弧连接竖直线 x=12 与经过 (12, 75) 和 leftTip 的直线。
const bottom = unit(sub(leftTip, [12, 75]));
const foldCenter: Point = [
  22,
  75 + (bottom[1] / bottom[0]) * 10 - 10 / bottom[0],
];
const foldTouch = add(foldCenter, [-bottom[1] * 10, bottom[0] * 10]);
const fold: Corner = {
  center: foldCenter,
  radius: 10,
  sheet: 0,
  contacts: [foldTouch, [12, foldCenter[1]]],
};

class Outline {
  commands: string[];
  constructor(start: Point) {
    this.commands = [`M${point(start)}`];
  }
  line(p: Point) {
    this.commands.push(`L${point(p)}`);

    return this;
  }
  arc(c: Circle, p: Point, sweep = 1) {
    this.commands.push(
      `A${number(c.radius)} ${number(c.radius)} 0 0 ${sweep} ${point(p)}`,
    );

    return this;
  }
  toString() {
    return this.commands.join(' ') + ' Z';
  }
}

const paths = [
  new Outline(c1.contacts[1])
    .arc(left, [65, 80])
    .line(leftTip)
    .line(foldTouch)
    .arc(fold, fold.contacts[1])
    .line(c1.contacts[0])
    .arc(c1, c1.contacts[1]),
  new Outline(c3.contacts[1])
    .arc(middleTop, c2.contacts[1])
    .arc(c2, c2.contacts[0])
    .line([99, 62])
    .arc(middle, middleTip)
    .line([70, 80])
    .arc(leftGap, c3.contacts[0], 0)
    .arc(c3, c3.contacts[1]),
  new Outline(c5.contacts[1])
    .arc(lastTop, c4.contacts[0])
    .arc(c4, c4.contacts[1])
    .arc(last, lastTip)
    .arc(middleGap, [104, 62], 0)
    .line(c5.contacts[0])
    .arc(c5, c5.contacts[1]),
].map(String);
const corners = [c1, c2, c3, c4, c5, fold];
const circles = [left, leftGap, middleTop, middle, middleGap, lastTop, last];
const style = [
  '<style>',
  '  :root { color-scheme: light dark; }',
  '  .background { fill: #fff; }',
  '  .guide { stroke: #8a94a5; }',
  '  .outline { stroke: #2563eb; }',
  '  .sheet { fill: #2563eb; fill-opacity: .18; }',
  '  .round { stroke: #a84910; }',
  '  .contact { fill: #a84910; }',
  '  .label { fill: #354154; font-family: ui-sans-serif, system-ui, sans-serif; }',
  '  @media (prefers-color-scheme: dark) {',
  '    .background { fill: #191b21; }',
  '    .guide { stroke: #8993a3; }',
  '    .outline { stroke: #85aeff; }',
  '    .sheet { fill: #85aeff; fill-opacity: .2; }',
  '    .round { stroke: #f4aa72; }',
  '    .contact { fill: #f4aa72; }',
  '    .label { fill: #e5e9f1; }',
  '  }',
  '</style>',
].join('\n');

function drawing(
  viewBox: string,
  title: string,
  description: string,
  body: string,
) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-labelledby="title desc">`,
    `<title id="title">${title}</title>`,
    `<desc id="desc">${description}</desc>`,
    style,
    body,
    '</svg>\n',
  ].join('\n');
}

const fill = paths.map(d => `<path class="sheet" d="${d}"/>`).join('\n');
const outlines = paths
  .map(d => `<path class="outline" d="${d}" fill="none" stroke-width=".5"/>`)
  .join('\n');
const construction = drawing(
  '-82 -32 284 210',
  'Phyllo: circular construction',
  'Blue regions A, B and C form the logo. All curved edges are circular arcs. Two concentric pairs have a radius difference of 5. O1 to O5 mark the five main circle centers.',
  [
    '<rect class="background" x="-82" y="-32" width="284" height="210"/>',
    fill,
    '<g class="guide" fill="none" stroke-width=".4">',
    circles
      .map(
        c =>
          `<circle cx="${number(c.center[0])}" cy="${number(c.center[1])}" r="${number(c.radius)}"/>`,
      )
      .join('\n'),
    '<path d="M-75 80H185 M12 10V115 M65 80V120 M70 80V120 M99 22V62 M104 54V62" stroke-dasharray="1.5 2"/>',
    '</g>',
    outlines,
    '<g class="round" fill="none" stroke-width=".45">',
    corners
      .map(
        c =>
          `<circle cx="${number(c.center[0])}" cy="${number(c.center[1])}" r="${c.radius}"/>`,
      )
      .join('\n'),
    '</g>',
    [left, middleTop, middle, lastTop, last]
      .map((c, i) => {
        const [x, y] = c.center;
        const offsets = [
          [-14, 7],
          [5, 8],
          [-16, 5],
          [4, 7],
          [-16, -4],
        ];
        const [dx, dy] = offsets[i]!;

        return [
          `<path class="guide" d="M${point([x - 2, y])}h4 M${point([x, y - 2])}v4" fill="none" stroke-width=".6"/>`,
          `<text class="label" x="${number(x + dx!)}" y="${number(y + dy!)}" font-size="7">O${i + 1}</text>`,
        ].join('\n');
      })
      .join('\n'),
    [
      [30, 55, 'A'],
      [82, 54, 'B'],
      [109, 71, 'C'],
    ]
      .map(
        ([x, y, label]) =>
          `<text class="label" x="${x}" y="${y}" font-size="9" text-anchor="middle">${label}</text>`,
      )
      .join('\n'),
  ].join('\n'),
);
const positions: Point[] = [
  [14, 8],
  [224, 8],
  [434, 8],
  [14, 228],
  [224, 228],
  [434, 228],
];
const detail = drawing(
  '0 0 640 450',
  'Phyllo: tangent circles',
  'Corners 1 to 5 use radius 1.5. Turn 6 uses radius 10. Each panel has its own magnification. Orange dots mark tangent contacts. Gray lines are tangents, and dashed orange lines are radii.',
  [
    '<rect class="background" width="640" height="450"/>',
    corners
      .map((c, i) => {
        const [x, y] = positions[i]!;
        const extent = c.radius * 3.6;
        const stroke = c.radius / 22;

        return [
          `<svg x="${x}" y="${y}" width="192" height="176" viewBox="${number(c.center[0] - extent)} ${number(c.center[1] - extent * 0.92)} ${number(extent * 2)} ${number(extent * 1.83333)}" overflow="hidden">`,
          `<path class="sheet" d="${paths[c.sheet]}"/>`,
          `<path class="outline" d="${paths[c.sheet]}" fill="none" stroke-width="${number(stroke)}"/>`,
          `<circle class="round" cx="${number(c.center[0])}" cy="${number(c.center[1])}" r="${c.radius}" fill="none" stroke-width="${number(stroke)}"/>`,
          c.contacts
            .map(p => {
              const n = unit(sub(p, c.center));
              const tangent: Point = [
                -n[1] * c.radius * 2.5,
                n[0] * c.radius * 2.5,
              ];

              return [
                `<path class="guide" d="M${point(sub(p, tangent))} L${point(add(p, tangent))}" fill="none" stroke-width="${number(stroke * 0.65)}"/>`,
                `<path class="round" d="M${point(c.center)} L${point(p)}" fill="none" stroke-width="${number(stroke * 0.65)}" stroke-dasharray="${number(stroke * 2)} ${number(stroke * 2)}"/>`,
                `<circle class="contact" cx="${number(p[0])}" cy="${number(p[1])}" r="${number(stroke * 1.4)}"/>`,
              ].join('\n');
            })
            .join('\n'),
          '</svg>',
          `<text class="label" x="${x + 96}" y="${y + 198}" text-anchor="middle" font-size="22">${i + 1} · R ${c.radius}</text>`,
        ].join('\n');
      })
      .join('\n'),
  ].join('\n'),
);
const logo = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">',
  '  <title>Phyllo</title>',
  "  <desc>Layered pastry sheets unfold like book pages, connecting Bun's food imagery with writing.</desc>",
  '  <g fill="#2563eb">',
  paths.map(d => `    <path d="${d}"/>`).join('\n'),
  '  </g>',
  '</svg>\n',
].join('\n');

// 将 Logo 和结构示意图写入文档站。
const output = join(import.meta.dir, '../docs/public');

await Bun.write(join(output, 'logo.svg'), logo);
await Bun.write(join(output, 'logo-construction.svg'), construction);
await Bun.write(join(output, 'logo-corners.svg'), detail);
console.log('已生成文档站 Logo、圆弧结构图和相切细节图。');
