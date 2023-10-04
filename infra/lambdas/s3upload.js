const AWS = require('aws-sdk');
const s3 = new AWS.S3();

exports.handler = async (event) => {
    if (!Number.isInteger(parseInt(event.a)) || !Number.isInteger(parseInt(event.b))) {
        throw new Error(`You provided ${event.a} and ${event.b} as input. Please provide a valid integer`)
    }
    let timestamp = new Date().toISOString();

    const s3Bucket = process.env.S3_BUCKET;
    const s3Key = `input/${timestamp}.json`;

    await s3.putObject({
        Bucket: s3Bucket,
        Key: s3Key,
        Body: JSON.stringify(event), 
        ContentType: "application/json"
    }).promise();


    return {
        message: "Successfully uploaded to S3",
        bucket: s3Bucket,
        key: s3Key,
        num1: event.a.toString(),
        num2: event.b.toString()
    };
};
