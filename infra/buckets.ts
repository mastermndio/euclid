import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

export const myBucket = new aws.s3.Bucket("euclidBucket", {
    acl: "private",  // Access Control List
    tags: {
        Name: "Euclid Output Bucket",
        Environment: pulumi.getStack()
    }
});

// Optional: Export the bucket's ARN and name
export const bucketArn = myBucket.arn;
export const bucketName = myBucket.id;
