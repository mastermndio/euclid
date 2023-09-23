import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { stateMachine, sfnExecutionRole } from "./stateMachine";
import * as AWS from "aws-sdk";


export const restApi = new aws.apigateway.RestApi("my-api", {
    description: "My API Gateway that triggers a state machine",
    endpointConfiguration: {
        types: "REGIONAL"
    }
});

export const resource = new aws.apigateway.Resource("my-resource", {
    restApi: restApi.id,
    parentId: restApi.rootResourceId,
    pathPart: "euclid"
});

export const integration = new aws.apigateway.Integration("my-integration", {
    restApi: restApi.id,
    resourceId: resource.id,
    httpMethod: "POST",
    integrationHttpMethod: "POST",
    type: "AWS",
    uri: pulumi.interpolate`arn:aws:apigateway:${aws.config.region}:states:action/StartExecution`,
    credentials: sfnExecutionRole.arn,
    requestTemplates: {
        "application/json": stateMachine.arn.apply(arn => 
            `{"input": "$util.escapeJavaScript($input.json('$'))", "name": "MyExecutionName", "stateMachineArn": "${arn}"}`)
    }
});

export const method = new aws.apigateway.Method("my-method", {
    restApi: restApi.id,
    resourceId: resource.id,
    httpMethod: "POST",
    authorization: "NONE"
});

// 3. Integrate the API Gateway with the Step Functions State Machine.

export const policyDocument = pulumi.all([restApi.executionArn, stateMachine.arn]).apply(([executionArn, stateMachineArn]) => {
    return JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Effect: "Allow",
            Action: "states:StartExecution",
            Resource: stateMachineArn,
            Condition: {
                ArnEquals: {
                    "aws:SourceArn": executionArn
                }
            }
        }]
    });
});

export const deployment = new aws.apigateway.Deployment("my-deployment", {
    restApi: restApi,
    stageName: "prod", // or another preferred name for the stage
    // If you've added/modified resources/methods, you should always force a new deployment to avoid caching issues.
    // This is a Pulumi trick to always redeploy if something in the API Gateway changes.
    variables: {
        deploymentTimestamp: Date.now().toString()
    }
}, {
    dependsOn: [integration]
});


export const apiUrl = deployment.invokeUrl;

export const policy = new aws.iam.Policy("api-gateway-sfn-policy", {
    policy: policyDocument
});

export const rolePolicyAttachment = new aws.iam.RolePolicyAttachment("attach-policy-to-role", {
    role: sfnExecutionRole.name,
    policyArn: policy.arn
});

export const apiGatewayUrl = restApi.executionArn;

// // Create a CloudWatch Log Group
// export const logGroup = new aws.cloudwatch.LogGroup("apiGatewayLogGroup");

// // IAM policy for logging
// export const loggingPolicy = new aws.iam.Policy("apiGatewayLoggingPolicy", {
//     policy: logGroup.arn.apply(arn => JSON.stringify({
//         Version: "2012-10-17",
//         Statement: [{
//             Effect: "Allow",
//             Action: [
//                 "logs:CreateLogStream",
//                 "logs:PutLogEvents"
//             ],
//             Resource: arn
//         }]
//     }))
// });

// export const policyAttachment = new aws.iam.RolePolicyAttachment("apiGatewayLoggingAttachment", {
//     role: sfnExecutionRole.name, // Assuming you named your role 'apiGatewayRole'
//     policyArn: loggingPolicy.arn
// });


// // Enable logging for the API Gateway Deployment
// export const stage = new aws.apigateway.Stage("apiStage", {
//     restApi: restApi, // reference to your API Gateway
//     deployment: deployment, // reference to your API Gateway deployment
//     stageName: "dev",
//     accessLogSettings: {
//         destinationArn: logGroup.arn,
//         format: '{"requestId":"$context.requestId", "ip": "$context.identity.sourceIp", "caller":"$context.identity.caller", "user":"$context.identity.user","requestTime":"$context.requestTime","httpMethod":"$context.httpMethod","resourcePath":"$context.resourcePath","status":"$context.status","protocol":"$context.protocol","responseLength":"$context.responseLength"}'
//     },
// });
