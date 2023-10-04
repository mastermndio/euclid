import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

const config = new pulumi.Config()
const region = config.require("region")

export const createApiGateway = (sfnExecutionRole: aws.iam.Role, stateMachine: aws.sfn.StateMachine) => {
    const restApi = new aws.apigateway.RestApi("my-api", {
        description: "My API Gateway that triggers a state machine",
        endpointConfiguration: {
            types: "REGIONAL"
        }
    });

    const apiResource = new aws.apigateway.Resource("apiResource", {
        restApi: restApi.id,
        parentId: restApi.rootResourceId,
        pathPart: "euclid"
    });


    const method = new aws.apigateway.Method("my-method", {
        restApi: restApi.id,
        resourceId: apiResource.id,
        httpMethod: "POST",
        authorization: "NONE"
    });

    const integration = new aws.apigateway.Integration("my-integration", {
        restApi: restApi.id,
        resourceId: apiResource.id,
        httpMethod: "POST",
        integrationHttpMethod: "POST",
        type: "AWS",
        uri: pulumi.interpolate`arn:aws:apigateway:${region}:states:action/StartExecution`,
        credentials: sfnExecutionRole.arn,
        requestTemplates: {
            "application/json": pulumi.interpolate`{"input": "$util.escapeJavaScript($input.json(\'$\'))", "stateMachineArn": "${stateMachine.arn}"}`
        }
    }, { dependsOn: [method] });


    const stateMachinPolicyDocument = pulumi.all([restApi.executionArn, stateMachine.arn]).apply(([executionArn, stateMachineArn]) => {
        return JSON.stringify({
            Version: "2012-10-17",
            Statement: [{
                Effect: "Allow",
                Action: "states:*",
                Resource: stateMachineArn,
                Condition: {
                    ArnEquals: {
                        "aws:SourceArn": executionArn
                    }
                }
            }]
        });
    });

    const apiGatewaySfnPolicy = new aws.iam.Policy("api-gateway-sfn-policy", {
        policy: stateMachinPolicyDocument
    });


    const apiStageDeployment = new aws.apigateway.Deployment("api-stage-deployment", {
        restApi: restApi,
        stageName: "prod",
    }, { dependsOn: [integration] });


    const rolePolicyAttachment = new aws.iam.RolePolicyAttachment("attach-policy-to-role", {
        role: sfnExecutionRole.name,
        policyArn: apiGatewaySfnPolicy.arn
    });


    const response200 = new aws.apigateway.MethodResponse("response200", {
        restApi: restApi.id,
        resourceId: apiResource.id,
        httpMethod: method.httpMethod,
        statusCode: "200",
    });

    const integrationResponse = new aws.apigateway.IntegrationResponse("integration-response", {
        restApi: restApi,
        resourceId: apiResource.id,
        httpMethod: "POST",
        statusCode: response200.statusCode,
        responseTemplates: {
            "application/json": ""
        }
    }, { dependsOn: [integration]});

    return {
            restApi,
            apiStageDeployment
    };
};