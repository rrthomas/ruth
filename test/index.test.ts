import util from 'util'
import fs from 'fs-extra'
import path from 'path'
import net from 'net'
import execa from 'execa'
import tempy from 'tempy'
import {compareSync, Difference} from 'dir-compare'
import chai, {expect, assert} from 'chai'
import chaiAsPromised from 'chai-as-promised'
import {check} from 'linkinator'
import fontoxpath, {Options} from 'fontoxpath'

// eslint-disable-next-line import/no-named-as-default
import Expander, {XmlDir} from '../src/index'

const {evaluateXPath, evaluateXPathToFirstNode} = fontoxpath

chai.use(chaiAsPromised)

const command = process.env.NODE_ENV === 'coverage' ? '../bin/test-run.sh' : '../bin/run.js'

export const ruth = 'https://github.com/rrthomas/ruth/raw/main/ruth.dtd'
export const dirtree = 'https://github.com/rrthomas/ruth/raw/main/dirtree.dtd'
const URI_BY_PREFIX: {[key: string]: string} = {ruth, dirtree}

const xQueryOptions: Options = {
  namespaceResolver: (prefix: string) => URI_BY_PREFIX[prefix],
  language: evaluateXPath.XQUERY_3_1_LANGUAGE,
  debug: process.env.DEBUG !== undefined,
}

async function run(args: string[]) {
  return execa(command, args)
}

function diffsetDiffsOnly(diffSet: Difference[]): Difference[] {
  return diffSet.filter((diff) => diff.state !== 'equal')
}

function assertFileObjEqual(obj: string, expected: string) {
  const compareResult = compareSync(obj, expected, {compareContent: true})
  assert(
    compareResult.same,
    util.inspect(diffsetDiffsOnly(compareResult.diffSet as Difference[])),
  )
}

function assertStringEqualToFile(s: string, expected: string) {
  const file = tempy.writeSync(s)
  assertFileObjEqual(file, expected)
  fs.rmSync(file)
}

async function cliTest(args: string[], expected: string) {
  const outputDir = tempy.directory()
  const outputObj = path.join(outputDir, 'output')
  args.push(outputObj)
  await run(args)
  assertFileObjEqual(outputObj, expected)
  fs.rmSync(outputDir, {recursive: true})
}

