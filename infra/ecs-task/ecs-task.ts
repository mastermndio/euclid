import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";


const config = new pulumi.Config()
const euclidImageName = config.require("imageName")

export const createEcsTask = (euclidBucket) => {
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

    return {
        cluster,
        s3BucketAccessPolicy,
        ecsRunTaskPolicy,
        ecsExecutionRole,
        ecsTaskRole,
        taskDefinition
    };
};