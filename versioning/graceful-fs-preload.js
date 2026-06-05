// Preloaded via NODE_OPTIONS (see package.json "build") so the WHOLE process is
// resilient to EMFILE ("too many open files") when Docusaurus loads many doc
// versions concurrently on hosts with a low file-descriptor ulimit (macOS
// defaults to 256; some Linux CI to 1024-4096). With 70+ versions this is easily
// exceeded.
//
// Two layers:
//  1. graceful-fs.gracefulify(fs) — queues/retries the callback fs API.
//  2. A semaphore around the promises API (both `fs.promises` and the separate
//     `fs/promises` module, since Docusaurus may use either). Bounding concurrent
//     file operations keeps open FDs well under the ulimit no matter how
//     aggressively Docusaurus parallelizes. graceful-fs does not queue promises.
//
// Must be loaded via `node --require` (NOT from docusaurus.config.js) so the
// patch is in place before Docusaurus core captures any fs bindings.
const fs = require('fs');
require('graceful-fs').gracefulify(fs);

const MAX_CONCURRENT = Number(process.env.FS_MAX_CONCURRENT || 700);
let active = 0;
const waiters = [];

function acquire() {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiters.push(resolve));
}
function release() {
  active--;
  const next = waiters.shift();
  if (next) {
    active++;
    next();
  }
}

const WRAPPED = Symbol('fs-semaphore-wrapped');
const METHODS = [
  'open', 'readFile', 'readdir', 'stat', 'lstat',
  'realpath', 'readlink', 'access', 'copyFile', 'writeFile',
];

function patch(obj) {
  if (!obj) return;
  for (const name of METHODS) {
    const orig = obj[name];
    if (typeof orig !== 'function' || orig[WRAPPED]) continue;
    const bound = orig.bind(obj);
    const wrapped = async (...args) => {
      await acquire();
      try {
        return await bound(...args);
      } finally {
        release();
      }
    };
    wrapped[WRAPPED] = true;
    obj[name] = wrapped;
  }
}

patch(fs.promises);
try {
  patch(require('fs/promises'));
} catch (e) {
  /* older Node without fs/promises module — ignore */
}
