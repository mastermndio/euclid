import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { RestAPI } from "@pulumi/aws-apigateway";

const provider = new aws.Provider("provider", {
    region: "us-east-1"  // Replace with your desired region.
});


/*
S3 BUCKET CONFIGURATION
*/

export const myBucket = new aws.s3.Bucket("euclidBucket", {
    acl: "private",  // Access Control List
    tags: {
        Name: "Euclid Output Bucket",
        Environment: pulumi.getStack()
    }
});

/*
ESC TASK CONFIGURATION
*/

const cluster = new aws.ecs.Cluster("dev");

const ecsTaskRole = new aws.iam.Role("ecsTaskRole", {
    assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Principal: {
                Service: "ecs-tasks.amazonaws.com"
            }
        }]
    })
});

const taskDefinition = new aws.ecs.TaskDefinition("my-task", {
    family: "my-task-family",
    cpu: "256",
    memory: "512",
    networkMode: "awsvpc",
    requiresCompatibilities: ["FARGATE"],
    executionRoleArn: ecsTaskRole.arn,
    containerDefinitions: JSON.stringify([{
        name: "euclid",
        image: "httpd",
        memory: 128,
        cpu: 128,
        essential: true,
        portMappings: [{
            containerPort: 80
        }]
    }])
});

const s3BucketAccessPolicy = new aws.iam.Policy("s3BucketAccessPolicy", {
    description: "Allows ECS tasks to read and write to the specified S3 bucket",
    policy: myBucket.arn.apply(arn => JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Action: [
                "s3:PutObject",
                "s3:GetObject",
                "s3:ListBucket",
                "s3:DeleteObject"
            ],
            Resource: [
                arn,         // Bucket ARN
                `${arn}/*`   // All objects inside the bucket
            ],
            Effect: "Allow"
        }]
    }))
});

const policyAttachment = new aws.iam.RolePolicyAttachment("s3BucketAccessPolicyAttachment", {
    policyArn: s3BucketAccessPolicy.arn,
    role: ecsTaskRole.name
});

/*
STATE MACHINE CONFIG START
*/

// IAM role for execution of state machine
export const sfnExecutionRole = new aws.iam.Role("sfn-execution-role", {
    assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
            {
                Effect: "Allow",
                Principal: {
                    Service: "apigateway.amazonaws.com"
                },
                Action: "sts:AssumeRole"
            },
            {
                Effect: "Allow",
                Principal: {
                    Service: "states.amazonaws.com"
                },
                Action: "sts:AssumeRole"
            }
        ]
    })
});

const sfnExecutionPolicy = new aws.iam.Policy("sfnExecutionPolicy", {
    description: "Allows Step Function to create and manage EventBridge rules",
    policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
            {
                Action: [
                    "events:PutRule",
                    "events:PutTargets",
                    "events:DescribeRule",
                    "events:DeleteRule",
                    // You might need more permissions depending on the operations you're performing in your Step Function
                ],
                Resource: "*",
                Effect: "Allow"
            },
        ],
    }),
});

const snfPolicyAttachment = new aws.iam.PolicyAttachment("sfnExecutionPolicyAttachment", {
    policyArn: sfnExecutionPolicy.arn,
    roles: [sfnExecutionRole],
});
// Define the state machine definition
// export const definition = `{
//     "Comment": "A Hello World example of the Amazon States Language using a Pass state",
//     "StartAt": "HelloWorld",
//     "States": {
//         "HelloWorld": {
//             "Type": "Pass",
//             "Result": "Hello, World!",
//             "End": true
//         }
//     }
// }`;

// Create a CloudWatch Log Group for the State Machine
export const sfnLogGroup = new aws.cloudwatch.LogGroup("sfnLogGroup");

// IAM policy to allow state machine to write logs
export const sfnLoggingPolicy = new aws.iam.Policy("sfnLoggingPolicy", {
    policy: sfnLogGroup.arn.apply(arn => JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Effect: "Allow",
            Action: [
                "logs:CreateLogDelivery",
                "logs:GetLogDelivery",
                "logs:UpdateLogDelivery",
                "logs:DeleteLogDelivery",
                "logs:ListLogDeliveries",
                "logs:PutResourcePolicy",
                "logs:DescribeResourcePolicies",
                "logs:DescribeLogGroups",
                "logs:CreateLogStream",
                "logs:PutLogEvents"
            ],
            Resource: "*"
        }]
    }))
});

export const sfnLoggingPolicyAttachment = new aws.iam.RolePolicyAttachment("sfnLoggingAttachment", {
    role: sfnExecutionRole.name,  // Adjust this to the name or reference of your state machine's execution role
    policyArn: sfnLoggingPolicy.arn
});

