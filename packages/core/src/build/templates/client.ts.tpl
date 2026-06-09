import { app, configVersion } from './app';
import { startClient } from 'phyllo/render';
__PAGE_IMPORTS__
/** 开发模式构建标识：每次重建变化，促使开发打包器重新打包客户端入口。 */
const buildId = __BUILD_ID__;

void buildId;

const loaders = {
__LOADERS__
};

__START__
