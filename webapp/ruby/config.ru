require './app'

if defined?(Unicorn)
  require 'unicorn/oob_gc'
  use Unicorn::OobGC, 1, %r{\A/}
end

run Isucon2App
