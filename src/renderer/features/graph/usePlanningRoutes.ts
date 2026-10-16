import { useEffect, useRef, useState } from 'react';
import type { Route, RoutingInput } from './routing';
export function usePlanningRoutes(input: Omit<RoutingInput, 'version'>) {
  const [routes, setRoutes] = useState<Record<string, Route>>({});
  const version = useRef(0);
  useEffect(() => {
    const worker = new Worker(new URL('./routing.worker.ts', import.meta.url), { type: 'module' });
    const current = ++version.current;
    setRoutes({});
    worker.onmessage = (event: MessageEvent<{ version: number; routes: Route[] }>) => {
      if (event.data.version !== version.current) return;
      setRoutes((existing) => ({
        ...existing,
        ...Object.fromEntries(event.data.routes.map((route) => [route.id, route])),
      }));
    };
    worker.postMessage({ ...input, version: current });
    return () => worker.terminate();
  }, [input]);
  return routes;
}
