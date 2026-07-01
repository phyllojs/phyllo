/**
 * CSS 由 Bun 打包器处理。声明 CSS 模块，使主题和站点可以直接导入样式文件，无需各自的类型声明。
 */
declare module '*.css';

/**
 * 图片由 Phyllo 统一写入构建产物，导入结果是带内容哈希的地址。
 */
declare module '*.avif' {
  const url: string;
  export default url;
}

declare module '*.gif' {
  const url: string;
  export default url;
}

declare module '*.ico' {
  const url: string;
  export default url;
}

declare module '*.jpeg' {
  const url: string;
  export default url;
}

declare module '*.jpg' {
  const url: string;
  export default url;
}

declare module '*.png' {
  const url: string;
  export default url;
}

declare module '*.svg' {
  const url: string;
  export default url;
}

declare module '*.webp' {
  const url: string;
  export default url;
}
