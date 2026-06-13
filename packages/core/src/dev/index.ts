import { argv, file, spawn, write } from 'bun';
import { join, resolve } from 'node:path';

/**
 * 开发服务器选项。
 */
export interface DevOptions {
  /** 监听端口，默认为 3000。 */
  port?: number;
  /** 监听地址，默认为 localhost。 */
  hostname?: string;
}

/**
 * 启动开发服务器进程。
 *
 * @param directory - 站点根目录，默认为当前目录。
 * @param options - 开发服务器选项。
 * @returns 开发服务器的地址、退出状态与停止方法。
 * @throws 站点缺少配置文件时抛出错误。
 */
export async function dev(directory = '.', options: DevOptions = {}) {
  const root = resolve(directory);
  const config = join(root, 'phyllo.config.ts');

  if (!(await file(config).exists())) {
    throw new Error(`Missing ${config}. Run phyllo init first.`);
  }
  const bunfig = join(root, '.phyllo', 'bunfig.toml');
  const serverEntry = join(import.meta.dir, 'server.ts');

  /*
   * Bun 目前只能通过 bunfig.toml 的 [serve.static] 给开发服务器加载静态插件，
   * 运行时注册的插件拿不到 HTML 打包流程。
   * 这是 Bun 的加载方式限制，不是缺陷：子进程不会读取站点自己的 bunfig.toml，
   * 因此站点的 preload 等设置不会生效。
   * 上游 issue：https://github.com/oven-sh/bun/issues/19561
   * 修复后可以直接在当前进程注册插件，删除这里的 bunfig 与子进程。
   */
  await write(
    bunfig,
    ['[serve.static]', `plugins = [${JSON.stringify(serverEntry)}]`, ''].join(
      '\n',
    ),
  );

  const ready = Promise.withResolvers<URL>();
  const [executable] = argv;
  /** 是否已经请求停止开发服务器。 */
  const shutdown = { requested: false };

  const child = spawn(
    [
      executable!,
      `--config=${bunfig}`,
      serverEntry,
      root,
      JSON.stringify(options),
    ],
    {
      cwd: root,
      stdout: 'inherit',
      stderr: 'inherit',
      ipc(message) {
        if (typeof message === 'string') {
          ready.resolve(new URL(message));
        }
      },
    },
  );
  const exited = child.exited.then(code => {
    if (!shutdown.requested) {
      ready.reject(new Error(`Development server exited (${code}).`));
    }
    return code;
  });

  return {
    url: await ready.promise,
    exited,
    async stop() {
      shutdown.requested = true;
      child.kill('SIGTERM');
      await exited;
    },
  };
}
