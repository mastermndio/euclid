import * as aws from "@pulumi/aws";
import { myBucket } from "./buckets";

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
    policy: {
        Version: "2012-10-17",
        Statement: [{
            Action: [
                "s3:PutObject",
                "s3:GetObject",
                "s3:ListBucket",
                "s3:DeleteObject"
            ],
            Resource: [
                myBucket.arn,                // Bucket ARN
                `${myBucket.arn}/*`          // All objects inside the bucket
            ],
            Effect: "Allow"
        }]
    }
});

const policyAttachment = new aws.iam.RolePolicyAttachment("s3BucketAccessPolicyAttachment", {
    policyArn: s3BucketAccessPolicy.arn,
    role: ecsTaskRole.name
});