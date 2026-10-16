import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createProject } from '../packages/create-phyllo/src/project';

/**
 * 验证站点模板能在使用者的独立工程中通过类型检查：
 *
 * - 模板自带 Bun、MDX 与 phyllo/client 类型配置；
 * - 生成的 .phyllo 声明被 tsconfig 加载；
 * - frontmatter 与默认组件可以同时导入，组件可用于 JSX，components 参数类型正确。
 *
 * 需要安装依赖与运行编译器，按项目规范放在独立脚本中执行。
 */
const root = await mkdtemp(join(tmpdir(), 'phyllo-site-template-'));

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
  const site = join(root, 'site');
  const repo = join(import.meta.dir, '..');

  await createProject(site, 'phyllo-theme-docs');

  // 生成的工程使用工作区中的包；含 workspace 协议的包改为安装后手动链接。
  const manifestPath = join(site, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

  delete manifest.dependencies.phyllo;
  delete manifest.dependencies['phyllo-theme-docs'];
  delete manifest.devDependencies['@phyllo/cli'];
  delete manifest.devDependencies['@phyllo/core'];
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  // 类型检查用例：同时导入默认组件与 frontmatter，并使用 components 参数。
  await writeFile(
    join(site, 'content/check.tsx'),
    [
      "import Content, { frontmatter } from './index.mdx';",
      '',
      'export const element = <Content components={{ h1: "h2" }} />;',
      '',
      'export const title: unknown = frontmatter.title;',
      '',
    ].join('\n'),
  );

  await run(['bun', 'install'], site);

  // 安装后链接仓库中的 phyllo 与 core，供声明与配置导入使用。
  await symlink(
    join(repo, 'packages/phyllo'),
    join(site, 'node_modules/phyllo'),
  );
  await mkdir(join(site, 'node_modules/@phyllo'), { recursive: true });

  await symlink(
    join(repo, 'packages/core'),
    join(site, 'node_modules/@phyllo/core'),
  );

  await run(['bun', join(repo, 'packages/cli/src/index.ts'), 'sync'], site);
  await run(['bun', 'x', 'tsc', '--noEmit', '--skipLibCheck', 'false'], site);

  console.log(
    '站点模板通过独立工程类型检查：声明加载、MDX 组件与 frontmatter 同时可用',
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
