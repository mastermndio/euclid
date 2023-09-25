import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";


const config = new pulumi.Config()
const euclidImageName = config.require("imageName")
const region = config.require("region")

/*
S3 BUCKET CONFIGURATION BEGIN
*/

// Create Bucket to store input/output
const euclidBucket = new aws.s3.Bucket("euclidBucket", {
    acl: "private",
    tags: {
        Name: "Euclid Output Bucket",
        Environment: pulumi.getStack()
    }
});

/*
S3 BUCKET CONFIGURATION END
*/


/*
ESC TASK CONFIGURATION BEGIN
*/

const cluster = new aws.ecs.Cluster("dev");

const ecsExecutionRole = new aws.iam.Role("ecsExecutionRole", {
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
    family: "euclid-service",
    cpu: "256",
    memory: "512",
    networkMode: "awsvpc",
    requiresCompatibilities: ["FARGATE"],
    executionRoleArn: ecsExecutionRole.arn,
    taskRoleArn: ecsTaskRole.arn,
    containerDefinitions: JSON.stringify([{
        name: "euclid",
        image: euclidImageName,
        memory: 128,
        cpu: 128,
        essential: true,
        logConfiguration: {
            logDriver: "awslogs",
            options: {
                "awslogs-group": "euclid-container",
                "awslogs-region": "us-east-1",
                "awslogs-create-group": "true",
                "awslogs-stream-prefix": "euclid"
            }
        }
    }])
});

const s3BucketAccessPolicy = new aws.iam.Policy("s3BucketAccessPolicy", {
    description: "Allows ECS tasks to read and write to the specified S3 bucket",
    policy: euclidBucket.arn.apply(arn => JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Action: [
                "s3:Put*",
                "s3:Get*",
                "s3:List*",
                "s3:Delete*"
            ],
            Resource: [
                arn,     
                `${arn}/*`
            ],
            Effect: "Allow"
        }]
    }))
});


const ecsRunTaskPolicy = pulumi.all([taskDefinition.arn, ecsExecutionRole.arn, ecsTaskRole.arn]).apply(([taskDefArn, ecsExecutionRoleArn, ecsTaskRoleArn]) => {
//const ecsRunTaskPolicy = taskDefinition.arn.apply(arn => {
    return new aws.iam.Policy("ecsRunTaskPolicy", {
        description: "Permission to run ECS tasks",
        policy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
                {
                    Effect: "Allow",
                    Action: "ecs:RunTask",
                    Resource: taskDefArn
                },
                {
                    Effect: "Allow",
                    Action: "iam:PassRole",
                    Resource: [
                        ecsExecutionRoleArn,
                        ecsTaskRoleArn
                    ]
                },
            ]
        })
    });
});

/*
ESC TASK CONFIGURATION END
*/



/*
STATE MACHINE CONFIGURATION START
*/

// IAM role for execution of state machine
const sfnExecutionRole = new aws.iam.Role("sfn-execution-role", {
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
            },
            {
                Effect: "Allow",
                Principal: {
                    Service: "lambda.amazonaws.com"
                },
                Action: "sts:AssumeRole"
            },
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

const sfnPolicyAttachment = new aws.iam.PolicyAttachment("sfnExecutionPolicyAttachment", {
    policyArn: sfnExecutionPolicy.arn,
    roles: [sfnExecutionRole],
});
;

const ecsRolePolicyAttachment = new aws.iam.RolePolicyAttachment("ecsRolePolicyAttachment", {
    role: sfnExecutionRole,
    policyArn: ecsRunTaskPolicy.arn
}, { dependsOn: [sfnExecutionRole] });

const ecsExecutionRolePolicyAttachment = new aws.iam.RolePolicyAttachment("ecsExecutionRolePolicyAttachment", {
    role: ecsExecutionRole,
    policyArn: ecsRunTaskPolicy.arn
});

// Create a CloudWatch Log Group for the State Machine
const sfnLogGroup = new aws.cloudwatch.LogGroup("sfnLogGroup");

// IAM policy to allow state machine to write logs
const sfnLoggingPolicy = new aws.iam.Policy("sfnLoggingPolicy", {
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
                "logs:CreateLogGroup",
                "logs:PutLogEvents"
            ],
            Resource: "*"
        }]
    }))
});

const sfnLoggingPolicyAttachment = new aws.iam.RolePolicyAttachment("sfnLoggingAttachment", {
    role: sfnExecutionRole.name,  // Adjust this to the name or reference of your state machine's execution role
    policyArn: sfnLoggingPolicy.arn
});

const ecsLoggingPolicyAttachment = new aws.iam.RolePolicyAttachment("ecsLoggingAttachment", {
    role: ecsExecutionRole.name,  // Adjust this to the name or reference of your state machine's execution role
    policyArn: sfnLoggingPolicy.arn
});

// Fetch default VPC
const defaultVpc = aws.ec2.getVpc({ default: true });

