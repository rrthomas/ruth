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
 ├── People
 │   ├── Hilary Pilary
 │   ├── Jo Bloggs
 ├── Places
 │   ├── Timbuktu
 │   ├── Vladivostok
```

The basic page template looks like this:

```
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <link rel="stylesheet" type="text/css" href="{ruth:relative-path('style.css')}"/>
    <title>{ruth:include("title.in.xhtml")}</title>
  </head>
  <body>
    <div class="wrapper">
      <div class="logo">{ruth:include("logo.in.xhtml")}</div>
      <div class="breadcrumb"><div class="breadcrumb-content">{cookbook:breadcrumb(.)}</div></div>
    </div>
    <div class="wrapper">
      <div class="menu">{ruth:include("menu.in.xhtml")}</div>
      <div class="main">{ruth:include("main.in.xhtml")}</div>
    </div>
  </body>
</html>
```

Making the menu an included file is not strictly necessary, but makes the
template easier to read. The generated site will contain the following
files:

```
 ├── People
 │   ├── Hilary Pilary
 │   │   └── index
 │   │       └── index.xhtml
 │   ├── Jo Bloggs
 │   │   └── index
 │   │       └── index.xhtml
 │   └── index
 │       └── index.xhtml
 ├── Places
 │   ├── Timbuktu
 │   │   └── index
 │   │       └── index.xhtml
 │   ├── Vladivostok
 │   │   └── index
 │   │       └── index.xhtml
 │   └── index
 │       └── index.xhtml
 ├── index
 │   └── index.xhtml
 ├── ruth-small.png
 ├── ruth-tiny.png
 └── style.css
```

The corresponding source files are laid out as follows. This may look a
little confusing at first, but note the similarity to the HTML pages, and
hold on for the explanation!

```
 ├── People
 │   ├── Hilary Pilary
 │   │   ├── index
 │   │   │   └── index.ruth2.xhtml
 │   │   ├── main.in.xhtml
 │   │   └── title.in.xhtml
 │   ├── Jo Bloggs
 │   │   ├── index
 │   │   │   └── index.ruth2.xhtml
 │   │   ├── main.in.xhtml
 │   │   └── title.in.xhtml
 │   ├── index
 │   │   ├── index.ruth2.xhtml
 │   │   └── main.in.xhtml
 │   └── title.in.xhtml
 ├── Places
 │   ├── Timbuktu
 │   │   ├── index
 │   │   │   └── index.ruth2.xhtml
 │   │   ├── main.in.xhtml
 │   │   └── title.in.xhtml
 │   ├── Vladivostok
 │   │   ├── index
 │   │   │   └── index.ruth2.xhtml
 │   │   ├── main.in.xhtml
 │   │   └── title.in.xhtml
 │   ├── index
 │   │   ├── index.ruth2.xhtml
 │   │   └── main.in.xhtml
 │   └── title.in.xhtml
 ├── funcs.in.xq
 ├── index
 │   ├── index.ruth2.xhtml
 │   ├── logo.in.xhtml
 │   └── main.in.xhtml
 ├── logo.in.xhtml
 ├── menu.in.xhtml
 ├── ruth-small.png
 ├── ruth-tiny.png
 ├── style.css
 ├── template.in.xhtml
 └── title.in.xhtml
```

Note that there is only one menu fragment (the main menu is the same for
every page), but each page has its own content (`main.in.xhtml`).

Now consider how Ruth builds the page whose URL is
`Places/Vladivostok/index/index.xhtml`. Assume the source files are in the
directory `source`. This page is built from
`source/Places/Vladivostok/index/index.ruth2.xhtml`, whose contents is
`{ruth:include("template.in.xhtml")}`.

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

## Adding a datestamp using a program <a name="date-example"></a>

Put the the following script that wraps the `date` command in a file called
`date-yyyymmdd.in`:

```
#!/bin/sh
date +%Y-%m-%d "--date=$1"
```

Then a datestamp can be added to a templated file by calling the
corresponding custom function:

```
{ruth:date-yyyymmdd('2016/10/12')}
```

This gives the result:

```
2016-10-12
```

## Templating data

Ruth can also be used to template data values. Consider the following “database”:

```
 ├── Home page
 ├── place_1
 │   ├── time_1
 │   ├── time_2
 └── place_2
     ├── time_1
     └── time_2
