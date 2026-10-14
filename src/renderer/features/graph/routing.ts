export interface Point {
  x: number;
  y: number;
}
export interface Rect extends Point {
  width: number;
  height: number;
}
export interface RoutingInput {
  version: number;
  nodes: Array<Rect & { id: string }>;
  edges: Array<{ id: string; fromId: string; toId: string; label?: string }>;
  maxStates?: number;
}
export interface Route {
  id: string;
  points: Point[];
  labelPosition?: Point;
  labelBounds?: Rect;
  status: 'ready' | 'blocked' | 'budget';
}
export interface RoutingResult {
  version: number;
  routes: Route[];
}
export function displayRouteLabel(label: string) {
  const characters = [...label];
  return characters.length > 24 ? characters.slice(0, 23).join('') + '…' : label;
}
const step = 12,
  margin = 16,
  bucketSize = 96;
export function segmentIntersectsRect(a: Point, b: Point, r: Rect) {
  if (a.x === b.x)
    return (
      a.x >= r.x &&
      a.x <= r.x + r.width &&
      Math.max(a.y, b.y) >= r.y &&
      Math.min(a.y, b.y) <= r.y + r.height
    );
  if (a.y === b.y)
    return (
      a.y >= r.y &&
      a.y <= r.y + r.height &&
      Math.max(a.x, b.x) >= r.x &&
      Math.min(a.x, b.x) <= r.x + r.width
    );
  return true;
}
export function retargetRoute(
  route: Route,
  fromId: string,
  toId: string,
  nodes: RoutingInput['nodes'],
): Route | undefined {
  if (route.status !== 'ready') return route;
  const source = nodes.find((node) => node.id === fromId);
  const target = nodes.find((node) => node.id === toId);
  if (!source || !target || route.points.length < 2) return;
  const start = { x: source.x + source.width, y: source.y + source.height / 2 };
  const end = { x: target.x, y: target.y + target.height / 2 };
  const previousStart = route.points[0];
  const previousEnd = route.points[route.points.length - 1];
  let points = route.points;
  if (
    start.x !== previousStart.x ||
    start.y !== previousStart.y ||
    end.x !== previousEnd.x ||
    end.y !== previousEnd.y
  ) {
    const inner = route.points.slice(1, -1);
    if (inner.length) {
      points = simplify([
        start,
        { x: inner[0].x, y: start.y },
        ...inner,
        { x: inner[inner.length - 1].x, y: end.y },
        end,
      ]);
    } else {
      const x = start.x + margin + step;
      points = simplify([start, { x, y: start.y }, { x, y: end.y }, end]);
    }
  }
  if (points[1].x < start.x || points[points.length - 2].x > end.x) return;
  const obstacles = nodes.map((node) => ({
    ...node,
    x: node.x - margin,
    y: node.y - margin,
    width: node.width + margin * 2,
    height: node.height + margin * 2,
  }));
  for (let index = 1; index < points.length; index++) {
    const ignored = [index === 1 ? fromId : '', index === points.length - 1 ? toId : ''];
    if (
      obstacles.some(
        (rect) =>
          !ignored.includes(rect.id) &&
          segmentIntersectsRect(points[index - 1], points[index], rect),
      )
    )
      return;
  }
  const label = route.labelBounds;
  const labelSafe =
    !label ||
    !obstacles.some(
      (rect) =>
        label.x < rect.x + rect.width &&
        label.x + label.width > rect.x &&
        label.y < rect.y + rect.height &&
        label.y + label.height > rect.y,
    );
  return { ...route, points, labelPosition: labelSafe ? route.labelPosition : undefined };
}
function simplify(points: Point[]) {
  const out: Point[] = [];
  for (const p of points) {
    if (out.at(-1)?.x === p.x && out.at(-1)?.y === p.y) continue;
    while (out.length > 1) {
      const a = out[out.length - 2],
        b = out[out.length - 1];
      if ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)) out.pop();
      else break;
    }
    out.push(p);
  }
  return out;
}
interface State extends Point {
  direction: number;
  g: number;
  f: number;
  key: string;
  parent?: string;
}
class Heap {
  private items: State[] = [];
  get length() {
    return this.items.length;
  }
  push(value: State) {
    const a = this.items;
    a.push(value);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent].f <= value.f) break;
      a[i] = a[parent];
      i = parent;
    }
    a[i] = value;
  }
  pop() {
    const a = this.items,
      first = a[0],
      last = a.pop()!;
    if (a.length) {
      let i = 0;
      while (i * 2 + 1 < a.length) {
        let c = i * 2 + 1;
        if (c + 1 < a.length && a[c + 1].f < a[c].f) c++;
        if (last.f <= a[c].f) break;
        a[i] = a[c];
        i = c;
      }
      a[i] = last;
    }
    return first;
  }
}
export function* routeBatch(input: RoutingInput): Generator<Route> {
  const valid = input.nodes.filter(
    (n) => [n.x, n.y, n.width, n.height].every(Number.isFinite) && n.width > 0 && n.height > 0,
  );
  const nodes = new Map(valid.map((n) => [n.id, n]));
  const obstacles = valid.map((n) => ({
    ...n,
    x: n.x - margin,
    y: n.y - margin,
    width: n.width + margin * 2,
    height: n.height + margin * 2,
  }));
  const buckets = new Map<string, typeof obstacles>();
  for (const rect of obstacles)
    for (
      let x = Math.floor(rect.x / bucketSize);
      x <= Math.floor((rect.x + rect.width) / bucketSize);
      x++
    )
      for (
        let y = Math.floor(rect.y / bucketSize);
        y <= Math.floor((rect.y + rect.height) / bucketSize);
        y++
      ) {
        const key = `${x}:${y}`;
        buckets.set(key, [...(buckets.get(key) || []), rect]);
      }
  const clear = (a: Point, b: Point, ignore?: string | string[]) => {
    const ignored = Array.isArray(ignore) ? ignore : [ignore];
    const checked = new Set<string>();
    for (
      let x = Math.floor(Math.min(a.x, b.x) / bucketSize);
      x <= Math.floor(Math.max(a.x, b.x) / bucketSize);
      x++
    )
      for (
        let y = Math.floor(Math.min(a.y, b.y) / bucketSize);
        y <= Math.floor(Math.max(a.y, b.y) / bucketSize);
        y++
      )
        for (const r of buckets.get(`${x}:${y}`) || []) {
          if (ignored.includes(r.id) || checked.has(r.id)) continue;
          checked.add(r.id);
          if (segmentIntersectsRect(a, b, r)) return false;
        }
    return true;
  };
  const occupied = new Map<string, number>();
  const labels: Rect[] = [];
  for (const edge of input.edges) {
    const source = nodes.get(edge.fromId),
      target = nodes.get(edge.toId);
    const failure = (status: Route['status']): Route => ({ id: edge.id, status, points: [] });
    if (!source || !target) {
      yield failure('blocked');
      continue;
    }
    const start = { x: source.x + source.width, y: source.y + source.height / 2 },
      end = { x: target.x, y: target.y + target.height / 2 };
    const a = {
      x: Math.ceil((start.x + margin + step) / step) * step,
      y: Math.round(start.y / step) * step,
    };
    const b = {
      x: Math.floor((end.x - margin - step) / step) * step,
      y: Math.round(end.y / step) * step,
    };
    const startBend = { x: a.x, y: start.y },
      endBend = { x: b.x, y: end.y };
    if (
      !clear(start, startBend, source.id) ||
      !clear(startBend, a, source.id) ||
      !clear(b, endBend, target.id) ||
      !clear(endBend, end, target.id)
    ) {
      yield failure('blocked');
      continue;
    }
    let remaining = Math.min(50000, Math.max(1, input.maxStates ?? 50000));
    const search = (padding: number): { points?: Point[]; status: 'blocked' | 'budget' } => {
      const minX = Math.min(a.x, b.x, ...obstacles.map((r) => r.x)) - padding,
        maxX = Math.max(a.x, b.x, ...obstacles.map((r) => r.x + r.width)) + padding;
      const minY = Math.min(a.y, b.y, ...obstacles.map((r) => r.y)) - padding,
        maxY = Math.max(a.y, b.y, ...obstacles.map((r) => r.y + r.height)) + padding;
      const heap = new Heap(),
        best = new Map<string, State>(),
        closed = new Set<string>();
      const initial: State = {
        ...a,
        direction: 0,
        g: 0,
        f: Math.abs(a.x - b.x) + Math.abs(a.y - b.y),
        key: `${a.x}:${a.y}:0`,
      };
      heap.push(initial);
      best.set(initial.key, initial);
      while (heap.length) {
        const current = heap.pop();
        if (closed.has(current.key) || best.get(current.key) !== current) continue;
        closed.add(current.key);
        if (--remaining < 0) return { status: 'budget' };
        if (current.x === b.x && current.y === b.y) {
          const points: Point[] = [];
          let item: State | undefined = current;
          while (item) {
            points.push({ x: item.x, y: item.y });
            item = item.parent ? best.get(item.parent) : undefined;
          }
          return { points: points.reverse(), status: 'blocked' };
        }
        for (const [direction, delta] of [
          [step, 0],
          [-step, 0],
          [0, step],
          [0, -step],
        ].entries()) {
          const next = { x: current.x + delta[0], y: current.y + delta[1] };
          if (
            next.x < minX ||
            next.x > maxX ||
            next.y < minY ||
            next.y > maxY ||
            !clear(current, next)
          )
            continue;
          const key = `${next.x}:${next.y}:${direction}`,
            g =
              current.g +
              step +
              (current.direction === direction ? 0 : 20) +
              (occupied.get(`${next.x}:${next.y}`) || 0) * 24;
          if (closed.has(key) || (best.get(key)?.g ?? Infinity) <= g) continue;
          const state: State = {
            ...next,
            direction,
            g,
            f: g + Math.abs(next.x - b.x) + Math.abs(next.y - b.y),
            key,
            parent: current.key,
          };
          best.set(key, state);
          heap.push(state);
        }
      }
      return { status: 'blocked' };
    };
    let found = search(96);
    if (!found.points && found.status === 'blocked' && remaining > 0) found = search(288);
    if (!found.points) {
      yield failure(found.status);
      continue;
    }
    const points = simplify([start, startBend, ...found.points, endBend, end]);
    let validPath = true;
    for (let i = 1; i < points.length; i++) {
      const ignore = [i === 1 ? source.id : '', i === points.length - 1 ? target.id : ''];
      if (!clear(points[i - 1], points[i], ignore)) {
        validPath = false;
        break;
      }
    }
    if (!validPath) {
      yield failure('blocked');
      continue;
    }
    for (const p of found.points) {
      const key = `${p.x}:${p.y}`;
      occupied.set(key, (occupied.get(key) || 0) + 1);
    }
    let labelPosition: Point | undefined;
    let labelBounds: Rect | undefined;
    if (edge.label) {
      const width = [...displayRouteLabel(edge.label)].reduce(
          (total, character) => total + (character.codePointAt(0)! > 255 ? 12 : 7),
          20,
        ),
        height = 26;
      const segments = points
        .slice(1)
        .map((to, i) => ({
          from: points[i],
          to,
          length: Math.abs(to.x - points[i].x) + Math.abs(to.y - points[i].y),
        }))
        .sort((a, b) => b.length - a.length);
      outer: for (const segment of segments)
        for (const fraction of [0.5, 0.3, 0.7]) {
          const p = {
            x: segment.from.x + (segment.to.x - segment.from.x) * fraction,
            y: segment.from.y + (segment.to.y - segment.from.y) * fraction,
          };
          const rect = { x: p.x - width / 2, y: p.y - height / 2, width, height };
          if (
            ![...obstacles, ...labels].some(
              (r) =>
                rect.x < r.x + r.width &&
                rect.x + rect.width > r.x &&
                rect.y < r.y + r.height &&
                rect.y + rect.height > r.y,
            )
          ) {
            labelPosition = p;
            labelBounds = rect;
            labels.push(rect);
            break outer;
          }
        }
    }
    yield { id: edge.id, points, labelPosition, labelBounds, status: 'ready' };
  }
}
export function routeEdges(input: RoutingInput): RoutingResult {
  return { version: input.version, routes: [...routeBatch(input)] };
}
