module namespace ruth = "https://github.com/rrthomas/ruth/raw/master/ruth.dtd";
declare namespace dirtree = "https://github.com/rrthomas/ruth/raw/master/dirtree.dtd";

declare function ruth:eval($query as xs:string) as node() external;

declare %public function ruth:query($datum as xs:string) as node() {
  ruth:eval('(ancestor::dirtree:directory/*/' || $datum || ')[1]/node()')
};

declare %public function ruth:data($datum as xs:string) as node() {
  ruth:eval('(parent::*/ancestor::dirtree:directory/*/' || $datum || ')[1]/node()')
};
