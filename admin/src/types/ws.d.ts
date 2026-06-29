// The `ws` package ships no bundled types and @types/ws isn't installed.
// We only use it (cast to the DOM `WebSocket` type) as a Node<22 fallback in comfyui/client.ts,
// so an `any` module declaration is sufficient.
declare module "ws";
