#!/usr/bin/env perl
use strict;
use warnings;

use FindBin;
use lib "$FindBin::Bin/lib";
use lib "$FindBin::Bin/extlib/lib/perl5";

use Isucon2;
use Plack::Builder;

my $isucon2 = Isucon2->new;
builder {
    enable 'Static',
        path => qr!^/(?:(?:css|js|images)/|favicon\.ico$)!,
        root => $isucon2->root_dir . '/public';
    $isucon2->psgi;
};
