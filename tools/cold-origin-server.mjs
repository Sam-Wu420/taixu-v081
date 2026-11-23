import { createServer as createHttpServer } from 'node:http';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const firstPort = Number(process.argv[2] ?? 5235);
if (!Number.isInteger(firstPort) || firstPort < 1024 || firstPort > 65531) throw new Error('首端口需为 1024 至 65531 的整数');
const vite = await createServer({
  configFile: resolve('tools/perf-vite.config.ts'),
  server: { middlewareMode: true, hmr: false, watch: null },
});
const servers = Array.from({ length: 5 }, (_, i) => {
  const server = createHttpServer(vite.middlewares), port = firstPort + i;
  server.listen(port, '127.0.0.1', () => {
    console.log(`http://127.0.0.1:${port}/tools/perf-cold.html?auto=new&hd2d=1&fresh=1`);
  });
  return server;
});
process.once('SIGINT', async () => {
  for (const server of servers) server.close();
  await vite.close();
});
