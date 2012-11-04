#!/bin/bash

# ./test.sh 127.0.0.1 5000

host=$1
port=$2

node bench.js starter 1 30 $host $port x x

node bench.js httpload 20 15 $host $port 1 1 &
node bench.js checker   1 15 $host $port 1 1 &
node bench.js buyer     5 15 $host $port 1 1 &
node bench.js buyer     5 15 $host $port 1 1 &

wait
