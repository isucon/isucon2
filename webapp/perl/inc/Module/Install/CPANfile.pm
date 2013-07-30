#line 1
package Module::Install::CPANfile;

use strict;
use 5.008_001;
our $VERSION = '0.12';

use Module::CPANfile;
use base qw(Module::Install::Base);

sub merge_meta_with_cpanfile {
    my $self = shift;

    require CPAN::Meta;

    my $file = Module::CPANfile->load;

    if ($self->is_admin) {
        # force generate META.json
        CPAN::Meta->load_file('META.yml')->save('META.json');

        print "Regenerate META.json and META.yml using cpanfile\n";
        $file->merge_meta('META.yml');
        $file->merge_meta('META.json');
    }

    for my $metafile (grep -e, qw(MYMETA.yml MYMETA.json)) {
        print "Merging cpanfile prereqs to $metafile\n";
        $file->merge_meta($metafile);
    }
}

sub cpanfile {
    my($self, %options) = @_;

    $self->dynamic_config(0) unless $options{dynamic};

    my $write_all = \&::WriteAll;

    *main::WriteAll = sub {
        $write_all->(@_);
        $self->merge_meta_with_cpanfile;
    };

    $self->configure_requires("CPAN::Meta");

    if ($self->is_admin) {
        $self->admin->include_one_dist("Module::CPANfile");
        if (eval { require CPAN::Meta::Check; 1 }) {
            my $prereqs = Module::CPANfile->load->prereqs;
            my @err = CPAN::Meta::Check::verify_dependencies($prereqs, [qw/runtime build test develop/], 'requires');
            for (@err) {
                warn "Warning: $_\n";
            }
        } else {
            warn "CPAN::Meta::Check is not installed. Skipping dependencies check for the author.\n";
        }
    }
}

1;
__END__

=encoding utf-8

#line 149
