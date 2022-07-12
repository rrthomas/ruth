#!/bin/sh
mypath=$(dirname $0)
node --loader ts-node/esm "$mypath/../src/cli.ts" "$@"
