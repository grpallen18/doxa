#!/usr/bin/env node
'use strict'

process.stdout.write(
  JSON.stringify({
    runtime: 'node',
    hooks: {
      doctor: 'node ./hooks/doctor.cjs',
      'get-manifest': 'node ./hooks/get-manifest.cjs',
    },
    config: {
      'sdk-managed-connection-enabled': false,
      watch: {
        manifest: { paths: ['manifest.json'] },
      },
    },
  }),
)
