import { file, Glob, write } from 'bun';
import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import validate from 'validate-npm-package-name';

/** 模板目录。 */
const TEMPLATE_DIR = join(import.meta.dir, '..', 'templates');

/**
 * 判断名称是否可以创建为新 npm 包。
 *
 * @param name - 待校验的名称。
 * @returns 名称可以创建为新包时为 `true`。
 */
export function isValidPackageName(name: string): boolean {
  return validate(name).validForNewPackages;
}

/**
 * 校验名称是否可以创建为新 npm 包。
 *
 * @param name - 待校验的名称。
 * @throws 名称不合法时抛出错误。
 */
export function validatePackageName(name: string): void {
  const result = validate(name);

  if (!result.validForNewPackages) {
    const reasons = [...(result.errors ?? []), ...(result.warnings ?? [])];

    throw new Error(
      `Use an npm package name, such as phyllo-theme-example or @scope/theme.${
        reasons.length ? ` ${reasons.join('; ')}.` : ''
      }`,
    );
  }
}

/**
 * 确认目标目录可以创建文件。
 *
 * @param directory - 目标目录，不存在时返回其绝对路径。
 * @returns 目标目录的绝对路径。
 * @throws 目录非空时抛出错误。
 */
export async function prepareDirectory(directory: string): Promise<string> {
  const root = resolve(directory);

  try {
    const entries = await readdir(root);

    if (entries.some(entry => entry !== '.git')) {
      throw new Error(`Directory is not empty: ${root}`);
    }
    return root;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return root;
    }
    throw error;
  }
}

/**
 * 序列化 JSON 值，续行保持模板中的两空格缩进。
 *
 * @param value - 待序列化的值。
 * @returns 可直接放入 `.tpl` 模板的 JSON 文本。
 */
export function templateJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replaceAll('\n', '\n  ');
}

/**
 * 用值替换模板中的 `__NAME__` 占位符。
 *
 * @param source - 模板内容。
 * @param values - 占位符名称到文本的映射。
 * @returns 替换后的内容。
 * @throws 模板出现未提供值的占位符时抛出错误。
 */
function fill(source: string, values: Record<string, string>): string {
  return source.replace(/__([A-Z][A-Z_]*)__/g, (_match, name: string) => {
    const value = values[name];

    if (value === undefined) {
      throw new Error(`Unknown template placeholder: ${name}`);
    }
    return value;
  });
}

/**
 * 把内置模板复制到目标目录。
 *
 * @param name - 模板名称。
 * @param root - 目标目录的绝对路径。
 * @param values - `.tpl` 模板的占位符值。
 * @throws `.tpl` 模板出现未提供值的占位符时抛出错误。
 */
export async function copyTemplate(
  name: 'site' | 'theme',
  root: string,
  values: Record<string, string>,
): Promise<void> {
  const template = join(TEMPLATE_DIR, name);

  for await (const path of new Glob('**/*').scan({
    cwd: template,
    dot: true,
  })) {
    const source = file(join(template, path));

    if (path.endsWith('.tpl')) {
      await write(
        join(root, path.replace(/\.tpl$/, '')),
        fill(await source.text(), values),
      );
    } else {
      await write(join(root, path), source);
    }
  }
}
