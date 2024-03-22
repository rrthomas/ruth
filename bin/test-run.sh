#!/bin/sh
mypath=$(dirname $0)
node --no-warnings=ExperimentalWarning --loader ts-node/esm "$mypath/../src/cli.ts" "$@"
