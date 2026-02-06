import { spawn } from 'node:child_process'

const run = (command, args) =>
  spawn(command, args, { stdio: 'inherit', shell: process.platform === 'win32' })

const server = run('npm', ['run', 'dev:server'])
const web = run('npm', ['run', 'dev:web'])

const shutdown = () => {
  server.kill('SIGTERM')
  web.kill('SIGTERM')
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
