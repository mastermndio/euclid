import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

// Create Bucket to store input/output
export const createS3Bucket = (bucketName) => {
    const euclidBucket = new aws.s3.Bucket(bucketName, {
        acl: "private",
        tags: {
            Name: "Euclid Output Bucket",
            Environment: pulumi.getStack()
        }
    });

    return {
        euclidBucket
    }
};
