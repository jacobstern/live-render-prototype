const chalk = require('chalk');
const ts = require('typescript');
const Bundler = require('parcel-bundler');
const path = require('path');
const child_process = require('child_process');
const livereload = require('livereload');

const formatHost = {
  getCanonicalFileName: path => path,
  getCurrentDirectory: ts.sys.getCurrentDirectory,
  getNewLine: () => ts.sys.newLine
};

/**
 * This script does several things:
 *
 * - Starts `ts-node-dev` for the application via `child_process.spawn()` (since
 *   it doesn't have a Node API). For performance `ts-node-dev` is run with
 *   `--transpileOnly` which skips the `tsc` type-checking step.
 * - Starts a TypeScript watcher process that emits type-checking errors
 * - Starts a Parcel builder process to build assets for the frontend
 * - Runs a `livereload` server to refresh the page when a template file is
 *   edited or the webserver is restarted
 *
 * Invoke with `yarn dev` and you're off to the races!
 */
async function main() {
  const rootDir = path.resolve(__dirname, '..');
  const configPath = ts.findConfigFile(rootDir, ts.sys.fileExists, 'tsconfig.json');

  if (!configPath) {
    throw new Error("Could not find a valid 'tsconfig.json'.");
  }

  // TS watcher hacked together from https://github.com/Microsoft/TypeScript/wiki/Using-the-Compiler-API#writing-an-incremental-program-watcher
  const createProgram = ts.createSemanticDiagnosticsBuilderProgram;
  const host = ts.createWatchCompilerHost(
    configPath,
    {},
    ts.sys,
    createProgram,
    reportDiagnostic,
    reportWatchStatusChanged
  );
  ts.createWatchProgram(host);

  const livereloadServer = livereload.createServer({ exts: ['hbs'] });
  livereloadServer.watch([path.resolve(rootDir, 'views/')]);

  const bundler = new Bundler('assets/ts/main.ts', {
    outDir: path.resolve(rootDir, 'public/build/'),
    publicUrl: './'
  });
  await bundler.bundle();

  const tsNodeDev = child_process.spawn(
    'ts-node-dev',
    '--respawn --transpileOnly --no-notify --debounce 800 -- src/server.ts'.split(/\s+/)
  );
  tsNodeDev.stdout.on('data', chunk => {
    if (/^Express server listening on port/.test(chunk.toString())) {
      livereloadServer.refresh(rootDir);
    }
  });
  tsNodeDev.stdout.pipe(process.stdout);
  tsNodeDev.stderr.pipe(process.stderr);

  const ensureProcessKilled = () => {
    if (!tsNodeDev.killed) {
      tsNodeDev.kill();
    }
  };

  tsNodeDev.on('exit', ensureProcessKilled);
}

function formatDiagnostic(diagnostic) {
  // The TypeScript formatter adds a trailing newline, which is not desirable.
  return ts.formatDiagnostic(diagnostic, formatHost).trimRight();
}

function reportDiagnostic(diagnostic) {
  console.error(chalk.red(formatDiagnostic(diagnostic)));
}

/**
 * Prints a diagnostic every time the watch status changes.
 * This is mainly for messages like "Starting compilation" or "Compilation completed".
 */
function reportWatchStatusChanged(diagnostic) {
  console.info(formatDiagnostic(diagnostic));
}

main();
