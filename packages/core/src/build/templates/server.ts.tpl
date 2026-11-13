import { app } from './app';
import { createRenderer } from __RUNTIME__;
__PAGE_IMPORTS__

export const render = createRenderer(app, {
__COMPONENTS__
});
