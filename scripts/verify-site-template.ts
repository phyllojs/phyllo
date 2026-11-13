import { Glob } from 'bun';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { createProject } from '../packages/create-phyllo/src/project';

/**
 * 验证实际发布包和站点模板能在使用者的独立工程中安装、检查与构建：
 *
 * - 模板自带 Bun、MDX 与 phyllo/client 类型配置；
 * - 生成的 .phyllo 声明被 tsconfig 加载；
 * - frontmatter 与默认组件可以同时导入，组件可用于 JSX，components 参数类型正确。
 *
 * 安装本地打包产物，避免链接回仓库后混入开发依赖和类型声明。
 * 需要文件与网络 IO，按项目规范放在独立脚本中执行。
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
  const legacyTheme = "phyllo-theme-example's";
  const legacySite = join(root, 'legacy-site');

  await createProject(legacySite, legacyTheme);

  const legacyConfig = await readFile(
    join(legacySite, 'phyllo.config.ts'),
    'utf8',
  );
  const transpiled = new Bun.Transpiler({ loader: 'ts' }).transformSync(
    legacyConfig,
  );
  const legacyManifest = await Bun.file(
    join(legacySite, 'package.json'),
  ).json();

  if (
    !transpiled.includes(legacyTheme) ||
    !legacyManifest.dependencies[legacyTheme]
  ) {
    throw new Error('已有主题包名没有在配置和依赖清单中保持一致。');
  }

  const site = join(root, 'site');
  const repo = join(import.meta.dir, '..');
  const packages: Record<string, string> = {};

  for await (const path of new Glob('{packages,themes}/*/package.json').scan({
    cwd: repo,
  })) {
    const directory = join(repo, dirname(path));
    const { name } = await Bun.file(join(repo, path)).json();
    const archive = join(root, `${name.replace('/', '-')}.tgz`);

    await run(
      ['bun', 'pm', 'pack', '--ignore-scripts', '--filename', archive],
      directory,
    );
    packages[name] = `file:${archive}`;
  }

  await createProject(site, 'phyllo-theme-docs');

  // 直接和间接的工作区依赖均安装打包产物，保留模板声明的版本范围。
  const manifestPath = join(site, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

  manifest.overrides = packages;

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

  await run(['bun', 'run', 'sync'], site);
  await run(['bun', 'x', 'tsc', '--noEmit', '--skipLibCheck', 'false'], site);
  await run(['bun', 'run', 'build'], site);

  console.log(
    '发布包与站点模板通过独立工程验证：本地安装、严格类型检查、声明加载与构建均可用',
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