// Fetch default subnets for the default VPC
const defaultSubnetIds = defaultVpc.then(vpc => aws.ec2.getSubnetIds({ vpcId: vpc.id }));

const lambdaExecutionRole = new aws.iam.Role("lambdaExecutionRole", {
    assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Action: "sts:AssumeRole",
            Principal: {
                Service: "lambda.amazonaws.com"
            },
            Effect: "Allow",
            Sid: ""
        }]
    })
});

const LambdaS3policyAttachment = new aws.iam.RolePolicyAttachment("LambdaS3PolicyAttachment", {
    policyArn: s3BucketAccessPolicy.arn,
    role: lambdaExecutionRole.name
});

const LambdaExecutionPolicyAttachment = new aws.iam.RolePolicyAttachment("lambdaExecutionPolicyAttachment", {
    policyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    role: lambdaExecutionRole.name
});


const s3UploadLambda = new aws.lambda.Function("s3UploadLambda", {
    runtime: "nodejs16.x" ,
    code: new pulumi.asset.AssetArchive({
        ".": new pulumi.asset.FileArchive("./lambdas"),
    }),
    handler: "s3upload.handler",
    role: lambdaExecutionRole.arn, // Make sure this role has permissions to write to S3.
    environment: {
        variables: {
            S3_BUCKET: euclidBucket.bucket,
        },
    },
})

const lambdaInvokePolicy = new aws.iam.Policy("lambdaInvokePolicy", {
    policy: pulumi.interpolate`{
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Action": "lambda:InvokeFunction",
            "Resource": "${s3UploadLambda.arn}"
        }]
    }`
});

const lambdaInvokePolicyAttachment = new aws.iam.PolicyAttachment("lambdaInvokePolicyAttachment", {
    policyArn: lambdaInvokePolicy.arn,
    roles: [sfnExecutionRole]
});


const stateMachineDefinition = pulumi.all([defaultSubnetIds, s3UploadLambda.arn, cluster.arn, taskDefinition.arn, region]).apply(([subnets, lambdaArn, clusterArn, taskArn, region]) => {
    return JSON.stringify({
        StartAt: "S3Upload",
        States: {
            S3Upload: {
                Type: "Task",
                Resource: lambdaArn,
                Next: "RunEcsTask"
            },
            RunEcsTask: {
                Type: "Task",
                Resource: "arn:aws:states:::ecs:runTask.sync",
                Parameters: {
                    LaunchType: "FARGATE",
                    Cluster: clusterArn,
                    TaskDefinition: taskArn,
                    NetworkConfiguration: {
                        AwsvpcConfiguration: {
                            Subnets: subnets.ids,
                            AssignPublicIp: "ENABLED"
                        }
                    },
                    Overrides: {
                        ContainerOverrides:[{
                            Name: "euclid",
                            Environment:[
                              {
                                Name: "NUM1",
                                "Value.$":"$.num1"
                              },
                              {
                                Name: "NUM2",
                                "Value.$":"$.num2"
                              },
                              {
                                Name: "BUCKET",
                                "Value.$":"$.bucket"
                              },
                              {
                                Name: "KEY",
                                "Value.$":"$.key"
                              },
                              {
                                Name: "REGION",
                                Value: region
                              }

                            ]
                        }]
                    }
                },
                End: true
            }
        }
    });
});

const stateMachine = new aws.sfn.StateMachine("stateMachine", {
    definition: stateMachineDefinition, 
    roleArn: sfnExecutionRole.arn,
    loggingConfiguration: {
        level: "ALL",  // or "ERROR" to log only failed executions
        includeExecutionData: true,  // Includes input and output in logs
        logDestination: pulumi.interpolate`${sfnLogGroup.arn}:*`
    }
},{
    dependsOn: [sfnLogGroup, s3UploadLambda, euclidBucket]
});

const sfnRolePolicy = new aws.iam.RolePolicy("sfn-role-policy", {
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

const SfnS3policyAttachment = new aws.iam.RolePolicyAttachment("SfnS3PolicyAttachment", {
    policyArn: s3BucketAccessPolicy.arn,
    role: sfnExecutionRole.name
});

const s3EcsBucketAccessPolicyAttachment = new aws.iam.RolePolicyAttachment("s3EcsBucketAccessPolicyAttachment", {
    policyArn: s3BucketAccessPolicy.arn,
    role: ecsTaskRole.name
},{ dependsOn: [s3BucketAccessPolicy, ecsTaskRole] });

/*
STATE MACHINE CONFIGURATION END
*/


/*
APIGATEWAY CONFIG START
*/
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

// PLEASE DEPLOY IN US-EAST-1. 
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

/*
APIGATEWAY CONFIGURATION END
*/


export const outputApiUrl = apiStageDeployment.invokeUrl;
export const outputBucketName = euclidBucket.id;
export const outputServiceEndpoint = pulumi.interpolate`${outputApiUrl}/euclid"`;
