#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')

const manifestPath = path.join(__dirname, '..', 'manifest.json')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
process.stdout.write(JSON.stringify(manifest))
