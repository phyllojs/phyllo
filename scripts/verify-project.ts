import { join } from 'node:path';

import type { Project } from '../packages/core/src/config/project';

/**
 * 验证脚本使用的最小工程信息。
 *
 * @param root - 临时站点根目录。
 * @returns 补齐默认值的工程信息。
 */
export function verifyProject(root: string): Project {
  return {
    root,
    content: join(root, 'content'),
    outdir: join(root, 'dist'),
    workDir: join(root, '.phyllo'),
    configHash: 'verify',
    head: [],
    config: {
      theme: 'phyllo-theme-verify',
      content: 'content',
      outdir: 'dist',
      head: {},
      redirects: {},
      search: false,
      markdown: { highlight: false, remarkPlugins: [], rehypePlugins: [] },
    },
  };
}
