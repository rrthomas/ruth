import util from 'util'
import fs from 'fs'
import path from 'path'
import net from 'net'
import execa from 'execa'
import tempy from 'tempy'
import {compareSync, Difference} from 'dir-compare'
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import {check} from 'linkinator'

import Expander from '../src/index'

chai.use(chaiAsPromised)
const expect = chai.expect
const assert = chai.assert

const command = process.env.NODE_ENV === 'coverage' ? '../bin/test-run' : '../bin/run'

async function run(args: string[]) {
  return execa(command, args)
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

async function cliTest(args: string[], expected: string) {
  const outputDir = tempy.directory()
  const outputObj = path.join(outputDir, 'output')
  args.push(outputObj)
  await run(args)
  assertFileObjEqual(outputObj, expected)
  fs.rmdirSync(outputDir, {recursive: true})
}

async function failingCliTest(args: string[], expected: string) {
  try {
    await run(args)
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
  // In coverage mode, allow for recompilation.
  this.timeout(10000)

  before(function () {
    process.chdir('test')
  })

  // CLI tests
  // FIXME: For now, all tests are CLI tests, because we cannot reset the
  // state of fontoxpath between tests; see
  // https://github.com/FontoXML/fontoxpath/issues/406
  it('Whole-tree test', async () => {
    await cliTest(['webpage-src'], 'webpage-expected')
    await checkLinks('webpage-expected', 'index.xhtml')
  })

  it('Part-tree test', async () => {
    await cliTest(['webpage-src', '--path=people'], 'webpage-expected/people')
    await checkLinks('webpage-expected/people', 'index.xhtml')
  })

  it('Single file test', async () => {
    await cliTest(['webpage-src', '--path=people/index.ruth.xhtml'], 'webpage-expected/people/index.xhtml')
    await checkLinks('webpage-expected/people', 'index.xhtml')
  })

  it('Two-tree test', async () => {
    await cliTest(['mergetrees-src:webpage-src'], 'mergetrees-expected')
    await checkLinks('mergetrees-expected', 'index.xhtml')
  })

  it('Data templating', async () => {
    await cliTest(['data-templating-src'], 'data-templating-expected')
  })

  it('Executable test', async () => {
    await cliTest(['executable-src'], 'executable-expected')
  })

  it('Cookbook web site example', async () => {
    await cliTest(['cookbook-example-website-src'], 'cookbook-example-website-expected')
    await checkLinks('cookbook-example-website-expected', 'index/index.xhtml')
  })

  it('Invalid XQuery should cause an error', async () => {
    await failingCliTest(
      ['xquery-error', 'dummy'],
      'missing semicolon at end of function',
    )
  })

  it('Invalid XQuery should cause an error (DEBUG=yes coverage)', async () => {
    process.env.DEBUG = 'yes'
    await failingCliTest(
      ['xquery-error', 'dummy'],
      'missing semicolon at end of function',
    )
    delete process.env.DEBUG
  })

  it('Incorrect XQuery should cause an error', async () => {
    await failingCliTest(
      ['incorrect-xquery', 'dummy'],
      'XPST0017',
    )
  })

  it('XQuery that gives no results should cause an error', async () => {
    await failingCliTest(
      ['xquery-no-results', 'dummy'],
      "'foo' does not give a result",
    )
  })

  it('An XQuery module with no module declaration should give an error', async () => {
    await failingCliTest(
      ['xquery-module-no-declaration', 'dummy'],
      'XQuery module must be declared in a library module',
    )
  })

  it('Invalid XML should cause an error', async () => {
    await failingCliTest(
      ['invalid-xml', 'dummy'],
      'error parsing',
    )
  })

  it('Non-termination test', async () => {
    await failingCliTest(
      ['non-terminating', 'dummy'],
      'did not terminate',
    )
  })

  it('--help should produce output', async () => {
    const {stdout} = await run(['--help'])
    expect(stdout).to.contain('A simple templating system.')
  })

  it('Missing command-line argument should cause an error', async () => {
    await failingCliTest(
      ['dummy'],
      'the following arguments are required',
    )
  })

  it('Invalid command-line argument should cause an error', async () => {
    await failingCliTest(
      ['--foo', 'a', 'b'],
      'unrecognized arguments: --foo',
    )
  })

  it('Running on a non-existent path should cause an error (DEBUG=yes coverage)', async () => {
    process.env.DEBUG = 'yes'
    await failingCliTest(
      ['a', 'b'],
      'no such file or directory',
    )
    delete process.env.DEBUG
  })

  it('Running on something not a directory or file should cause an error', async () => {
    const server = net.createServer()
    const tempFile = tempy.file()
    server.listen(tempFile)
    await failingCliTest(
      [`${tempFile}`, 'dummy'],
      'is not a directory or file',
    )
    server.close()
  })

  it('Non-existent --path should cause an error', async () => {
    await failingCliTest(
      ['--path', 'nonexistent', 'webpage-src', 'dummy'],
      'no such file or directory',
    )
  })

  it('Empty INPUT-PATH should cause an error', async () => {
    await failingCliTest(
      ['', 'dummy'],
      'input path must not be empty',
    )
  })

  // FIXME: Remove this when we have module tests
  it('Complete code coverage of Expander constructor', () => {
    new Expander('webpage-src')
  })
})
