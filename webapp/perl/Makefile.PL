use inc::Module::Install;
name 'Isucon2';
all_from 'lib/Isucon2.pm';

requires 'Kossy'       => '0.12';
requires 'DBIx::Sunny' => '0.17';
requires 'DBD::mysql'  => '4.022';
requires 'Starman'     => '0.3003';

WriteAll;
