#!/bin/sh
export PATH=$HOME/.nodebrew/current/bin:$PATH
export PATH="$PERL_PATH:$RUBY_PATH:$PYTHON_PATH:$NODE_PATH:/usr/local/go/bin:$PATH"
# source ~/perl5/perlbrew/etc/bashrc
# [[ -s "$HOME/.pythonbrew/etc/bashrc" ]] && source "$HOME/.pythonbrew/etc/bashrc"
export PATH="$HOME/.rbenv/bin:$PATH"
eval "$(rbenv init -)"

# application environment
export PLACK_ENV=production
export RACK_ENV=production
export NODE_ENV=production

# isucon env
export ISUCON_ENV=production

# exec
exec "$@"
