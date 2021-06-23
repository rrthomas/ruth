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

const ruthCmd = '../bin/run'

async function runruth(args: string[]) {
  return execa(ruthCmd, args)
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

function diffsetDiffsOnly(diffSet: Difference[]): Difference[] {
  return diffSet.filter((diff) => diff.state !== 'equal')
}

async function ruthTest(args: string[], expected: string) {
  const outputDir = directory()
  const outputObj = path.join(outputDir, 'output')
  args.push(outputObj)
  await runruth(args)
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
  // The tests are rather slow, but not likely to hang.
  this.timeout(10000)

  before(function () {
    process.chdir('test')
  })

  it('--help should produce output', async () => {
    const proc = runruth(['--help'])
    const {stdout} = await proc
    expect(stdout).to.contain('A simple templating system.')
  })

  it('Whole-tree test (XML)', async () => {
    await ruthTest(['--keep-going', 'webpage-xml-src'], 'webpage-xhtml-expected')
    await checkLinks('webpage-xhtml-expected', 'index.xhtml')
  })

  it('Part-tree test (XML)', async () => {
    await ruthTest(['--keep-going', 'webpage-xml-src', '--path=people'], 'webpage-xhtml-expected/people')
    await checkLinks('webpage-xhtml-expected/people', 'index.xhtml')
  })

  it('Two-tree test (XML)', async () => {
    await ruthTest(['--keep-going', 'mergetrees-xml-src:webpage-xml-src'], 'mergetrees-xhtml-expected')
    await checkLinks('mergetrees-xhtml-expected', 'index.xhtml')
  })

  it('Cookbook web site example (XML)', async () => {
    await ruthTest(['cookbook-example-website-xml-src'], 'cookbook-example-website-xhtml-expected')
    await checkLinks('cookbook-example-website-xhtml-expected', 'index/index.xhtml')
  })
})
