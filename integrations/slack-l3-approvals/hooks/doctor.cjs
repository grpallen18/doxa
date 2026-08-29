#!/usr/bin/env node
'use strict'

process.stdout.write(
  JSON.stringify({
    versions: [
      { name: 'node', current: process.versions.node },
      { name: 'v8', current: process.versions.v8 },
    ],
  }),
)
