# Ruth

![logo](logo/ruth-small.png) _logo by Silvia Polverini_

© 2002–2021 Reuben Thomas <rrt@sc3d.org>  
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
subset of XQuery 3.1.

[fontoxpath]: https://www.npmjs.com/package/fontoxpath

See the [Cookbook](Cookbook.md) for examples.

Please send questions, comments, and bug reports to the maintainer, or
report them on the project’s web page (see above for addresses).

## Installation

Install Ruth with npm (part of [Node](https://nodejs.org/en/)):

```
$ npm install -g @sc3d/ruth
```

## Invocation

```
ruth [-h] [--path PATH] [--ext .EXT] [--max-iterations N] [--version]
           INPUT-PATH OUTPUT-DIRECTORY

A simple templating system.

positional arguments:
  INPUT-PATH          desired directory list to build
  OUTPUT-DIRECTORY    output directory

optional arguments:
  -h, --help          show this help message and exit
  --path PATH         relative path to build [default: input directory]
  --ext .EXT          treat files with extension .EXT as XML
  --max-iterations N  maximum number of XQuery iterations before erroring
  --version           show program's version number and exit

The INPUT-PATH is a ':'-separated list of directories; the directories
are merged, with the contents of each directory taking precedence over any
directories to its right.
```

## Operation <a name="operation"></a>

Ruth starts by combining the list of directories given as its _input path_.
If the same file or directory exists in more than one of the directories on
the input path, the left-most takes precedence.

Ruth then creates the output directory, deleting its contents if it already
existed.

Next, Ruth traverses the resulting directory tree, or the subdirectory given
by the `--path` argument, if any, in bread-first order.

For each file, Ruth looks at its name, and:

+ If the name contains the suffix `.ruth`, the file’s contents is expanded
  (see below), and the result is then written to a file of the same name,
  but with the `.ruth` suffix removed, in the corresponding place in the
  output directory. The working XML document is also updated with the
  result.
+ Else, if the name contains the suffix `.in`, the file is skipped. (It may
  be used by macros in other files.)
+ Otherwise, the file is copied verbatim to the corresponding place in the
  output directory.

The special suffixes need not end the file name; they can be used as infixes
before the file type suffix.

### Template expansion

Ruth expands a template file as follows by executing it as an XQuery
expression. The result is re-executed, to allow for expansions that
themselves return XQuery expressions, up to 8 times. If there are still
unevaluated XQuery expressions in the file contents after this, an error is
raised.

The use of XQuery is beyond the scope of this manual; see the
[XQuery specification][XQuery] and [fontoxpath documentation][fontoxpath]
for more details.

Ruth provides some built-in global variables:

+ `$ruth:root`: the `INPUT-PATH` argument.
+ `$ruth:path`: the relative path from `$ruth:root` to the file currently being expanded.
+ `$ruth:element`: the element in Ruth's working XML document corresponding to
  the file currently being expanded.

Ruth provides a single built-in custom function, `ruth:eval()`, which
evaluates the given XQuery expression, and returns the first matching node,
or, if there is none, raises an error.

Ruth also loads other XQuery functions from `lib/ruth.xq`. See that file for
documentation.

See the [website example](Cookbook.md#website-example) in the Cookbook for a
worked example of using Ruth to template a website.

### Running other programs

An executable file in the input is turned into a custom XQuery function in
the `ruth` namespace. Any `.in` suffix is stripped out. So for example,
`foo.in` becomes a function `ruth:foo()`. The custom functions take a sequence
of strings, which are  provided to the program as its command-line arguments,
and returns the program's standard output as a string.

## Development

Check out the git repository and download dependencies with:

```
git clone https://github.com/rrthomas/ruth
npm install
```

In addition, [agrep](https://www.tgries.de/agrep/) is required to build the
documentation.

To run the tests:

```
npm test
```
