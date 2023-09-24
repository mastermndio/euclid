#!/bin/bash

curl --header "Content-Type: application/json" \
-X POST \
--data '{"input": {"a": 2, "b": 4},"name":"scriptTest"}' \
"https://1gh8s6pmt8.execute-api.us-east-1.amazonaws.com/prod/euclid"