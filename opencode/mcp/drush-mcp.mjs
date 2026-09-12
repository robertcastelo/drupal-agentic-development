#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

// The OpenCode MCP gateway runs inside a Docker container (ddev-sandbox-opencode).
// To communicate with the web container, we SSH into the host's port 22 (mapped
// from the web container's sshd), which drops us into a bash session inside the
// web container -- all set up by the ddev-ai-ssh addon.
//
// Key paths inside the OpenCode container:
//   SSH key:  /home/opencode/.ssh/agent-key/id_ed25519
//   SSH user: read from .ddev/.agent-ssh-keys/web-user (written per-machine by the
//             ddev-ai-ssh addon, mounted at /home/opencode/.ssh/agent-key/web-user)
//   Host:     host.docker.internal  (Docker Desktop hostname for the host machine)
//   Port:     22  (exposed by docker-compose.ai-ssh.yaml -> web container)

// Portable: the web-container username differs per machine, so read it from the
// per-machine web-user file mounted into this container; fall back to "ddev"
// (same default entrypoint.sh uses) if the file is not yet present.
const SSH_USER = readFileSync('/home/opencode/.ssh/agent-key/web-user', 'utf8').trim() || 'ddev';
const SSH_HOST = 'host.docker.internal';
const SSH_PORT = 2222;
const SSH_KEY = '/home/opencode/.ssh/agent-key/id_ed25519';
const CONTAINER_DIR = '/var/www/html';

// Build the ssh command options (ssh itself is passed as the spawn command)
function sshOptions(command) {
  return [
    `-i`, SSH_KEY,
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'UserKnownHostsFile=/dev/null',
    '-o', 'BatchMode=yes',
    '-p', String(SSH_PORT),
    `${SSH_USER}@${SSH_HOST}`,
    `cd ${CONTAINER_DIR} && ${command}`
  ];
}

function sshExec(cmd) {
  return new Promise((resolve) => {
    const child = spawn('ssh', sshOptions(cmd), { stdio: ['ignore', 'pipe', 'pipe'] });

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
    name: 'drush',
    description: 'Run Drush commands in the Drupal web container via SSH. Examples: "status", "cr", "uli", "cget system.site", "updb", "cim", "cex", "user:create example --password=pass --mail=a@b.com", "sqlq SELECT name FROM users_field_data"',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The Drush command and arguments to run (default: "status")'
        }
      },
      required: ['command']
    }
  }
];

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
    const serverInfo = { name: 'drush-mcp', version: '1.0.0' };
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

  const command = args?.command?.trim() || 'status';

  try {
    const result = await sshExec(`./vendor/bin/drush ${command}`);

    const output = [];
    if (result.stdout) output.push({ type: 'text', text: result.stdout });
    if (result.stderr) output.push({ type: 'text', text: result.stderr });

    const isError = result.code !== 0;

    if (isError && !result.stdout && !result.stderr) {
      output.push({ type: 'text', text: `drush failed (exit code: ${result.code})` });
    }

    send(id, {
      content: output.length > 0 ? output : [{ type: 'text', text: `Completed (exit code: ${result.code})` }],
      isError
    });
  } catch (err) {
    sendError(id, -32603, err.message);
  }
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
    }
  }
});

process.stdin.on('end', () => {
  if (buffer.trim()) {
    try {
      handleMessage(JSON.parse(buffer.trim()));
    } catch {
    }
  }
});