```

The following files will be generated:

```
 ├── index.xhtml
 ├── place_1
 │   ├── index.xhtml
 │   ├── time_1
 │   │   ├── data.xml
 │   │   └── index.xhtml
 │   ├── time_2
 │   │   ├── index.xhtml
 │   │   └── zdata.xml
 │   └── zdata.xml
 └── place_2
     ├── data.xml
     ├── index.xhtml
     ├── time_1
     │   ├── data.xml
     │   └── index.xhtml
     └── time_2
         ├── data.xml
         └── index.xhtml
```

For each time at each place, there is a data file `data.xml` (or
`zdata.xml`; the `z` prefix just tests that the relative order of names
doesn’t matter) and a web page `index.xhtml`.

The source files are laid out as follows:

```
 ├── default.in.xml
 ├── index.ruth2.xhtml
 ├── place_1
 │   ├── index.ruth2.xhtml
 │   ├── time_1
 │   │   ├── data.ruth.xml
 │   │   └── index.ruth2.xhtml
 │   ├── time_2
 │   │   ├── index.ruth2.xhtml
 │   │   └── zdata.ruth.xml
 │   └── zdata.ruth.xml
 └── place_2
     ├── data.ruth.xml
     ├── index.ruth2.xhtml
     ├── time_1
     │   ├── data.ruth.xml
     │   └── index.ruth2.xhtml
     └── time_2
         ├── data.ruth.xml
         └── index.ruth2.xhtml
```

The top-level file `default.in.xml` gives the default animal and bird for a
given time and place:

```
<animal>snake</animal>
<bird>owl</bird>
```

### Copying data using `ruth:data`

The various `data.ruth.xml` files each contain an `animal` element and a
`bird` element. Each either contains a literal value, or fetches the data
from the level above, with an XQuery expression embedded in braces, such as:

```
{ruth:data('bird')}
```

This uses the built-in `ruth:data` function to interpolate the contents of
the nearest `bird` element that occurs in the child of an ancestor of the
current file’s parent. This means that it cannot match the file itself, so
it doesn’t get into a loop.

### Querying with `ruth:query` and multi-phase templating

We also want to produce a web page corresponding to each place and time. We
need to query the data for this. We can't conveniently use `ruth:data`, as
that will not fetch data elements at the same level in the hierarchy, and
each web page `index.ruth2.xhtml` is at the same level as the corresponding
`data.xml`. Instead, we use the similar function `ruth:query`, which is just
like `ruth:data`, but starts at the same level as the file being expanded,
rather than at its parent. But that should cause a loop!

To avoid looping, we expand the web page templates after the data templates.
Remember, Ruth updates its internal XML document as it goes, so after all
the data templates have been expanded, they will contain only literal
values. The `2` in the file name `index.ruth2.xhtml` indicates that the file
will be processed in phase 2 (files without a number are processed in phase
0).

The contents of a typical `index.ruth2.xhtml` file is:

```
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<title>Creatures</title>
</head>
<body>
  <ul>
    <li>Animal: {ruth:query('animal')}</li>
    <li>Bird: {ruth:query('bird')}</li>
  </ul>
</body>
</html>
```

The calls to `ruth:query` paste the values of the `animal` and `bird`
elements “nearest” to the file; in our case, those in the same directory.

For `place_1/time_1`, the result is:

```
<html xmlns="http://www.w3.org/1999/xhtml">
    <head>
        <title>
            Creatures
        </title>
    </head>
    <body>
        <ul>
            <li>
                Animal: badger
            </li>
            <li>
                Bird: owl
            </li>
        </ul>
    </body>
</html>
```
