import { join } from 'node:path';

type Point = [number, number];
type Circle = { center: Point; radius: number };
type Corner = Circle & { contacts: [Point, Point] };

const add = ([ax, ay]: Point, [bx, by]: Point): Point => [ax + bx, ay + by];
const sub = ([ax, ay]: Point, [bx, by]: Point): Point => [ax - bx, ay - by];
const scale = ([x, y]: Point, n: number): Point => [x * n, y * n];
const length = (p: Point) => Math.hypot(...p);
const unit = (p: Point) => scale(p, 1 / length(p));
const number = (n: number) => String(Number(n.toFixed(5)));
const point = (p: Point) => p.map(number).join(' ');
const circle = (center: Point, radius: number): Circle => ({ center, radius });
const project = (c: Circle, p: Point) =>
  add(c.center, scale(unit(sub(p, c.center)), c.radius));

function intersections(a: Circle, b: Circle): [Point, Point] {
  const delta = sub(b.center, a.center);
  const distance = length(delta);
  const along =
    (a.radius ** 2 - b.radius ** 2 + distance ** 2) / (2 * distance);
  const height = Math.sqrt(a.radius ** 2 - along ** 2);

  if (!Number.isFinite(height)) {
    throw new Error('Construction circles do not intersect.');
  }
  const direction = unit(delta);
  const [dx, dy] = direction;
  const middle = add(a.center, scale(direction, along));
  const normal: Point = [-dy * height, dx * height];

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
const [lastTipX, lastTipY] = lastTip;
const [, lastTopY] = lastTop.center;
// 最外层圆经过 lastTip，并与竖直线 x=118 相切。
const lastY = lastTopY - Math.sqrt(lastTop.radius ** 2 - (118 - 132) ** 2);
const lastX =
  (118 ** 2 - lastTipX ** 2 - (lastTipY - lastY) ** 2) / (2 * (118 - lastTipX));
const last = circle([lastX, lastY], 118 - lastX);

function verticalCorner(c: Circle, x: number, side: number): Corner {
  const [centerX, centerY] = c.center;
  const cx = x + side * radius;
  const cy =
    centerY - Math.sqrt((c.radius - radius) ** 2 - (cx - centerX) ** 2);
  const center: Point = [cx, cy];

  return { center, radius, contacts: [[x, cy], project(c, center)] };
}

const c1 = verticalCorner(left, 12, 1);
const c2 = verticalCorner(middleTop, 99, -1);
const [c3Center] = intersections(
  circle(left.center, leftGap.radius + radius),
  circle(middleTop.center, middleTop.radius - radius),
).sort(([, ay], [, by]) => ay - by);
const c3: Corner = {
  center: c3Center,
  radius,
  contacts: [project(leftGap, c3Center), project(middleTop, c3Center)],
};
const [c4Center] = intersections(
  circle(lastTop.center, lastTop.radius - radius),
  circle(last.center, last.radius - radius),
).sort((a, b) => length(sub(a, [116, 50])) - length(sub(b, [116, 50])));
const c4: Corner = {
  center: c4Center,
  radius,
  contacts: [project(lastTop, c4Center), project(last, c4Center)],
};
const c5 = verticalCorner(lastTop, 104, 1);
// 左下角圆弧连接竖直线 x=12 与经过 (12, 75) 和 leftTip 的直线。
const [bottomX, bottomY] = unit(sub(leftTip, [12, 75]));
const foldCenter: Point = [22, 75 + (bottomY / bottomX) * 10 - 10 / bottomX];
const [, foldY] = foldCenter;
const foldTouch = add(foldCenter, [-bottomY * 10, bottomX * 10]);
const fold: Corner = {
  center: foldCenter,
  radius: 10,
  contacts: [foldTouch, [12, foldY]],
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

const [c1Line, c1Arc] = c1.contacts;
const [c2Line, c2Arc] = c2.contacts;
const [c3Left, c3Top] = c3.contacts;
const [c4Top, c4Side] = c4.contacts;
const [c5Line, c5Arc] = c5.contacts;
const [, foldLine] = fold.contacts;
const firstPath = String(
  new Outline(c1Arc)
    .arc(left, [65, 80])
    .line(leftTip)
    .line(foldTouch)
    .arc(fold, foldLine)
    .line(c1Line)
    .arc(c1, c1Arc),
);
const middlePath = String(
  new Outline(c3Top)
    .arc(middleTop, c2Arc)
    .arc(c2, c2Line)
    .line([99, 62])
    .arc(middle, middleTip)
    .line([70, 80])
    .arc(leftGap, c3Left, 0)
    .arc(c3, c3Top),
);
const lastPath = String(
  new Outline(c5Arc)
    .arc(lastTop, c4Top)
    .arc(c4, c4Side)
    .arc(last, lastTip)
    .arc(middleGap, [104, 62], 0)
    .line(c5Line)
    .arc(c5, c5Arc),
);
const paths = [firstPath, middlePath, lastPath];
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
        ({ center: [x, y], radius }) =>
          `<circle cx="${number(x)}" cy="${number(y)}" r="${number(radius)}"/>`,
      )
      .join('\n'),
    '<path d="M-75 80H185 M12 10V115 M65 80V120 M70 80V120 M99 22V62 M104 54V62" stroke-dasharray="1.5 2"/>',
    '</g>',
    outlines,
    '<g class="round" fill="none" stroke-width=".45">',
    corners
      .map(
        ({ center: [x, y], radius }) =>
          `<circle cx="${number(x)}" cy="${number(y)}" r="${radius}"/>`,
      )
      .join('\n'),
    '</g>',
    (
      [
        [left, [-14, 7]],
        [middleTop, [5, 8]],
        [middle, [-16, 5]],
        [lastTop, [4, 7]],
        [last, [-16, -4]],
      ] satisfies [Circle, Point][]
    )
      .map(
        (
          [
            {
              center: [x, y],
            },
            [dx, dy],
          ],
          i,
        ) => {
          return `<path class="guide" d="M${point([x - 2, y])}h4 M${point([x, y - 2])}v4" fill="none" stroke-width=".6"/>\n<text class="label" x="${number(x + dx)}" y="${number(y + dy)}" font-size="7">O${i + 1}</text>`;
        },
      )
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
const detail = drawing(
  '0 0 640 450',
  'Phyllo: tangent circles',
  'Corners 1 to 5 use radius 1.5. Turn 6 uses radius 10. Each panel has its own magnification. Orange dots mark tangent contacts. Gray lines are tangents, and dashed orange lines are radii.',
  [
    '<rect class="background" width="640" height="450"/>',
    (
      [
        [c1, [14, 8], firstPath],
        [c2, [224, 8], middlePath],
        [c3, [434, 8], middlePath],
        [c4, [14, 228], lastPath],
        [c5, [224, 228], lastPath],
        [fold, [434, 228], firstPath],
      ] satisfies [Corner, Point, string][]
    )
      .map(([c, [x, y], path], i) => {
        const [cx, cy] = c.center;
        const extent = c.radius * 3.6;
        const stroke = c.radius / 22;

        return [
          `<svg x="${x}" y="${y}" width="192" height="176" viewBox="${number(cx - extent)} ${number(cy - extent * 0.92)} ${number(extent * 2)} ${number(extent * 1.83333)}" overflow="hidden">`,
          `<path class="sheet" d="${path}"/>`,
          `<path class="outline" d="${path}" fill="none" stroke-width="${number(stroke)}"/>`,
          `<circle class="round" cx="${number(cx)}" cy="${number(cy)}" r="${c.radius}" fill="none" stroke-width="${number(stroke)}"/>`,
          c.contacts
            .map(p => {
              const [nx, ny] = unit(sub(p, c.center));
              const [px, py] = p;
              const tangent: Point = [
                -ny * c.radius * 2.5,
                nx * c.radius * 2.5,
              ];

              return [
                `<path class="guide" d="M${point(sub(p, tangent))} L${point(add(p, tangent))}" fill="none" stroke-width="${number(stroke * 0.65)}"/>`,
                `<path class="round" d="M${point(c.center)} L${point(p)}" fill="none" stroke-width="${number(stroke * 0.65)}" stroke-dasharray="${number(stroke * 2)} ${number(stroke * 2)}"/>`,
                `<circle class="contact" cx="${number(px)}" cy="${number(py)}" r="${number(stroke * 1.4)}"/>`,
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
