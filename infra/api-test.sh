#!/bin/bash

# Quick and Dirty test script for testing euclid API endpoint
URL=$(pulumi stack output outputServiceEndpoint)
BUCKET=$(pulumi stack output outputBucketName)
NUM1=$1
NUM2=$2

RUN="$(curl -X POST \
-H 'Content-Type: application/json' \
-d "{ \"a\": \"$NUM1\", \"b\": \"$NUM2\" }" \
$URL)"

ARN="$(echo $RUN | jq -r .executionArn)"

STATUS="$(aws stepfunctions describe-execution --execution-arn $ARN | jq -r '.status')"


while [[ $STATUS != "SUCCEEDED" ]]
do
    if [[ $STATUS == "RUNNING" ]]; then
        echo "State machine is currently running..."
    elif [[ $STATUS == "FAILED" ]]; then
        echo "State machine execution failed"
        break
    fi

    sleep 10
    STATUS="$(aws stepfunctions describe-execution --execution-arn $ARN | jq -r '.status')"
done

echo "State machine execution successful! Downloading output..."
KEY="$(aws stepfunctions describe-execution --execution-arn $ARN | jq -r '.output' | jq -r '.Overrides.ContainerOverrides[0].Environment[3].Value')"
aws s3 cp s3://$BUCKET/output/${KEY#*/} . 


