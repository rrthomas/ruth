module namespace ruth = "https://github.com/rrthomas/ruth/raw/master/ruth.dtd";
declare namespace dirtree = "https://github.com/rrthomas/ruth/raw/master/dirtree.dtd";

(:~
 : Inject global variables into the ruth namespace.
 : FIXME: This works around lack of direct support in fontoxpath; see
 : https://github.com/FontoXML/fontoxpath/issues/381
 :)
declare variable $root as xs:string external;
declare variable $ruth:root := $root;

declare variable $path as xs:string external;
declare variable $ruth:path := $path;

declare variable $element external;
declare variable $ruth:element := $element;

declare function ruth:eval($query as xs:string) as node() external;

(:~
 : Include a file from the Ruth XML document at the call-site
 :
 : @param   $file the basename of the file to include
 :)
declare function ruth:include($file as xs:string) as node()
  {ruth:eval('(ancestor::dirtree:directory/' || $file || ')[1]/node()')
};

(:~
 : Insert the contents of the first node of the given name in a file at or
 : above the current directory. Used to copy from literal data that does not
 : itself contain queries; it can insert a value from a file in the same
 : directory as the caller.
 :
 : @param   $datum the name of the node whose contents should be included
 :)
declare function ruth:query($datum as xs:string) as node()
  {ruth:eval('(ancestor::dirtree:directory/*/' || $datum || ')[1]/node()')
};

(:~
 : Insert the contents of the first node of the given name in a file above
 : the current directory. Typically used to specialize data that may contain
 : further XQuery calls; starting at the parent level avoids loops.
 :
 : @param   $datum the name of the node whose contents should be included
 :)
declare function ruth:data($datum as xs:string) as node()
  {ruth:eval('(parent::*/ancestor::dirtree:directory/*/' || $datum ||
  ')[1]/node()')
};

(:~
 : Join the given path components into a path string
 :
 : @param   $components the path components
 :)
declare function ruth:path-join($components as xs:string*) as xs:string {
  string-join(
    for $component in $components
      where $component != ''
      return $component,
    '/'
  )
};

(:~
 : Return the the relative path from $ruth:path to $path
 :
 : @param   $path a path relative to $root
 :)
declare function ruth:relative-path($path as xs:string) as xs:string {
  ruth:path-join((for $_ in 1 to count(tokenize($ruth:path, '/')) return '..', $path))
};

(:~
 : Return the relative path from $ruth:element to $element
 :
 : @param   $element the path to an element
 :)
declare function ruth:relative-path-to-element($elem as element()) as xs:string {
  ruth:path-join((for $_ in 2 to count($ruth:element/ancestor::dirtree:directory) return '..',
                 $elem/ancestor::dirtree:directory[1]/@dirtree:path))
};