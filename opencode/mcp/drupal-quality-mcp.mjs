#!/usr/bin/env node

import { spawn } from 'node:child_process';

const PROJECT_DIR = '/var/www/html';

function sshExec(cmd) {
  return new Promise((resolve) => {
    const fullCmd = `cd ${PROJECT_DIR} && ${cmd}`;
    const child = spawn('ssh', [
      '-o', 'BatchMode=yes',
      '-o', 'ConnectTimeout=10',
      '-o', 'LogLevel=ERROR',
      'web', fullCmd
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout: stdout.trimEnd(), stderr: stderr.trimEnd() });
    });

    child.on('error', (err) => {
      resolve({ code: 1, stdout: '', stderr: err.message });
    });
  });
}

const TOOLS = [
  {
    name: 'drupal_phpcs',
    description: 'Check PHP and YAML files against Drupal coding standards (PHP_CodeSniffer)',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File or directory to scan (default: web/modules/custom)' }
      }
    }
  },
  {
    name: 'drupal_phpcbf',
    description: 'Auto-fix PHP coding standards violations (PHP Code Beautifier)',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File or directory to fix (default: web/modules/custom)' }
      }
    }
  },
  {
    name: 'drupal_phpstan',
    description: 'Run PHPStan static analysis on PHP code',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File or directory to analyze (default: web/modules/custom)' },
        generate_baseline: { type: 'boolean', description: 'Generate a baseline to suppress existing errors' }
      }
    }
  },
  {
    name: 'drupal_eslint',
    description: 'Lint JavaScript and YAML files with ESLint (runs directly in opencode container)',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File or directory to lint (default: web/modules/custom)' },
        fix: { type: 'boolean', description: 'Auto-fix fixable issues' }
      }
    }
  },
  {
    name: 'drupal_stylelint',
    description: 'Lint CSS files with Stylelint (runs directly in opencode container)',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File or directory to lint (default: web/modules/custom)' }
      }
    }
  },
  {
    name: 'drupal_prettier',
    description: 'Check code formatting with Prettier (runs directly in opencode container)',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File or directory to check (default: web/modules/custom)' },
        write: { type: 'boolean', description: 'Write formatting changes' }
      }
    }
  },
  {
    name: 'drupal_cspell',
    description: 'Check spelling with CSpell (runs directly in opencode container)',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File or directory to check (default: web/modules/custom)' }
      }
    }
  },
  {
    name: 'drupal_composer_validate',
    description: 'Validate composer.json configuration',
    inputSchema: { type: 'object', properties: {} }
  }
];

