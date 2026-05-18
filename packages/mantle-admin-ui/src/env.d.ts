declare const __MANTLE_VERSION__: string;

// Side-effect CSS imports (`import "./styles/index.css"`) — Vite
// handles these by injecting the stylesheet into the bundle.
// TypeScript 6 requires an ambient module declaration before it
// will accept them; 5.x was more permissive.
declare module "*.css";
