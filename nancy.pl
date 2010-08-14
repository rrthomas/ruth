#!/usr/bin/perl
my $version = <<'END';
nancy $Revision$ ($Date$)
(c) 2002-2010 Reuben Thomas (rrt@sc3d.org; http://rrt.sc3d.org/)
Distributed under the GNU General Public License version 3, or (at
your option) any later version. There is no warranty.
END

use strict;
use warnings;
use feature ":5.10";

use Config;
use File::Spec::Functions qw(catfile);
use File::Basename;
use File::Path;
use Getopt::Long;

use File::Slurp qw(slurp);
use WWW::Nancy;


# Get arguments
my ($version_flag, $help_flag);
my $prog = basename($0);
my $opts = GetOptions(
  "list-files" => \$WWW::Nancy::list_files_flag,
  "version" => \$version_flag,
  "help" => \$help_flag,
 );
die $version if $version_flag;
die <<END if !$opts || $#ARGV < 2 || $#ARGV > 3;
Usage: $prog SOURCES DESTINATION TEMPLATE [HOME]
The lazy web site maker

  --list-files, -l  list files read (on standard error)
  --version, -v     show program version
  --help, -h        show this help

  SOURCES is the source directory trees
  DESTINATION is the directory to which the output is written
  TEMPLATE is the name of the template fragment
  HOME is the home page of the site [default `index.html']
END

# FIXME: Use a module to add the boilerplate to the messages
sub Die { die "$prog: $_[0]\n"; }

Die("no source trees given") unless $ARGV[0];
my @roots = split /$Config{path_sep}/, $ARGV[0];
foreach (@roots) {
  Die("no such directory `$_'") unless -d $_;
  $_ =~ s|/+$||;
}
my $dest_root = $ARGV[1];
$dest_root =~ s|/+$||;
Die("`$dest_root' is not a directory")
  if -e $dest_root && !-d $dest_root;
my $template = $ARGV[2] or Die("no template given");
my $start = $ARGV[3] || "index.html";


# Expand source trees to the destination tree

# Write $contents to $file under $dest_root
sub write_file {
  my ($file, $contents) = @_;
  my $out_file = catfile($dest_root, @{$file});
  mkpath(dirname($out_file));
  open OUT, ">$out_file" or Die("could not write to `$out_file'");
  print OUT $contents;
  close OUT;
}

# Expand a page, recursively expanding links
sub expand_page {
  my ($path) = @_;
  # Don't expand the same node twice
  if (!stat(catfile($dest_root, @{$path}))) {
    my $node = WWW::Nancy::find_in_trees($path, @roots);
    # If we are looking at a non-leaf node, expand it
    if ($#$path != -1 && defined($node) && -d $node) {
      print STDERR catfile(@{$path}) . ":\n" if $WWW::Nancy::list_files_flag;
      my $out = WWW::Nancy::expand("\$include{$template}", $path, @roots);
      print STDERR "\n" if $WWW::Nancy::list_files_flag;
      write_file($path, $out);

      # Find all local links and add them to output (a local link is
      # one that doesn't start with a URI scheme)
      my @links = $out =~ /\Whref\s*=\s*\"(?![a-z]+:)([^\"\#]+)/g;
      push @links, $out =~ /\Wsrc\s*=\s*\"(?![a-z]+:)([^\"\#]+)/g;
      foreach my $link (@links) {
        # Remove current directory, which represents a page
        my @linkpath = WWW::Nancy::normalize_path(@{$path}[0..$#{$path} - 1], split "/", $link);
        if (defined(WWW::Nancy::find_in_trees(\@linkpath, @roots))) {
          no warnings qw(recursion); # We may recurse deeply
          expand_page(\@linkpath);
        } else {
          warn "Broken link from `" . catfile(@{$path}) . "' to `" . catfile(@linkpath) . "'\n";
        }
      }
    } else {
      my $node = WWW::Nancy::find_in_trees($path, @roots);
      my $contents = slurp($node) if defined($node);
      write_file($path, $contents) if $contents;
    }
  }
}

expand_page([$start]);
