#!/usr/bin/env -S npx ts-node
// Format XML on stdin
import getStdin from 'get-stdin-with-tty'
import formatXML from 'xml-formatter'

void (async () => {
  const input = await getStdin()
  console.log(formatXML(input, {lineSeparator: '\n'}))
})()
