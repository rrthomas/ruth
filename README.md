# Ruth

![logo](logo/ruth-small.png) _logo by Silvia Polverini_

© 2002–2024 Reuben Thomas <rrt@sc3d.org>  
<https://github.com/rrthomas/ruth>

Ruth is a simple [XQuery]-based XML templating system, based on the plain
text-oriented [Nancy]. Ruth reads a file or directory into an XML document;
XML files become subdocuments. It then produces a copy of the original file
or directory, executing embedded XQuery queries against the constructed XML
document. Custom XQuery functions and external programs can be used.

[XQuery]: https://www.w3.org/TR/xquery/
[Nancy]: https://github.com/rrthomas/nancy

Ruth is free software, licensed under the GNU GPL version 3 (or, at your
option, any later version), and written in TypeScript.

Ruth uses [fontoxpath] as its XQuery implementation. fontoxpath implements a
subset of [XQuery 3.1](https://www.w3.org/TR/xquery-31/).

[fontoxpath]: https://www.npmjs.com/package/fontoxpath

See the [Cookbook](Cookbook.md) for examples.

Please send questions, comments, and bug reports to the maintainer, or
report them on the project’s web page (see above for addresses).

## Installation

Install Ruth with npm (part of [Node](https://nodejs.org)):

```
$ npm install -g @sc3d/ruth
```

## API documentation

Ruth is mostly used via the `ruth` command, not least because of a
limitation of fontoxpath, which cannot easily be run more than once in the
same process. Nonetheless, Ruth provides some APIs which are documented in
[docs/index.html](https://rrthomas.github.io/ruth/).

## Invocation

```
ruth [-h] [--path PATH] [--ext .EXT] [--version]
           INPUT-PATH OUTPUT-DIRECTORY

A simple templating system.

positional arguments:
  INPUT-PATH        desired directory list to build
  OUTPUT-DIRECTORY  output directory

optional arguments:
  -h, --help        show this help message and exit
  --path PATH       relative path to build [default: input directory]
  --ext .EXT        treat files with extension .EXT as XML
  --version         show program's version number and exit

The INPUT-PATH is a ':'-separated list of directories; the directories
are merged, with the contents of each directory taking precedence over any
directories to its right.
```

## Operation <a name="operation"></a>

Ruth starts by combining the list of directories given as its _input path_.
If the same file or directory exists in more than one of the directories on
the input path, the left-most takes precedence. The result is called the
“input tree”, and all paths are relative to it.

Ruth then creates the output directory if it does not already exist.

Next, Ruth traverses the input tree, or the subtree given by the `--path`
argument, if any, in breadth-first order.

For each file, Ruth looks at its name, and:

- If the name contains the suffix `.ruth`, optionally followed by decimal
  digits, the file is added to the list of files to process. The decimal
  digits are the phase number, which defaults to zero. The files are
  processed in phase order: any phase 0 files first, then phase 1, and so
  on.
- If the name contains the suffix `.in`, the file is skipped. (It may
  be used by macros in other files.)
- Otherwise, the file is added to the list of files to process in phase 0.

The list of files to process is then processed, in order. For each file:

- If the name contains the suffix `.ruth`, the file’s contents is expanded
  (see below), and if the name does not contain the suffix `.in` the result
  is then written to a file of the same name, but with the `.ruth` suffix
  removed, in the corresponding place in the output directory. The working
  XML document is also updated with the result.
- Otherwise, the file is copied verbatim to the corresponding place in the
  output directory.

The special suffixes need not end the file name; they can be used as infixes
before the file type suffix.

### Template expansion

Ruth expands a template file as follows by executing it as an XQuery
expression.

The use of XQuery is beyond the scope of this manual; see the
[XQuery specification][XQuery] and [fontoxpath documentation][fontoxpath]
for more details.

Ruth provides some built-in global variables:

- `$ruth:root`: the `INPUT-PATH` argument.
- `$ruth_path`: the relative path from `$ruth:root` to the file currently
  being expanded.
- `$ruth_element`: the element in Ruth's working XML document corresponding
  to the file currently being expanded.

Ruth provides the following built-in custom functions:

- `ruth:eval($query as xs:string) as node()*`: evaluates the XQuery
  expression `$query`, and returns the first matching node, or, if there is
  none, raises an error.
- `ruth:map($query as xs:string, $transformQuery as xs:string, $nodes as node()*) as node()*`:
  evaluates the XQuery expression `$query` on a copy of `$nodes`, then for
  each node in the result set, replaces it by the value of the XQuery
  expression `$transformQuery` applied to it. Returns the updated copy of
  `$nodes`.
- `ruth:real-path($relPath as xs:string) as xs:string` returns the file
  system path of the file given by `$relPath`. If `$relPath` does not
  correspond to a file, an error is raised. Note in particular that a
  directory does not necessarily correspond to a single file system path.

Ruth also supplies a version of the
[FunctX](http://www.xqueryfunctions.com/) function library, without the
functions that fontoxpath does not support.

Ruth also loads other XQuery functions from `lib/ruth.xq`. See that file for
documentation.

See the [website example](Cookbook.md#website-example) in the Cookbook for a
worked example of using Ruth to template a website.

### Running other programs

An executable file in the input is turned into a pair of XQuery functions in
the `ruth` namespace. Any `.in` suffix is stripped out. So for example,
`foo.in` becomes a function `ruth:foo()`. The functions have the following
signature:

```
ruth:foo($args as xs:string*) as xs:string
ruth:foo($args as xs:string*, $input as xs:string) as xs:string
```

The sequence `$args` is passed to the program as its command-line arguments.
The string `$input` is fed to the program's standard input.

## Development

Check out the git repository and download dependencies with:

```
git clone https://github.com/rrthomas/ruth
npm install
```

To run the tests:

```
npm test
```