// Fetch default VPC
const defaultVpc = aws.ec2.getVpc({ default: true });

// Fetch default subnets for the default VPC
const defaultSubnetIds = defaultVpc.then(vpc => aws.ec2.getSubnetIds({ vpcId: vpc.id }));

const stateMachineDefinition = defaultSubnetIds.then(subnets => JSON.stringify({
    StartAt: "RunEcsTask",
    States: {
      RunEcsTask: {
        Type: "Task",
        Resource: "arn:aws:states:::ecs:runTask.sync",
        Parameters: {
          LaunchType: "FARGATE",
          Cluster: cluster.arn,
          TaskDefinition: taskDefinition.arn,
          NetworkConfiguration: {
            AwsvpcConfiguration: {
              Subnets: subnets.ids, 
              AssignPublicIp: "ENABLED"
            }
          }
        },
        End: true
      }
    }
  }));

export const stateMachine = new aws.sfn.StateMachine("stateMachine", {
    definition: stateMachineDefinition, 
    roleArn: sfnExecutionRole.arn,
    loggingConfiguration: {
        level: "ALL",  // or "ERROR" to log only failed executions
        includeExecutionData: true,  // Includes input and output in logs
        logDestination: pulumi.interpolate`${sfnLogGroup.arn}:*`
    }
},{
    dependsOn: [sfnLogGroup]
});

export const sfnRolePolicy = new aws.iam.RolePolicy("sfn-role-policy", {
    role: sfnExecutionRole.id,
    policy: {
        Version: "2012-10-17",
        Statement: [{
            Effect: "Allow",
            Action: "states:StartExecution",
            Resource: stateMachine.arn
        }]
    }
});

/*
APIGATEWAY CONFIG START
*/
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


export const method = new aws.apigateway.Method("my-method", {
    restApi: restApi.id,
    resourceId: resource.id,
    httpMethod: "POST",
    authorization: "NONE"
});

// PLEASE DEPLOY IN US-EAST-1. 
export const integration = new aws.apigateway.Integration("my-integration", {
    restApi: restApi.id,
    resourceId: resource.id,
    httpMethod: "POST",
    integrationHttpMethod: "POST",
    type: "AWS",
    //uri: pulumi.interpolate`arn:aws:apigateway:${aws.config.region}:states:action/StartExecution`,
    uri: pulumi.interpolate`arn:aws:apigateway:us-east-1:states:action/StartExecution`,
    credentials: sfnExecutionRole.arn,
    requestTemplates: {
        "application/json": pulumi.interpolate`{"input": "$util.escapeJavaScript($input.json(\'$\'))", "stateMachineArn": "${stateMachine.arn}"}`
    }
}, { dependsOn: [method] });

// 3. Integrate the API Gateway with the Step Functions State Machine.

export const policyDocument = pulumi.all([restApi.executionArn, stateMachine.arn]).apply(([executionArn, stateMachineArn]) => {
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

export const policy = new aws.iam.Policy("api-gateway-sfn-policy", {
    policy: policyDocument
});


export const deployment = new aws.apigateway.Deployment("my-deployment", {
    restApi: restApi,
    stageName: "prod", // or another preferred name for the stage
    // If you've added/modified resources/methods, you should always force a new deployment to avoid caching issues.
    // This is a Pulumi trick to always redeploy if something in the API Gateway changes.
    variables: {
        deploymentTimestamp: Date.now().toString()
    }
}, { dependsOn: [integration] });


export const apiUrl = deployment.invokeUrl;


export const rolePolicyAttachment = new aws.iam.RolePolicyAttachment("attach-policy-to-role", {
    role: sfnExecutionRole.name,
    policyArn: policy.arn
});

export const apiGatewayUrl = restApi.executionArn;

const response200 = new aws.apigateway.MethodResponse("response200", {
    restApi: restApi.id,
    resourceId: resource.id,
    httpMethod: method.httpMethod,
    statusCode: "200",
});

export const integrationResponse = new aws.apigateway.IntegrationResponse("my-integration-response", {
    restApi: restApi,
    resourceId: resource.id,
    httpMethod: "POST",
    statusCode: response200.statusCode,
    responseTemplates: {
        "application/json": ""
    }
}, { dependsOn: [integration]});




export const outputApiGatewayUrl = apiGatewayUrl;
export const outputStateMachineArn = stateMachine.arn;
export const outputApiUrl = apiUrl;
export const outputBucketArn = myBucket.arn;
export const outputBucketName = myBucket.id;