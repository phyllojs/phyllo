import type { Resources } from 'phyllo';
import { runWithPage } from 'phyllo/page';

import { app } from './app';
import { createRenderer } from __RUNTIME__;
__PAGE_IMPORTS__
export { renderRedirect } from __RUNTIME__;

const renderPage = createRenderer(app, {
__COMPONENTS__
});

export const render = (url: string, resources: Resources) =>
  runWithPage(app.getPage(url)!, () => renderPage(url, resources));
