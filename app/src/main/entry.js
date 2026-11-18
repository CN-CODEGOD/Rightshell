// App entry for `electron .` / packaged builds.
// Electron's default_app requires the package main as a module, so inside
// main.js `require.main === module` is NEVER true — an auto-bootstrap guard
// there cannot fire (product entry defect found by A1 probe a1j: app alive,
// zero windows, whenReady callback never reached because bootstrap never ran).
// main.js stays side-effect free (smoke.js requires it and calls bootstrap
// explicitly); the canonical entry bootstraps here.
const { bootstrap } = require('./main');
bootstrap();