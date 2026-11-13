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
  const { render: renderApp, getPage, runWithPage } = app;

  return async (url: string, input: Resources) => {
    const page = getPage(url);

    if (!page) {
      throw new Error(`Cannot render unknown page: ${url}`);
    }

    return runWithPage(page, async () => {
      const resources: Resources = { ...input, elements: undefined };
      const output = renderToString(
        renderApp({ Content: components[url], resources }),
      );
      const elements: NonNullable<Resources['elements']> = [];

      let hasHeadResources = false;

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
        .on('head script#phyllo-resources[type="application/json"]', {
          element() {
            hasHeadResources = true;
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

      if (!hasHeadResources) {
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
                JSON.stringify({ ...resources, url: page.url }).replace(
                  /</g,
                  '\\u003c',
                ),
                { html: true },
              );
            },
          })
          .transform(new Response(output))
          .text())
      );
    });
  };
}

/**
 * 生成直接导航到目标地址的跳转页，构建产物直接输出，不经过主题。
 *
 * @param destination - 跳转目标地址。
 * @returns 跳转页的完整 HTML。
 */
export function renderRedirect(destination: string) {
  const page = (
    <html>
      <head>
        <meta charSet="utf-8" />
        <script
          dangerouslySetInnerHTML={{
            __html: `location.replace(${JSON.stringify(destination).replace(/</g, '\\u003c')});`,
          }}
        />
        <meta httpEquiv="refresh" content={`0;url=${destination}`} />
        <link rel="canonical" href={destination} />
        <title>Redirect</title>
      </head>
      <body>
        <noscript>
          <a href={destination}>{destination}</a>
        </noscript>
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
}