function esh(s) {
  return s.replace(/'/g, "'\\''");
}

function buildWebCommand(name, args) {
  const path = args?.path || 'web/modules/custom';
  const ep = esh(path);

  switch (name) {
    case 'drupal_phpcs':
      return `./vendor/bin/phpcs --standard=./.phpcs.xml '${ep}' 2>&1; echo "DCQ_EXIT=$?"`;

    case 'drupal_phpcbf':
      return `./vendor/bin/phpcbf --standard=./.phpcs.xml '${ep}' 2>&1; echo "DCQ_EXIT=$?"`;

    case 'drupal_phpstan':
      if (args?.generate_baseline) {
        return `./vendor/bin/phpstan analyze --configuration=./phpstan.neon --generate-baseline --no-progress '${ep}' 2>&1; echo "DCQ_EXIT=$?"`;
      }
      return `./vendor/bin/phpstan analyze --configuration=./phpstan.neon --no-progress '${ep}' 2>&1; echo "DCQ_EXIT=$?"`;

    case 'drupal_eslint':
      return `./node_modules/.bin/eslint --config=./eslint.config.js ${args?.fix ? '--fix' : ''} --no-error-on-unmatched-pattern '${ep}' 2>&1; echo "DCQ_EXIT=$?"`;

    case 'drupal_stylelint':
      return `./node_modules/.bin/stylelint --config=./.stylelintrc.json --allow-empty-input '${ep}' 2>&1; echo "DCQ_EXIT=$?"`;

    case 'drupal_prettier':
      return `./node_modules/.bin/prettier ${args?.write ? '--write' : '--check'} --config=./.prettierrc.json '${ep}' 2>&1; echo "DCQ_EXIT=$?"`;

    case 'drupal_cspell':
      return `./node_modules/.bin/cspell --config=./.cspell.json --no-progress '${ep}' 2>&1; echo "DCQ_EXIT=$?"`;

    case 'drupal_composer_validate':
      return `composer validate 2>&1; echo "DCQ_EXIT=$?"`;

    default:
      return null;
  }
}

let buffer = '';

function send(id, result) {
  const msg = JSON.stringify({ jsonrpc: '2.0', id, result });
  process.stdout.write(msg + '\n');
}

function sendError(id, code, message, data) {
  const msg = JSON.stringify({ jsonrpc: '2.0', id, error: { code, message, data } });
  process.stdout.write(msg + '\n');
}

function handleMessage(msg) {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    const serverInfo = { name: 'drupal-quality-mcp', version: '1.0.0' };
    const clientInfo = params?.clientInfo || {};
    if (clientInfo.name) serverInfo.clientName = clientInfo.name;
    if (clientInfo.version) serverInfo.clientVersion = clientInfo.version;
    send(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo
    });
    return;
  }

  if (!id) return;

  switch (method) {
    case 'tools/list':
      send(id, { tools: TOOLS });
      break;

    case 'tools/call': {
      const { name, arguments: toolArgs } = params || {};
      handleToolCall(id, name, toolArgs);
      break;
    }

    case 'resources/list':
    case 'prompts/list':
      send(id, { resources: [] });
      break;

    default:
      sendError(id, -32601, `Method not found: ${method}`);
  }
}

async function handleToolCall(id, name, args) {
  const tool = TOOLS.find(t => t.name === name);
  if (!tool) {
    sendError(id, -32602, `Unknown tool: ${name}`);
    return;
  }

  const command = buildWebCommand(name, args);
  if (!command) {
    sendError(id, -32603, `Failed to build command for: ${name}`);
    return;
  }

  try {
    let result;

    if (name === 'drupal_eslint' || name === 'drupal_stylelint' ||
        name === 'drupal_prettier' || name === 'drupal_cspell') {
      // JS tools run directly in opencode container (has Node.js)
      const jsCommand = command.replace('./node_modules/.bin/', 'node_modules/.bin/');
      result = await runLocal(jsCommand);
    } else {
      // PHP tools run in web container via SSH (see ~/.ssh/config Host web)
      result = await sshExec(command);
    }

    let cleanStdout = result.stdout;
    let exitCode = 1;

    const exitMatch = cleanStdout.match(/\n?DCQ_EXIT=(\d+)$/);
    if (exitMatch) {
      exitCode = parseInt(exitMatch[1], 10);
      cleanStdout = cleanStdout.replace(/\n?DCQ_EXIT=\d+$/, '');
    }

    const output = [];
    if (cleanStdout) output.push({ type: 'text', text: cleanStdout });
    if (result.stderr) output.push({ type: 'text', text: result.stderr });

    if (exitCode !== 0 && !cleanStdout && !result.stderr) {
      output.push({ type: 'text', text: `Command failed (exit code: ${exitCode})` });
    }

    send(id, {
      content: output.length > 0 ? output : [{ type: 'text', text: `Completed (exit code: ${exitCode})` }],
      isError: exitCode !== 0
    });
  } catch (err) {
    sendError(id, -32603, err.message);
  }
}

function runLocal(command) {
  return new Promise((resolve) => {
    const child = spawn('bash', ['-c', `cd ${PROJECT_DIR} && ${command}`], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout: stdout.trimEnd(), stderr: stderr.trimEnd() });
    });

    child.on('error', (err) => {
      resolve({ code: 1, stdout: '', stderr: err.message });
    });
  });
}

process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      handleMessage(JSON.parse(trimmed));
    } catch {
      // skip malformed JSON
    }
  }
});

process.stdin.on('end', () => {
  if (buffer.trim()) {
    try {
      handleMessage(JSON.parse(buffer.trim()));
    } catch {
      // ignore
    }
  }
});
