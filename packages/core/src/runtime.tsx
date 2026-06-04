import type { Resources } from 'phyllo';
import { type SiteApp, HeadResources } from 'phyllo/render';
import type { ComponentType } from 'react';
import { renderToString } from 'react-dom/server';

/**
 * 创建服务端渲染器。
 *
 * @param app - 站点应用。
 * @param components - 页面地址到内容组件的映射。
 * @returns 把页面渲染为完整 HTML 的函数。
 */
export function createRenderer(
  app: SiteApp,
  components: Record<string, ComponentType>,
) {
  const { App } = app;

  return async (url: string, resources: Resources) => {
    resources.elements = undefined;

    const output = renderToString(App({ Content: components[url], resources }));
    const elements: NonNullable<Resources['elements']> = [];

    await new HTMLRewriter()
      .on('html', {
        element() {
          elements.push('html');
        },
      })
      .on('head', {
        element() {
          elements.push('head');
        },
      })
      .on('body', {
        element() {
          elements.push('body');
        },
      })
      .transform(new Response(output))
      .text();

    resources.elements = elements;

    // 返回局部片段或空内容、没有 <head> 的主题，在内容前输出资源，
    // 浏览器会把它们解析到 <head> 中。

    if (!elements.includes('head')) {
      return (
        '<!doctype html>\n' +
        renderToString(<HeadResources resources={resources} />) +
        output
      );
    }
    // 渲染 <html> 或 <head> 的主题必须在 <head> 中渲染 HeadResources，
    // 否则客户端接管时无法得到与服务端一致的资源树。

    if (!output.includes('id="phyllo-resources"')) {
      throw new Error(
        'The theme output has no <HeadResources />. Themes that render <html> or <head> must render <HeadResources /> from phyllo inside <head>.',
      );
    }

    return (
      '<!doctype html>\n' +
      (await new HTMLRewriter()
        .on('script#phyllo-resources', {
          element(element) {
            element.setInnerContent(
              JSON.stringify(resources).replace(/</g, '\\u003c'),
              { html: true },
            );
          },
        })
        .transform(new Response(output))
        .text())
    );
  };
}

/**
 * 生成带 meta refresh 的跳转页，构建产物直接输出，不经过主题。
 *
 * @param destination - 跳转目标地址。
 * @returns 跳转页的完整 HTML。
 */
export function renderRedirect(destination: string) {
  const page = (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="refresh" content={`0;url=${destination}`} />
        <link rel="canonical" href={destination} />
        <title>Redirect</title>
      </head>
      <body>
        <a href={destination}>{destination}</a>
      </body>
    </html>
  );

  return '<!doctype html>\n' + renderToString(page);
}

/**
 * 生成的服务端入口导出的渲染函数。
 */
export interface RenderRuntime {
  /** 把页面渲染为完整 HTML。 */
  render: ReturnType<typeof createRenderer>;
  /** 生成跳转页。 */
  renderRedirect: typeof renderRedirect;
}
