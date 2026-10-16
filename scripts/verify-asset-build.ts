import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { contentPlugin } from '../packages/core/src/build/plugin';
import { createCompiler } from '../packages/core/src/content/compile';

import { verifyProject } from './verify-project';

/**
 * 验证同一张图片同时被 JS 导入和 CSS url() 引用时，浏览器构建仍然成功。
 *
 * JS 包装模块与 CSS 引用的原文件不能共用模块身份，否则 CSS 会拿到 JS 模块。
 */
const root = await mkdtemp(join(tmpdir(), 'phyllo-asset-build-'));

try {
  const svg = join(root, 'icon.svg');
  const theme = join(root, 'theme.tsx');
  const style = join(root, 'style.css');
  const entry = join(root, 'entry.ts');

  await mkdir(join(root, 'content'), { recursive: true });

  await writeFile(
    svg,
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>\n',
  );

  await writeFile(
    theme,
    "import icon from './icon.svg';\n\nexport const iconUrl = icon;\n",
  );
  await writeFile(style, ".icon { background-image: url('./icon.svg'); }\n");

  await writeFile(
    entry,
    "import './style.css';\nimport { iconUrl } from './theme';\n\nexport { iconUrl };\n",
  );

  const project = verifyProject(root);
  const files = new Map<string, Blob | string>();
  const result = await Bun.build({
    entrypoints: [entry],
    target: 'browser',
    outdir: join(root, 'out'),
    plugins: [
      contentPlugin({ project, compile: createCompiler(project), files }),
    ],
  });

  if (!result.success) {
    throw new AggregateError(result.logs, 'Asset build failed.');
  }
  const [emitted] = [...files.keys()].filter(path =>
    path.startsWith('_phyllo/media/'),
  );

  if (!emitted) {
    throw new Error('The imported asset was not emitted.');
  }
  console.log(`JS 与 CSS 共用资源构建通过：${emitted}`);
} finally {
  await rm(root, { recursive: true, force: true });
}
