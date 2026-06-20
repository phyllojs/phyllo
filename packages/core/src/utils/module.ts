import { build, hash } from 'bun';
import { isAbsolute, resolve } from 'node:path';

/**
 * 从 Blob 导入模块。
 *
 * @typeParam T - 模块导出对象的类型。
 * @param bundle - 包含模块代码的 Blob。
 * @returns 模块的导出对象。
 */
export async function importBundle<T = Record<string, unknown>>(
  bundle: Blob,
): Promise<T> {
  const url = URL.createObjectURL(bundle);

  try {
    return (await import(url)) as T;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * 打包并导入配置文件。
 *
 * @param entry - 配置文件路径。
 * @returns 配置文件的导出内容、内容哈希与打包输入路径。
 * @throws 打包失败时抛出 `AggregateError`，错误信息包含入口路径。
 */
export async function importFresh(entry: string) {
  const result = await build({
    entrypoints: [entry],
    target: 'bun',
    jsx: { runtime: 'automatic', importSource: 'react' },
    metafile: true,
  });

  if (!result.success) {
    throw new AggregateError(result.logs, `Failed to load ${entry}`);
  }
  const [bundle] = result.outputs;

  if (!bundle) {
    throw new Error(`No build output while loading ${entry}.`);
  }
  /*
   * 元数据输入以本次打包的工作目录为基准；配置执行可能改变工作目录，
   * 因此在执行前转换为绝对路径，后续校验不再依赖当时的 cwd。
   */
  const inputs = Object.keys(result.metafile?.inputs ?? {}).map(input =>
    isAbsolute(input) ? input : resolve(input),
  );

  return {
    exports: await importBundle(bundle),
    hash: hash(await bundle.arrayBuffer()).toString(),
    inputs,
  };
}
