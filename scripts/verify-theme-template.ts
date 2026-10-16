import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createTheme } from '../packages/create-phyllo/src/theme';

/**
 * 验证主题模板能在使用者的独立工程中通过类型检查。
 *
 * 模板自带 Bun 类型与开发类型依赖，不依赖仓库根目录的 tsconfig 或已安装依赖；
 * 检查使用生成后的工程实际安装并运行 `tsc --noEmit`。
 *
 * 需要安装依赖与运行编译器，按项目规范放在独立脚本中执行。
 */
const root = await mkdtemp(join(tmpdir(), 'phyllo-theme-template-'));

/**
 * 运行命令并返回标准输出。
 *
 * @param command - 命令与参数。
 * @param cwd - 工作目录。
 * @returns 命令的标准输出。
 * @throws 命令退出码非零时抛出错误。
 */
async function run(command: string[], cwd: string) {
  const result = Bun.spawn(command, {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(result.stdout).text(),
    new Response(result.stderr).text(),
    result.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(
      `${command.join(' ')} 失败（退出码 ${exitCode}）：\n${stdout}${stderr}`,
    );
  }
  return stdout;
}

try {
  const theme = join(root, 'theme');

  await createTheme(theme, 'phyllo-theme-probe');

  // 生成的工程使用工作区中的 phyllo，其余依赖按模板声明独立安装。
  const manifestPath = join(theme, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

  manifest.devDependencies.phyllo = `file:${join(import.meta.dir, '../packages/phyllo')}`;
  manifest.devDependencies.react = manifest.peerDependencies.react;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  await run(['bun', 'install'], theme);
  await run(['bun', 'run', 'typecheck'], theme);

  console.log('主题模板通过独立工程类型检查：Bun 类型与开发依赖齐备');
} finally {
  await rm(root, { recursive: true, force: true });
}
