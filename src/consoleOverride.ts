// Override non-error console methods in production-like environments
(() => {
  try {
    const noop = () => {};
    const globalConsole: Console = console;

    // Keep console.error; silence others
    globalConsole.log = noop as any;
    globalConsole.info = noop as any;
    globalConsole.debug = noop as any;
    globalConsole.trace = noop as any;
    globalConsole.warn = noop as any;
  } catch {
    // ignore
  }
})();


