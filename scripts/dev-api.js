import process from 'node:process'

if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development'
await import('../server/index.js')
