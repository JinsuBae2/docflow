import { routeBatch, type RoutingInput, type Route } from './routing';
let latest = 0;
self.onmessage = (event: MessageEvent<RoutingInput>) => {
  latest = event.data.version;
  void calculate(event.data);
};
async function calculate(input: RoutingInput) {
  const chunk: Route[] = [];
  try {
    for (const route of routeBatch(input)) {
      if (latest !== input.version) return;
      chunk.push(route);
      if (chunk.length === 8) {
        self.postMessage({ version: input.version, routes: chunk.splice(0), done: false });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    if (latest === input.version)
      self.postMessage({ version: input.version, routes: chunk, done: true });
  } catch {
    if (latest === input.version)
      self.postMessage({
        version: input.version,
        routes: [],
        done: true,
        error: '경로 계산을 완료하지 못했습니다.',
      });
  }
}
