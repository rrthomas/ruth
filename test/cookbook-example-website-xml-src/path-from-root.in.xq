module namespace ruth = "https://github.com/rrthomas/ruth/raw/master/ruth.dtd";
declare variable $path as xs:string external;
declare %public function ruth:path-from-root($relpath as xs:string) as xs:string {
  concat(string-join((for $_ in 1 to count(tokenize($path, '/')) return '..'), '/'), '/', $relpath)
};
