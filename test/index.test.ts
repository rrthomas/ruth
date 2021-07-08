import util from 'util'
import fs from 'fs'
import path from 'path'
import execa from 'execa'
import {directory} from 'tempy'
import {compareSync, Difference} from 'dir-compare'
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import {check} from 'linkinator'

chai.use(chaiAsPromised)
const expect = chai.expect
const assert = chai.assert

async function runRuth(args: string[]) {
  return execa('../bin/run', args)
}

function diffsetDiffsOnly(diffSet: Difference[]): Difference[] {
  return diffSet.filter((diff) => diff.state !== 'equal')
}

function assertFileObjEqual(obj: string, expected: string) {
  const stats = fs.statSync(obj)
  if (stats.isDirectory()) {
    const compareResult = compareSync(obj, expected, {compareContent: true})
    assert(compareResult.same, util.inspect(diffsetDiffsOnly(compareResult.diffSet as Difference[])))
  } else {
    assert(
      fs.readFileSync(obj).equals(fs.readFileSync(expected)),
      `'${obj}' does not match expected '${expected}'`
    )
  }
}

async function ruthTest(args: string[], expected: string) {
  const outputDir = directory()
  const outputObj = path.join(outputDir, 'output')
  args.push(outputObj)
  await runRuth(args)
  assertFileObjEqual(outputObj, expected)
  fs.rmdirSync(outputDir, {recursive: true})
}

async function checkLinks(root: string, start: string) {
  const results = await check({path: start, serverRoot: root})
  if (!results.passed) {
    console.error(results)
  }
  assert(results.passed, 'Broken links in output')
}

describe('ruth', function () {
  before(function () {
    process.chdir('test')
  })

  it('--help should produce output', async () => {
    const proc = runRuth(['--help'])
    const {stdout} = await proc
    expect(stdout).to.contain('A simple templating system.')
  })

  it('Data templating', async () => {
    await ruthTest(['data-templating-src'], 'data-templating-expected')
  })

  // it('Whole-tree test', async () => {
  //   await ruthTest(['--keep-going', 'webpage-xml-src'], 'webpage-xhtml-expected')
  //   await checkLinks('webpage-xhtml-expected', 'index.xhtml')
  // })

  // it('Part-tree test', async () => {
  //   await ruthTest(['--keep-going', 'webpage-xml-src', '--path=people'], 'webpage-xhtml-expected/people')
  //   await checkLinks('webpage-xhtml-expected/people', 'index.xhtml')
  // })

  // it('Two-tree test', async () => {
  //   await ruthTest(['--keep-going', 'mergetrees-xml-src:webpage-xml-src'], 'mergetrees-xhtml-expected')
  //   await checkLinks('mergetrees-xhtml-expected', 'index.xhtml')
  // })

  // it('Cookbook web site example', async () => {
  //   await ruthTest(['cookbook-example-website-xml-src'], 'cookbook-example-website-xhtml-expected')
  //   await checkLinks('cookbook-example-website-xhtml-expected', 'index/index.xhtml')
  // })
})
