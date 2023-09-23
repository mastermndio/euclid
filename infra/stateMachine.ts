import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

// 1. Define the State Machine using AWS Step Functions.

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

// Define the state machine definition
export const definition = `{
    "Comment": "A Hello World example of the Amazon States Language using a Pass state",
    "StartAt": "HelloWorld",
    "States": {
        "HelloWorld": {
            "Type": "Pass",
            "Result": "Hello, World!",
            "End": true
        }
    }
}`;



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


export const stateMachine = new aws.sfn.StateMachine("stateMachine", {
    definition: definition,  // Your state machine definition here
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