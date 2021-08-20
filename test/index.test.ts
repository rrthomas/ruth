import util from 'util'
import fs from 'fs'
import net from 'net'
import path from 'path'
import execa from 'execa'
import tempy from 'tempy'
import {compareSync, Difference} from 'dir-compare'
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import {check} from 'linkinator'

chai.use(chaiAsPromised)
const expect = chai.expect
const assert = chai.assert

const ruthCmd = process.env.NODE_ENV === 'coverage' ? '../bin/test-run' : '../bin/run'

async function runRuth(args: string[]) {
  return execa(ruthCmd, args)
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
  const outputDir = tempy.directory()
  const outputObj = path.join(outputDir, 'output')
  args.push(outputObj)
  await runRuth(args)
  assertFileObjEqual(outputObj, expected)
  fs.rmdirSync(outputDir, {recursive: true})
}

async function failingRuthTest(args: string[], expected: string) {
  try {
    await runRuth(args)
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(error.stderr).to.contain(expected)
    return
  }
  throw new Error('test passed unexpectedly')
}

async function checkLinks(root: string, start: string) {
  const results = await check({path: start, serverRoot: root})
  if (!results.passed) {
    console.error(results)
  }
  assert(results.passed, 'Broken links in output')
}

describe('ruth', function () {
  // When run for coverage, the tests are rather slow.
  this.timeout(10000)

  before(function () {
    process.chdir('test')
  })

  it('--help should produce output', async () => {
    process.env.DEBUG = 'yes'
    const {stdout} = await runRuth(['--help'])
    expect(stdout).to.contain('A simple templating system.')
    delete process.env.DEBUG
  })

  it('Missing command-line argument should cause an error', async () => {
    await failingRuthTest(
      ['dummy'],
      'the following arguments are required',
    )
  })

  it('--foo should cause an error', async () => {
    await failingRuthTest(
      ['--foo', 'a', 'b'],
      'unrecognized arguments: --foo',
    )
  })

  it('Running on a non-existent path should cause an error', async () => {
    await failingRuthTest(
      ['a', 'b'],
      'no such file or directory',
    )
  })

  it('Running on something not a directory or file should cause an error', async () => {
    const server = net.createServer()
    const tempFile = tempy.file()
    server.listen(tempFile)
    await failingRuthTest(
      [`${tempFile}`, 'dummy'],
      'is not a directory or file',
    )
    server.close()
  })

  it('Invalid XQuery should cause an error', async () => {
    await failingRuthTest(
      ['xquery-error', 'dummy'],
      'missing semicolon at end of function',
    )
  })

  it('Invalid XQuery should cause an error (DEBUG=yes coverage)', async () => {
    process.env.DEBUG = 'yes'
    await failingRuthTest(
      ['xquery-error', 'dummy'],
      'missing semicolon at end of function',
    )
    delete process.env.DEBUG
  })

  it('Incorrect XQuery should cause an error', async () => {
    await failingRuthTest(
      ['incorrect-xquery', 'dummy'],
      'XPST0017',
    )
  })

  it('XQuery that gives no results should cause an error', async () => {
    await failingRuthTest(
      ['xquery-no-results', 'dummy'],
      "'foo' does not give a result",
    )
  })

  it('An XQuery module with no module declaration should give an error', async () => {
    await failingRuthTest(
      ['xquery-module-no-declaration', 'dummy'],
      'XQuery module must be declared in a library module',
    )
  })

  it('Invalid XML should cause an error', async () => {
    await failingRuthTest(
      ['invalid-xml', 'dummy'],
      'error parsing',
    )
  })

  it('Non-existent --path should cause an error', async () => {
    await failingRuthTest(
      ['--path', 'nonexistent', 'webpage-src', 'dummy'],
      'no such file or directory',
    )
  })

  it('Whole-tree test', async () => {
    await ruthTest(['webpage-src'], 'webpage-expected')
    await checkLinks('webpage-expected', 'index.xhtml')
  })

  it('Part-tree test', async () => {
    await ruthTest(['webpage-src', '--path=people'], 'webpage-expected/people')
    await checkLinks('webpage-expected/people', 'index.xhtml')
  })

  it('Two-tree test', async () => {
    await ruthTest(['mergetrees-src:webpage-src'], 'mergetrees-expected')
    await checkLinks('mergetrees-expected', 'index.xhtml')
  })

  it('Data templating', async () => {
    await ruthTest(['data-templating-src'], 'data-templating-expected')
  })

  it('Executable test', async () => {
    await ruthTest(['executable-src'], 'executable-expected')
  })

  it('Cookbook web site example', async () => {
    await ruthTest(['cookbook-example-website-src'], 'cookbook-example-website-expected')
    await checkLinks('cookbook-example-website-expected', 'index/index.xhtml')
  })

  it('Non-termination test', async () => {
    await failingRuthTest(
      ['non-terminating', 'dummy'],
      'did not terminate',
    )
  })
})
