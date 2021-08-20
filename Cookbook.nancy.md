# Ruth Cookbook

See the [README](README.md) for installation and usage. The rest of this
document shows examples of its use.

## Generating a web site <a name="website-example"></a>

Suppose a web site has the following page design:

![from top to bottom: logo, breadcrumb trail, navigation menu, page body](website.svg)

Most of the elements are the same on each page, but the breadcrumb trail has
to show the canonical path to each page, and the logo is bigger on the home
page, `index/index.xhtml`.

Suppose further that the web site has the following structure, where each
line corresponds to a page:

```
 ├── Home page
$paste{sh,-c,build-aux/dirtree test/cookbook-example-website-expected | sed -e 's/\.xhtml//g' | grep -v index | grep -v \\.}
```

The basic page template looks like this:

```
$paste{cat,test/cookbook-example-website-src/template.in.xhtml}
```

Making the menu an included file is not strictly necessary, but makes the
template easier to read. The pages will be laid out as follows:

```
$paste{build-aux/dirtree,test/cookbook-example-website-expected}
```

The corresponding source files will be laid out as follows. This may look a
little confusing at first, but note the similarity to the HTML pages, and
hold on for the explanation!

```
$paste{build-aux/dirtree,test/cookbook-example-website-src}
```

Note that there is only one menu fragment (the main menu is the same for
every page), but each page has its own content (`main.in.xhtml`).

Now consider how Ruth builds the page whose URL is
`Places/Vladivostok/index/index.xhtml`. Assume the source files are in the
directory `source`. This page is built from
`source/Places/Vladivostok/index/index.ruth.xhtml`, whose contents is
`$paste{cat,test/cookbook-example-website-src/Places/Vladivostok/index/index.ruth.xhtml}`.

The custom function `ruth:include("foo")` copies the contents of the
“nearest” file with basename “foo” to the file from which the function is
called.

For the site’s index page, the file `index/logo.in.xhtml` will be used for the
logo fragment, which can refer to the larger graphic desired.

The breadcrumb trail is produced by the custom function
`cookbook:breadcrumb()`, defined in
`test/cookbook-example-website-src/funcs.in.xq`, with some help from CSS.

### Building the site

The site is built by running Ruth on the source directory:

```
ruth test/cookbook-example-website-src site
```

[FIXME]: # (Explain how to serve the web site dynamically.)

## Adding a datestamp using a program <a name="date-example"></a>

Put the the following script that wraps the `date` command in a file called
`date-yyyymmdd.in`:

```
$paste{cat,test/executable-src/date-yyyymmdd.in}
```

Then a datestamp can be added to a templated file by calling the
corresponding custom function:

```
$paste{sh,-c,sed -e 's|\,--date=2016/10/12||' < test/executable-src/Page.ruth.xml}
```

This gives the result:

```
$include{cat,test/executable-expected/Page.xml}
```

[FIXME]: # (Add a section on data templating, using the corresponding example.)