async function failingCliTest(args: string[], expected: string) {
  const outputDir = tempy.directory()
  const outputObj = path.join(outputDir, 'output')
  args.push(outputObj)
  try {
    await run(args)
  } catch (error: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(error.stderr).to.contain(expected)
    return
  } finally {
    fs.rmSync(outputDir, {recursive: true})
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

function setupUpdate(updateDir: string): XmlDir {
  fs.copySync('webpage-src', updateDir)
  const xmldir = new XmlDir([updateDir])
  const fileElement = evaluateXPathToFirstNode(
    '//dirtree:file[@dirtree:path="people/eve/body.in.xhtml"]',
    xmldir.xtree,
    null,
    null,
    xQueryOptions,
  ) as Element
  fileElement.textContent = "This is Eve's page."
  return xmldir
}

describe('ruth', function test() {
  // In coverage mode, allow for recompilation.
  this.timeout(10000)

  before(() => {
    process.chdir('test')
  })

  it('Convert tree to XML', async () => {
    assertStringEqualToFile(new XmlDir(['webpage-src']).formatXML(), 'webpage-src-expected.xml')
  })

  it('Test update method', async () => {
    const updateDir = tempy.directory()
    setupUpdate(updateDir).update()
    assertStringEqualToFile(new XmlDir([updateDir]).formatXML(), 'webpage-src-updated-expected.xml')
    fs.removeSync(updateDir)
  })

  it('Test update error handling when file system is changed', async () => {
    const updateDir = tempy.directory()
    try {
      const xmldir = setupUpdate(updateDir)
      fs.removeSync(path.join(updateDir, 'people/eve/body.in.xhtml'))
      xmldir.update()
    } catch (error: any) {
      expect(error.message).to.contain('it is missing or not a file')
      fs.removeSync(updateDir)
      return
    }
    throw new Error('test passed unexpectedly')
  })

  // FIXME: Remove this when we have module tests
  it('Complete code coverage of Expander constructor', () => {
    // eslint-disable-next-line no-new
    new Expander(['webpage-src'])
  })

  // CLI tests
  // FIXME: For now, all Expander tests are CLI tests, because we cannot
  // reset the state of fontoxpath between tests; see
  // https://github.com/FontoXML/fontoxpath/issues/406
  it('Whole-tree test', async () => {
    process.env.DEBUG = '*'
    await cliTest(['webpage-src'], 'webpage-expected')
    await checkLinks('webpage-expected', 'index.xhtml')
    delete process.env.DEBUG
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

  it('Test expansion of plain text', async () => {
    await cliTest(['plain-text-src'], 'plain-text-expected')
  })

  it('Test XML escaping', async () => {
    await cliTest(['escaped-xml-src'], 'escaped-xml-expected')
  })

  it('Test ruth:map()', async () => {
    await cliTest(['map-src'], 'map-expected')
  })

  it('Test ruth:real-path()', async () => {
    await cliTest(['real-path-src'], 'real-path-expected')
  })

  it('A .ruth.in file should not be copied', async () => {
    await cliTest(['expand-no-copy-src'], 'expand-no-copy-expected')
  })

  it('Invalid path to ruth:real-path() should cause an error', async () => {
    await failingCliTest(
      ['real-path-bad-src'],
      "'nonexistent.file' is not a file",
    )
  })

  it('Invalid XQuery should cause an error', async () => {
    await failingCliTest(
      ['xquery-error'],
      'missing semicolon at end of function',
    )
  })

  it('Invalid XQuery should cause an error (DEBUG coverage)', async () => {
    process.env.DEBUG = '*'
    await failingCliTest(
      ['xquery-error'],
      'missing semicolon at end of function',
    )
    delete process.env.DEBUG
  })

  it('Incorrect XQuery should cause an error', async () => {
    await failingCliTest(
      ['incorrect-xquery'],
      'XPST0017',
    )
  })

  it('XQuery that gives no results should cause an error', async () => {
    await failingCliTest(
      ['xquery-no-results'],
      'gives no results',
    )
  })

  it('An XQuery module with no module declaration should give an error', async () => {
    await failingCliTest(
      ['xquery-module-no-declaration'],
      'XQuery module must be declared in a library module',
    )
  })

  it('Invalid XML should cause an error', async () => {
    await failingCliTest(
      ['invalid-xml'],
      'error parsing',
    )
  })

  it('--help should produce output', async () => {
    const {stdout} = await run(['--help'])
    expect(stdout).to.contain('A simple templating system.')
  })

  it('Missing command-line argument should cause an error', async () => {
    await failingCliTest(
      [],
      'the following arguments are required',
    )
  })

  it('Invalid command-line argument should cause an error', async () => {
    await failingCliTest(
      ['--foo', 'a'],
      'unrecognized arguments: --foo',
    )
  })

  it('Running on a non-existent path should cause an error (DEBUG=yes coverage)', async () => {
    process.env.DEBUG = 'yes'
    await failingCliTest(
      ['a'],
      'is not a file or directory',
    )
    delete process.env.DEBUG
  })

  it('Running on something not a directory or file should cause an error', async () => {
    const server = net.createServer()
    const tempFile = tempy.file()
    server.listen(tempFile)
    await failingCliTest(
      [`${tempFile}`],
      'is not a file or directory',
    )
    server.close()
  })

  it('Non-existent --path should cause an error', async () => {
    await failingCliTest(
      ['--path', 'nonexistent', 'webpage-src'],
      'no such file or directory',
    )
  })

  it('Empty INPUT-PATH should cause an error', async () => {
    await failingCliTest(
      [''],
      'input path must not be empty',
    )
  })
})
