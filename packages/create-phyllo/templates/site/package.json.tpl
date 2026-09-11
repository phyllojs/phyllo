{
  "name": "__NAME__",
  "private": true,
  "type": "module",
  "workspaces": ["themes/*"],
  "scripts": {
    "dev": "phyllo dev",
    "build": "phyllo build",
    "sync": "phyllo sync",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "phyllo": "^0.1.0",
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
    "__THEME__": "__THEME_VERSION__"
  },
  "devDependencies": {
    "@phyllo/cli": "^0.1.0",
    "@phyllo/core": "^0.1.0",
    "@types/bun": "^1.4.0",
    "@types/mdx": "^2.0.14",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "typescript": "^6.0.3"
  },
  "devEngines": __DEV_ENGINES__
}
